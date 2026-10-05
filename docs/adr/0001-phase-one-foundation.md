# ADR 0001: Phase One Foundation

Status: Adopted for the authorized Phase 1 implementation.

## Context

The owner authorized starting the first CRM phase after reviewing the proposed phases and preparing isolated Docker PostgreSQL. The project must teach modern React/backend development and remain a usable private workspace.

## Decision

Use Next.js 16/React 19 for web, NestJS 12 for a separate domain API, PostgreSQL 17 with Prisma 7 and its PostgreSQL driver adapter, and TanStack Query for client server state. Exact versions are recorded in manifests and the lockfile; pre-release Prisma 8 is not used.

Use established Express session middleware with PostgreSQL session persistence for the single local owner. CSRF protection checks the configured web origin and a custom mutation header; authenticated API routes remain private. The owner password and session secret are random values in ignored local configuration.

Phase 1 groups the manual CRM into a single feature module with separate controller/service/domain/database boundaries. Split modules as new resume and integration capabilities introduce independent responsibilities. Do not introduce a worker, Redis, or AI dependency in this phase.

## Alternatives

- A Next.js-only backend reduces deployment processes but offers less practice with a separate domain API.
- Vite plus NestJS simplifies the private SPA but leaves Next.js server/client boundaries outside the learning scope.
- RTK Query is viable; TanStack Query was chosen to broaden the owner's existing Redux experience.
- Drizzle/direct SQL offers more explicit SQL control; Prisma provides a productive schema/migration/client workflow, with targeted SQL retained for row locking.

## Consequences

Two runtime processes and two build targets require coordinated startup. A same-origin web proxy avoids unnecessary browser CORS configuration. One database stores domain records and sessions; immutable PDF files use private filesystem storage shared between host and container modes.

Native semantic forms and component CSS keep the first vertical increment focused. Tailwind/shadcn and React Hook Form are not installed yet; the initial tooling list was a proposal, not a requirement to add unused dependencies. There is no shared runtime package or Turborepo configuration until shared build consumers justify it.

Hosted release requires HTTPS cookie configuration, restricted application database credentials, reviewed deployment access, and external backup storage. Current all-container images prioritize reproducible local review; production image slimming is subsequent operational work.
