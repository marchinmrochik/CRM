# Codebase review and source expansion

Reviewed October 5, 2026. Scope: API access and validation, database ownership and migrations, CRM submission snapshots, resume provenance/PDF storage, operation leases/retries, provider ingestion, local job search, analytics attribution, frontend localization, Docker/CI and exclusion of private files from Git. No deployment, commit or push was performed.

## Findings addressed

| Severity | Finding | Resolution |
| --- | --- | --- |
| High: data integrity | Local browser tests wrote synthetic applications, resumes and profiles into the owner database. Repeated reviews accumulated fixtures and distorted personal analytics. | Added `compose.e2e.yaml`, a disposable database on 45442, web/API on 43180/43181 and separate PDF storage. `scripts/test-e2e.mjs` configures host test DB access and removes only the test project afterward. Local Playwright config rejects the owner URL/database; CI retains its disposable environment. |
| Medium: error privacy | The exception formatter's object spread could override the generic server-error message with an HTTP exception's detail. | Only client errors below 500 can include exception detail. Server errors keep a generic message and request identifier. No sensitive response was observed; this closes a latent disclosure path. |
| Medium: provider compatibility | Himalayas includes long lists of eligible countries. The existing 200-character geography bound rejected a legitimate 1,772-character field and failed the entire import. | Raised the validated bound to 5,000; the complete geography remains searchable and visible in details. Card text uses two lines. CRM location validation accepts the same bound so promoted records can be edited. Contract regression covers long country lists and both documented/live timestamp variants. |
| Low: consistency | Listing count and page could see different database snapshots during an import. | Use RepeatableRead for the count/page transaction. |
| Product usability | Vacancy discovery was hidden behind the English term Discovery and absent from the separate demo the owner had open. | Renamed navigation to Job search / Поиск вакансий / Пошук вакансій. Added company and publication-age filters, dates, source attribution and coverage explanation. The existing original-link/detail/promote workflow remains available. |
| Product scope | The standalone synthetic demo contradicted the owner's current request for real runtime data only. | Removed demo routes/components, synthetic runtime exports, Docker target, Compose configuration, demo-specific scripts/tests/translations/screenshots and README startup instructions. Historical phase evidence is explicitly superseded. Tests retain isolated synthetic fixtures. |

## Data cleanup and recovery

Created and verified backup `backups/2026-10-05T14-11-43-461Z` before deletion; isolated restore checked all 26 referenced PDFs without overwriting the live database.

Cleanup selected exact known fixture names/signatures in the local owner scope. The owner explicitly authorized deletion of the manually named resume `тест`, also based on the synthetic profile. Removed 40 companies, 40 vacancies, 33 applications and their child activity, 15 drafts, nine versions, 26 PDF artifacts, the confirmed example profile and 11 associated synthetic operation runs. The original 31 actual provider listings were retained. No general table truncation or owner volume deletion was used. Diagnostic infrastructure history is retained as operation evidence.

Live Jobicy and Remote OK imports added 200 and 99 actual listings. Himalayas initially failed validation atomically. After diagnosing/fixing its country-list bound, a maintenance operation normalized the privately cached five-page response and committed 100 actual listings through the operation lease/fencing path. Its input records the recovery reason, failed run reference and page checksums; the original failure and attempts remain visible. Recovery made no additional HTTP requests and preserved the 24-hour cooldown. This was a one-time maintenance action, not a mock provider or a new public endpoint.

The owner inbox now contains 430 actual provider listings; personal CRM applications, resume files and profile are empty and ready for real entries. Monitoring remains disabled unless the owner explicitly enables a source.

## Verification

- Lint and TypeScript checks pass.
- 59 Vitest tests pass across nine files: CRM/owner isolation, immutable resume evidence, PDF text extraction, operation recovery/fencing, provider parsing/quotas and analytics evidence.
- Eight complete browser journeys pass against the isolated E2E stack. A targeted follow-up covers all five source cards, company filtering, publication-age filtering, saved searches, source snapshots, original links, promotion, EN/RU/UK and mobile layout.
- Production Docker builds and migrations are verified locally; the demo route is absent. The reviewed owner containers bind only their established loopback ports.
- Final backup `backups/2026-10-05T14-40-48-644Z` passed isolated restore verification after cleanup/import. Zero PDF references are expected because the owner requested removal of all demo resumes. The pre-cleanup backup remains available separately.
- Historical review screenshots remain test evidence, not production seed data. Current imported provider content and private checks remain outside Git.

## Remaining limits

No critical blocker was found in this scoped review after the corrections; this is not a penetration test or a guarantee of defect-free code. The application is a private single-owner local workspace. HTTPS ingress/proxy/session configuration and broader threat testing require a separate review before internet hosting.

- Source feeds are capped and incomplete. Arbeitnow imports only remote rows on its first page; Jobicy's first page is limited to 200; Himalayas imports up to 100 recent jobs. See `job-source-research.md` for access terms and expansion priorities.
- Duplicate candidates use company/title matching and per-row count queries. This works at the current scale; batch queries and search indexes should precede a large backfill.
- Geography remains provider text. Country/timezone eligibility, currency-aware salary comparisons and structured employment/seniority filters are follow-up work. No inferred work authorization or automatic closed-job status is generated.
- Original provider pages may expire while local history remains. Verify the original before applying.
- Uploaded PDFs are bounded and checked by MIME/header, not comprehensively parsed or scanned. Generated PDFs are separately checked for text extraction. Upload validation does not establish ATS compatibility.
- A process terminated between PDF write and database commit can leave an unreferenced private file; a future retention/cleanup task should handle it without deleting referenced immutable artifacts.
- Some integration tests emit an upstream PostgreSQL-driver concurrency deprecation warning. Current pinned versions pass; re-evaluate on driver/Prisma upgrades.
- GitHub Actions configuration is prepared, but no remote workflow result is claimed without a push.

## Next practical phase

Implement DOU/Djinni RSS and an owner-curated employer watchlist, then provider-side keyword/country search and resumable backfill with explicit coverage/progress. Integrate credential-required aggregators only after their account settings and terms are available. Keep the personal CRM, resume approval and operation audit trail as the core product.
