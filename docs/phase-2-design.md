# Phase 2 Design: Evidence-Based Resume Tailoring

## Reviewable increment

A candidate maintains a private structured profile, explicitly approves facts, creates a resume draft for an existing vacancy, maps original vacancy requirements to evidence, edits and orders resume blocks, reviews changes, and approves publication. A published version has an immutable structured snapshot and a private PDF artifact. Application submission pins the artifact and therefore its unique structured version.

The English PDF template uses a single column with selectable text. The interface remains available in English, Russian and Ukrainian; interface language never translates candidate content. Uploaded PDFs remain supported as independent artifacts.

## Data model and integrity

- CandidateProfile: one owner-scoped profile, contact details and typed facts in bounded validated JSON; optimistic revision.
- ResumeDraft: owner-scoped mutable document, current profile revision/snapshot, captured vacancy snapshot, editable fact-backed blocks, requirements, baseline content, parent version and optimistic revision.
- ResumeVersion: append-only publication, unique draft/version sequence, immutable content, profile and vacancy snapshots, requirement evidence mapping, accepted diff, parent version and one unique ResumeArtifact.
- ResumeArtifact: existing private storage identity, checksum and bytes; optional one-to-one structured version. Existing application references continue to pin exact bytes.

Fact categories are summary, skill, experience, achievement and education. Each fact has a stable UUID, title, context and statement. Facts require explicit owner approval. Every resume block references one approved fact; the owner can reword, reorder or omit it. Editing profile facts is authoritative manual input, not automated enrichment.

Drafts capture approved profile facts on creation. Publication fails if the profile changed; the owner creates a new draft from the updated profile. Already published content and submitted evidence survive later profile/vacancy edits. Forking a version uses the current profile and retains parent identity; facts no longer approved cannot silently enter the fork.

Requirements are manually quoted from the captured vacancy description. Categories: mandatory, preferred, responsibility, constraint. Evidence states: supported, partially_supported, needs_confirmation, unsupported. Supported/partial items require approved fact references; unsupported items have no references. Missing requirements are visibly reported, never turned into fabricated experience. This is evidence mapping, not an ATS pass guarantee.

## API boundaries

All routes use existing session/CSRF protections and owner scoping:

- GET/PUT /api/v1/profile
- GET/POST /api/v1/resume-drafts
- GET/PATCH /api/v1/resume-drafts/:id
- POST /api/v1/resume-drafts/:id/publish
- POST /api/v1/resume-versions/:id/fork
- GET /api/v1/resume-versions/:id
- GET /api/v1/resumes/:id/download (existing artifact route)

Profile/draft mutations require expected revisions. Publication requires the latest saved revision and explicit manual approval. Diff is computed on the server from saved baseline to saved content. PDF generation is bounded, synchronous and reports errors with existing request IDs; durable retries remain Phase 3. Publication commits version, artifact identity and draft revision together. Failed commits remove newly written artifacts.

## Technical decision proposals

### Structured content storage

Problem: retain flexible resume sections and historical evidence without prematurely creating separate tables for every resume field.

| Option                                                                   | Trade-off                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Validated JSON snapshots inside relational profile/draft/version records | Simple immutable evidence and migration surface; SQL queries into individual facts are less convenient |
| Fully normalized facts, blocks and requirement mapping                   | Strong granular relational queries; more tables and snapshot assembly complexity                       |
| Document database                                                        | Flexible schema; introduces a second persistence service without a demonstrated need                   |

Recommendation: bounded Zod-validated JSON snapshots in PostgreSQL, relational owner/version/artifact identities. This extends existing JSON vacancy/event snapshots. Keep the proposal reviewable; do not adopt a new ADR without owner review.

### PDF rendering (approved)

| Option                                     | Trade-off                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| PDFKit with bundled licensed Unicode fonts | Lightweight Node rendering, explicit pagination and selectable text; dedicated layout code         |
| HTML/Chromium                              | Familiar CSS and flexible visuals; browser runtime, more resources and additional sandbox concerns |
| React PDF                                  | Component composition; separate layout model, font/render compatibility to validate                |

Decision: the owner selected PDFKit after the format/adoption comparison. See ADR 0002.

## Verification and review

Add meaningful database checks for owner isolation, stale revisions, evidence validation, concurrent publication, immutable lineage and submitted-artifact preservation. Add a full browser journey from profile to tailored publication and submitted application. Extract PDF text, inspect rendered pages (including multipage and Cyrillic content), inspect responsive editor/review screens, verify backups include new tables/artifacts, and run existing CRM/security/localization regression checks.

## Exclusions

No AI, queue, source connector, arbitrary PDF import/parser, DOCX, auto-submission or ATS success claim. The user reviews the complete increment before Phase 3.
