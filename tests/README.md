# Test strategy

## Commands

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm exec playwright install chromium
# Build once, and again after API/schema/UI changes:
docker compose --profile app build api web
pnpm test:unit
pnpm test
pnpm test:coverage
pnpm test:e2e
# Run measured unit/integration checks, then browsers:
pnpm test:all
```

Unit tests need no running database or Redis. Configuration-dependent modules still require valid local configuration as described in the root README. Tests do not use real provider requests or AI API keys.

`scripts/test.mjs` creates the separate `jobhunt-crm-tests` Compose project, temporary PostgreSQL database `jobhunt_e2e` on port 45442 and a UUID PDF directory under ignored `storage/`. No test worker can steal integration-test operation claims. The personal worker stays running. The runner validates its storage path before cleanup and removes only its named resources.

Browser tests use `jobhunt-crm-e2e`, web/API 43180/43181, database port 45442 and separate PDF storage. Run the suites sequentially because they share the reserved test database port. Do not run two instances of a runner concurrently. Direct local integration/browser execution against personal data is guarded. CI uses its existing disposable database rather than requiring locally built Docker images.

## Behavior matrix

| Area            | Automated checks                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CRM             | Transition matrix, input bounds, ownership, snapshots, revisions, notes, follow-ups, interviews and browser submission journey                                     |
| Resumes         | Approved facts, evidence mapping, diffs, PDF bounds/text extraction, immutable versions, lineage, publication and actual submitted artifacts                       |
| AI              | Contract/refusal/network/HTTP/body errors, privacy filtering, invalid references, suggestion approval and no automatic publication                                 |
| Discovery       | Provider normalization, unsafe URLs/HTML, quotas/pagination, repeated imports, snapshots, decisions, promotion, filters/sort, saved searches and reload/navigation |
| Operations      | Claims, leases, retries, stale-attempt fencing, actual worker automatic/manual recovery and visible failure history                                                |
| Analytics       | Known-answer milestones/timing/denominators, attribution, corrections, owner boundaries and report/export parity                                                   |
| Today           | Query ownership/time limits, loading/empty/error/populated states, action callbacks and persisted follow-up API response                                           |
| Shared UI       | Labels, pending form state, duplicate-click prevention, retained input after error, reset on success, language persistence, dialogs and mobile width               |
| Localization    | EN/RU/UK placeholders, interpolation, dates, statuses, event labels and preservation of personal wording                                                           |
| Security/export | Private feature access, logout, CSRF/origin headers, invalid filters/uploads, safe health output, CSV formula neutralization and quote escaping                    |

## Coverage reports and limits

`pnpm test:coverage` generates ignored `coverage/index.html` and `coverage/coverage-summary.json`. CI uploads the report. Overall thresholds and stricter lifecycle/AI/connector/transport/analytics thresholds fail the command on regressions.

The V8 report includes all API source files, web library modules, shared UI/locale/Today components and the analytics package. Generated Prisma files and declarations are excluded. Full feature screens are exercised by Playwright rather than included in the component-unit percentage. API bootstrap and worker processes run in separate containers during E2E; that execution is not merged into Vitest percentages. Zero unit coverage for an entry point does not mean no E2E test; a passing E2E scenario does not prove every branch was executed.

No 100% whole-project claim is made. Exhaustive worker crash/transport combinations, broader feature-component isolation, screen-reader audits, live-provider monitoring and production load/penetration tests remain separate work. Live feed checks are opt-in and respect quotas.

## Verified baseline

On November 1, 2026: 123 unit/component/database tests passed across 15 files, and 11 browser/API scenarios passed. Measured source coverage was 70.09% lines, 69.30% statements, 70.48% branches and 65.97% functions in the scope described above. Application lifecycle and analytics calculations reached 100% lines; browser API transport and Today reached 100% lines; resume service reached 95.55% lines. These percentages do not combine container process or full-screen browser execution. Lint, TypeScript and the production build passed locally. CI configuration is prepared; no remote CI run is claimed.

## Failure handling and privacy

Security follow-up on November 1, 2026: 154 unit/component/database tests passed across 19 files. Measured coverage was 70.68% lines, 69.84% statements, 70.74% branches and 66.91% functions, with existing thresholds unchanged. Added checks cover password concurrency, absolute session expiry, deployment configuration, structural PDF validation and actual runtime-role restrictions. Browser verification is recorded in the [security review](../docs/security-architecture-review-2026.md).

- Mock providers in memory; never call paid AI from tests or seed personal data.
- Keep fixtures synthetic and uniquely scoped. Do not commit private PDFs, credentials, provider dumps or traces.
- Respect production login limits. The final API suite may wait for Retry-After; limits are not weakened for tests.
- Do not lower thresholds or refresh snapshots merely to hide a failure.
- Cleanup runs after startup, migration and test failures. After a hard process kill, stop only the named test project; never delete owner volumes.
- Report actual current test results; historical counts are not fresh verification.
