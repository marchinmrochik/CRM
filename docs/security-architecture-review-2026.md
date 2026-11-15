# Security and architecture review — November 2026

Review date: November 1, 2026. Deployment model: loopback-only, private single-owner Job Search OS. Internet publication remains deferred. This is an engineering review with regression evidence, not a claim of complete ASVS certification, regulatory compliance or a professional penetration test.

## Reference baseline

- [OWASP ASVS 5.0.0](https://asvs.owasp.org/), published May 30, 2025: verification categories and applicability assessment.
- [OWASP Top 10:2025](https://top10.owasp.org/2025/): risk prioritization, including supply-chain and exceptional-condition handling.
- OWASP cheat sheets for [sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [REST](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) and [containers](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html).
- [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/), [Node asynchronous scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), [Docker Compose reference](https://docs.docker.com/reference/compose-file/services/) and [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

The applicable target is the local application's core controls, informed by ASVS L1 and relevant L2 privacy/integrity requirements. No requirement-by-requirement full-level pass is asserted. Cloud IAM, public ingress, federation, billing and tenant isolation have not been implemented or assessed as available features.

## Assets and trust boundaries

| Boundary | Trust assumption | Controls |
| --- | --- | --- |
| Browser → web/API | All input is untrusted; a valid session is still required | Same-origin transport, strict cookies, owner check, CSRF Origin/client header, bounded schemas, rate limits |
| API → PostgreSQL | Runtime may perform application work, not administer the server | Dedicated non-superuser role; migrations retain a separate administrative connection |
| Worker → database/queue | Background tasks are trusted code; external content is untrusted | Operation leases/fencing, bounded work, Redis authentication, scoped environment and retry history |
| Providers → imported listings | Provider text, URLs and cursors are data | Fixed fetch destinations, no redirects, size/time limits, canonical attribution, plain-text rendering |
| PDF upload → parser/storage | MIME/header alone is insufficient | Bounded parser worker, size/page/time/memory limits, active-content checks, UUID storage keys and checksum verification |
| Optional AI → draft suggestions | Output is untrusted and cannot publish facts | Fixed host/no redirects, approved-fact contract, manual adoption, immutable published versions |
| Host filesystem → runtime | The owning OS account and Docker administrator are trusted | Private-path ACLs, Git/build-context exclusions, non-root app containers and restricted writable mounts |

The architecture remains a modular monolith with a durable worker. More services would not remove the identified trust-boundary problems. Large frontend components and some direct controller/database access remain maintainability concerns; the separate technical plan addresses their extraction. Existing owner predicates, submission snapshots, revision checks and fenced commits remain the relevant integrity boundaries.

## Findings and corrections

| Priority | Finding | Correction |
| --- | --- | --- |
| Critical dependency advisories | Installed Next.js was affected by published October 2026 advisories | Updated to 16.4.3. Disabled the unused image optimizer. Package applicability does not prove that an exploit occurred. |
| High/medium dependencies | Runtime and development graphs contained vulnerable request/parser/tooling dependencies | Updated stable NestJS, Prisma and Zod versions; pinned reviewed same-major security overrides. Audit both graphs, not only runtime dependencies. |
| Authentication resource use | Synchronous scrypt blocked the API event loop and used implicit parameters | Asynchronous scrypt with N=32768, r=8, p=3, 64 MiB allocation ceiling and at most two concurrent verifications. This matches an OWASP minimum scrypt configuration. |
| Session lifecycle | Server store touches could outlive the intended absolute authentication age | Enforced a 12-hour server-side authentication timestamp and exact owner identity. Invalid/legacy sessions are destroyed. Browser cache is cleared on protected-request 401. |
| Upload integrity | A `%PDF-` prefix could admit a fake/incomplete document | Structural parsing, EOF/page checks, rejected encryption/known active features, worker timeout/heap/concurrency bounds and multipart field/part limits. |
| Artifact retrieval | Downloads trusted the persisted storage key and file bytes | UUID-shaped keys only and SHA-256 verification before returning bytes. Downloads remain attachments outside public web storage. |
| Database privilege | Application services inherited initialization/admin credentials | Dedicated runtime login with no superuser, role/database creation, replication, RLS bypass or schema creation. Direct updates/deletes on evidence tables and writes to migration history are revoked. |
| Secrets distribution | Worker/migration environment included unrelated owner authentication secrets | Explicit per-service environments. Only the worker receives the optional AI key; API receives owner/session secrets; migration receives administrative DB credentials. |
| Redis access | The production queue had no password | Generated private Redis credentials and authenticated worker/health checks. Loopback exposure is retained. |
| Local file privacy | Windows inherited access allowed broad local groups to read/modify secrets | Restricted `.env`, `storage` and `backups` to the current account, SYSTEM and Administrators. Prior ACL descriptors are retained privately for recovery. |
| Browser policy | Web responses relied on API-only protection | Added web security headers, restricted embedding/object/base/form/connect policy and disabled framework branding. |
| Container privileges | App containers could modify their root filesystem and retained capabilities | Non-root runtime, read-only root, dropped capabilities, no-new-privileges, PID/CPU/memory limits and bounded tmpfs/cache mounts. Private artifact volumes remain writable. |
| CI supply chain | Mutable action tags and implicit token permissions | Official commit pins, read-only checkout token, no persisted credentials, job timeout, advisory gate and Dependabot configuration. No remote workflow run is claimed without an observed authorized push. |

The initial production audit returned 15 advisory entries: two critical, six high, five moderate and two low. After updates, the local production and complete dependency audits reported no known vulnerabilities. This is advisory-database evidence at review time, not proof that every dependency or base-image OS package is vulnerability-free.

## Initialization and maintenance

The owner password is unchanged. A pre-change backup was restored into an isolated database before privilege work. Existing sessions without the new authentication timestamp require signing in once after the update.

For a fresh local checkout, initialize `.env` using the root README, then:

```powershell
docker compose up --detach --wait postgres
docker compose --profile app build api worker migrate web
docker compose --profile app run --rm migrate
node scripts/runtime-role.mjs
docker compose --profile app up --no-build --detach --wait --wait-timeout 180
```

`runtime-role.mjs` provisions a dedicated role and stores new DB/Redis credentials privately in `.env`; it never prints them. It does not change the owner password or the database initialization account. Re-run after migrations so direct-write restrictions are reapplied to protected tables. API/worker placeholders deliberately fail to connect until runtime provisioning is complete; they do not fall back to administrative Compose credentials.

Host API/worker processes use runtime credentials when configured; Prisma's configuration deliberately uses the separate migration connection. Test wrappers explicitly override runtime credentials so `.env` cannot redirect test fixtures into personal data. The test bootstrap provisions an equivalent restricted role for API/worker browser checks, while test fixtures use the disposable administrative account.

On Windows, run `./scripts/protect-private-files.ps1` after creating/replacing private paths. It validates project paths and retains original descriptors in ignored `storage/runtime/private-acl-before.json`. Existing child files with protected, non-inherited ACLs need separate inspection. On other hosts, configure equivalent owner-only permissions. Disk encryption and OS account security remain host responsibilities.

## Verification boundaries

- Unit checks exercise password correctness/concurrency, absolute expiry, origin/cookie/configuration validation, fake/active/oversized PDFs and client session-expiry events.
- Integration checks exercise actual PostgreSQL role flags, required application privileges, denied schema changes and protected table permissions.
- Browser/API checks cover authentication cookies, expired session rejection, headers, fake PDF rejection, valid publication/upload/download, daily workflows and worker recovery under the restricted runtime role.
- Full coverage thresholds remain enabled; new branches must be tested rather than lowering the thresholds to hide them.
- Docker app hardening is also applied to the disposable stack. The personal workspace is restarted only after verification, preserving its database/artifacts.

## Observed local verification

- Final container builds succeeded for API, worker, migration and web images.
- 154 unit/component/database tests passed in 19 files; coverage remained above all configured thresholds (70.68% lines, 69.84% statements, 70.74% branches, 66.91% functions).
- All 11 Playwright browser/API scenarios passed against the isolated restricted-role stack. Its disposable containers and volume were removed afterwards.
- Lint and TypeScript checks passed. The final complete dependency audit reported no known vulnerabilities.
- The personal stack was updated successfully: PostgreSQL, authenticated Redis, API, worker and web were healthy. API/worker/web inspections confirmed non-root execution, read-only root filesystems, dropped capabilities, no-new-privileges and 768 MiB memory limits. Worker/web did not receive owner/session secrets.
- A live query through the runtime connection confirmed `rolsuper = false` and unchanged personal counts: 430 discovery listings, zero applications, zero candidate profiles and zero resume artifacts.
- The post-update backup `backups/2026-11-01T21-14-23-300Z` passed an isolated restore and artifact-reference verification. The personal database was not overwritten; this workspace currently has no referenced PDF artifacts.

## Residual risks and applicability limits

1. The owner OS account, administrators and Docker daemon can access local data/secrets. Application controls do not protect against a compromised host. No full-disk encryption assurance or enterprise secret manager is claimed.
2. API and worker currently share one application database role. Its privileges are substantially narrower than the administrative account, but are not per-process or per-tenant isolation. Service-specific roles/RLS belong to an explicitly reviewed expansion.
3. Evidence tables reject direct runtime update/delete, but administrative users and configured foreign-key cascades remain capable of data changes. This is not tamper-proof or WORM storage.
4. The PDF worker limits ordinary parser resource use; it is not an OS sandbox, antivirus or content-disarm service. Known active-feature checks are not a complete malware detector. Existing stored files are not silently rewritten or sanitized.
5. The static Next.js page still requires inline bootstrap scripts/styles, so CSP includes `unsafe-inline`. React text rendering, fixed URLs and other CSP restrictions remain useful, but strict nonce/hash CSP requires a separately reviewed rendering change. It is not claimed here.
6. Local HTTP is allowed only for loopback origins. Public HTTPS, trusted proxy settings, secure-cookie behavior through ingress, multi-user auth/MFA and independent off-device backups require a hosting review. Secure cookies alone do not configure a reverse proxy.
7. Automated tests and advisory checks do not replace independent penetration testing, container OS scanning, continuous monitoring or every ASVS requirement. Image tags, pinned digests and dependency overrides require ongoing maintenance. Current app images retain build tooling and workspace development dependencies; a separately verified production-only image reduction remains release work.
8. Source coverage, full-text performance, component size and incomplete API documentation remain technical-plan work; security hardening does not imply they are resolved.

## Applicability summary

| Control family | Review disposition |
| --- | --- |
| Authentication/session management | Implemented local controls with unit/API/browser evidence; no federation/MFA claim |
| Authorization/tenant isolation | Owner-scoped local model verified; multi-user model not applicable to current release |
| Input/output/file processing | Bounded validation and regression checks; no full malware/CDR claim |
| Cryptography/secrets | Explicit password KDF, random service secrets, protected paths; host encryption remains external |
| Data integrity/concurrency | Snapshots, revisions, hashes, operation fencing and DB restrictions retained/tested; no WORM claim |
| Communications/browser security | Loopback deployment plus headers/CSRF; public TLS/ingress not yet applicable |
| Configuration/supply chain | Dependency audits, action pins, least-privilege environments and app container controls; ongoing image/host maintenance required |
| Logs/error handling | Correlation IDs and generic server errors; private bodies/credentials excluded; no external SIEM claim |
| Recovery/availability | Isolated backup restore and worker recovery tests; no production SLA/load-test claim |
