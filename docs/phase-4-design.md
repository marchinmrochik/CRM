# Phase 4 — Discovery and monitoring

Implementation proposal for owner review; no new architecture decision is locked into an accepted ADR.

## Boundaries and alternatives

Use two fixed public JSON endpoints through one connector contract: Remotive software-development jobs and the first Arbeitnow job-board page (remote records only). Custom URLs and scraping are excluded. An RSS adapter is a later extension; adding XML parsing now provides no necessary product advantage over two supported APIs. A separate crawler service would add deployment and security costs; the existing modular monolith and durable worker are sufficient.

Store discovery records separately from manual CRM vacancies. Alternatives are automatic insertion into the CRM (noisy and hard to review) or transient feed previews (lose history). Recommended: a persistent inbox with explicit promotion. Stable source IDs prevent repeat imports; identical company/title records are duplicate candidates for human review, never automatic cross-source merges.

Each source is disabled initially. Enabling schedules imports, while manual import is available with monitoring disabled. All fetches share a persisted six-hour minimum interval, including retries and manual clicks. Worker leases fence commits. Source runs use the existing PostgreSQL ledger and BullMQ transport; failures preserve attempt history. Scheduling is transactionally serialized per source, with at most one active run. A source failure never deletes listings or marks them closed.

## Data and flow

Source configuration -> scheduled/manual run -> bounded HTTPS fetch -> schema validation -> plain-text normalization -> ID/content hash -> atomic snapshot upsert and run completion -> searchable inbox -> seen/shortlist/dismiss -> manual CRM promotion -> existing application workflow.

Imported versions retain immutable normalized snapshots and first/last-seen times. Unchanged imports do not create new snapshots. Provider changes update discovery only; promoted manual vacancies and submitted application snapshots remain unchanged. Search filters are persisted by owner and return explicit keyword/location matches. Unknown eligibility is retained, not inferred from remote/location strings. Results are paginated. Missing listings remain availability unknown: a limited feed is not proof of closure.

## Source research (2026-10-05)

- [Remotive official API documentation](https://github.com/remotive-com/remote-jobs-api): attribution and source URL required, 24-hour publication delay, recommended maximum four requests daily. No redistribution into LinkedIn/Google Jobs or signup-gated public listings. This authenticated personal CRM is not a public listing site; no provider content is bundled into the public demo.
- [Arbeitnow official API announcement](https://www.arbeitnow.com/blog/job-board-api): explicitly offered for side projects, no key required, remote flag supported, European listings. [API documentation](https://documenter.getpostman.com/view/18545278/UVJbJdKh). No rate-limit guarantee was found in the announcement; use conservative six-hour requests and honor Retry-After. First-page coverage is partial and is disclosed in the UI.
- [WWR official RSS directory](https://weworkremotely.com/remote-job-rss-feed) is a future option. DOU, Djinni and LinkedIn remain external directory links.

## Security and verification

HTTPS host/path allowlist, no redirects, no arbitrary pagination links, 20-second abort covering body reads, 8 MiB body limit, 500 records per import, strict required fields, invalid-format failures, untrusted HTML converted to text and never rendered. Candidate URLs are HTTPS public hostnames and are never fetched by the server. Source failures expose safe codes without response bodies. No resume/profile data is sent to providers.

Fixture tests cover adapters, unsafe URLs, format drift, duplicate and repeated imports, owner isolation, leases, source overlap/quota, and saved searches. Browser review covers settings, filters, reasons, snapshot history, decisions, promotion, failure history and all three locales. Live endpoint checks verify compatibility without requiring third-party availability in CI.
