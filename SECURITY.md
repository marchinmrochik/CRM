# Security policy

This project is currently a private, local, single-owner application. Internet hosting and multi-user access are outside the verified deployment model.

Keep `.env`, private PDFs, database dumps, session data and provider responses out of Git, issue reports and screenshots. Report a suspected vulnerability privately to the repository owner using an available private security-reporting channel. Do not include real candidate data or exploit a live personal workspace.

Security maintenance includes pinned dependencies/actions, automated dependency advisories, owner-scoped API checks, session expiry, bounded file validation, restricted runtime database privileges and isolated tests. Run `pnpm audit`, `pnpm test:all` and the documented recovery checks before a release. Passing these checks is not a certification or penetration test.

See [the 2026 security and architecture review](docs/security-architecture-review-2026.md) for the threat model, evidence, residual risks and local initialization procedure.
