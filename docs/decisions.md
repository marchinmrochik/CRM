# Architectural Decision Proposals

## Status policy

Phase 1 implementation adopts D01, D02, D03, and the initial filesystem part of D05 as recorded in [ADR 0001](adr/0001-phase-one-foundation.md). The alternatives below preserve the original proposal context. Background and AI decisions remain future-phase proposals.

`Accepted constraint` means explicitly requested by the owner. `Proposed` means recommended but not locked into an ADR. Approval during Phase 0 converts a proposal into an individual ADR with context, alternatives, consequences, and date. Do not interpret this document as approval of every tool.

## Accepted constraints

- All documentation and Markdown use English.
- PostgreSQL runs in Docker with persistent data.
- All exposed local ports are project-specific; prohibited host ports are `3000`, `5000`, `8000`, and `1433`.
- Implementation proceeds through complete increments with owner code and visual review after each phase.
- Operational failures, reasons, retries, and recovery history must be visible.
- Current work prepares documentation before application implementation.

## D01 — Application architecture: Proposed

**Problem:** balance a useful personal product with learning backend architecture and modern React.

| Alternative | Trade-off |
| --- | --- |
| Next.js with in-app backend | Fastest delivery and simplest deployment; less practice with separate API boundaries |
| Next.js + NestJS modular monolith | Covers modern React and backend modules; requires two application processes and disciplined ownership |
| Vite/React + NestJS | Straightforward private CRM; does not explore Next.js server/client architecture |

**Recommendation:** Next.js + NestJS. Keep domain logic solely in the API. Revisit if delivery speed outweighs the learning goal.

## D02 — Database access: Proposed

**Problem:** keep relational integrity while making migrations and typed application development maintainable.

| Alternative | Trade-off |
| --- | --- |
| Prisma | Productive schema/client workflow; complex analytics may still need explicit SQL |
| Drizzle | Closer to SQL and explicit queries; requires different schema/migration practices |
| SQL with a lightweight driver/query builder | Maximum control; more mapping and consistency work |

**Recommendation:** Prisma plus explicit reviewed SQL where warranted. PostgreSQL itself is the product's relational database choice; physical schema remains reviewable.

## D03 — UI server state: Proposed

**Problem:** handle caching, mutations, forms, and navigation without duplicating ownership of state.

| Alternative | Trade-off |
| --- | --- |
| TanStack Query + local/form/URL state | Explicit interactive API workflows; one additional client state library |
| Redux Toolkit + RTK Query | Familiar and capable; may encourage unnecessary global state if boundaries are unclear |
| Next.js server mutations/rendering only | Less client caching infrastructure; complex interactive tables/editors require careful design |

**Recommendation:** TanStack Query for interactive server state; URL filters and local/form state elsewhere. Do not combine two API caches.

## D04 — Background execution: Proposed

**Problem:** survive long requests, retries, worker exits, and scheduled imports with inspectable history.

| Alternative | Trade-off |
| --- | --- |
| Synchronous API calls initially | Simple for bounded work; cannot provide durable recovery |
| PostgreSQL-backed queue | Fewer services; queue capabilities and operational tooling depend on the selected library |
| Redis + BullMQ + database run history | Explicit job/retry tooling; extra service and database/queue consistency work |

**Recommendation:** synchronous bounded operations in Phases 1–2; introduce BullMQ with durable database history/outbox in Phase 3 before scheduled imports.

## D05 — Artifact storage: Proposed

**Problem:** preserve exact submitted documents privately without coupling records to a deployment path.

| Alternative | Trade-off |
| --- | --- |
| Filesystem/volume adapter | Simple local deployment and backups; requires coordinated artifact/database restoration |
| S3-compatible private storage | Easier hosted scaling and durable storage; account/configuration overhead |
| Database binary storage | Transactional simplicity; larger database and backup burden |

**Recommendation:** storage interface with local volume implementation first; add an S3-compatible adapter when hosting requires it.

## D06 — AI integration: Proposed

**Problem:** provide useful suggestions without provider lock-in or fabricated experience.

| Alternative | Trade-off |
| --- | --- |
| Direct provider calls from UI | Quick prototype; exposes unsuitable boundaries and couples product behavior |
| Internal task interface with provider adapters | Testable contracts and optional AI; modest integration work |
| Agent orchestration framework from the start | Supports broader automation; unnecessary complexity for two bounded tasks |

**Recommendation:** backend task interface with validated structured output and one adapter. Keep manual editing/evidence mapping as the baseline.

## Decisions still requiring design

Authentication solution, deployment target/budget, exact dependency versions, first supported connectors, notification channel, data retention overrides, and physical indexes/migrations. Choose during the relevant phase with explicit trade-offs; do not silently infer cloud services or paid subscriptions.
