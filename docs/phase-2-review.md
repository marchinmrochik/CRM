# Phase 2 Review

## Delivered increment

A private evidence-based resume studio: owner-confirmed profile facts, vacancy-specific editable drafts, manually quoted requirements, supported/partial/uncertain/unsupported evidence mapping, saved before/after review, explicit publication approval, immutable structured versions, parent lineage, and PDFKit export. Published PDFs are available in the existing application submission selector and application detail links to their structured version.

The interface is localized in English, Russian and Ukrainian. The single-column PDF has English section headings and preserves candidate-authored text, including Cyrillic. It embeds licensed Noto Sans fonts and needs neither an AI key nor a browser runtime in the API.

## Owner walkthrough

1. Open the local app and choose Profile. Add contacts and facts for summary, skills, experience, achievements and education.
2. Approve facts explicitly and save. Editing a fact clears its checkbox; contact/headline entries are manually authored.
3. Save a vacancy, then choose Resumes > Create tailored resume. Choose the vacancy and a meaningful resume name.
4. Edit wording, order/omit blocks, inspect the source fact, and quote requirements directly from the captured description. Map confirmed evidence or preserve visible gaps.
5. Save the draft, then Review and publish. Inspect the diff, requirement coverage and content preview; explicitly confirm accuracy.
6. Download the immutable PDF and inspect the actual pages. In an application, select this exact PDF when recording submission.
7. Edit the draft/profile/vacancy and confirm the submitted artifact and historical version remain unchanged. A published version can seed a new draft using unchanged currently approved facts.

Browser review fixtures use Alex Morgan and synthetic companies. The tailoring browser test skips if it encounters a differently named personal profile, and intentionally refreshes only its synthetic profile. Do not run browser tests during a real personal search: other CRM fixtures still add synthetic examples and changes to the synthetic profile invalidate older fixture drafts.

## Code review map

| Area                                              | Entry point                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Profile, draft and version records                | `apps/api/prisma/schema.prisma`, migrations `20261005120000_structured_resumes` and `20261005130000_resume_lineage` |
| Evidence contracts and diff                       | `apps/api/src/resume.domain.ts`                                                                                     |
| Owner scoping, revisions, publication and lineage | `apps/api/src/resume.service.ts`                                                                                    |
| API routes                                        | `apps/api/src/resume.controller.ts`                                                                                 |
| PDF template and bounds                           | `apps/api/src/resume.pdf.ts`, `apps/api/assets/fonts/`                                                              |
| Profile, editor and review UI                     | `apps/web/components/resume-workspace.tsx`                                                                          |
| Interface translations                            | `apps/web/lib/translations.ts`                                                                                      |
| Submission/version link and export                | `apps/web/components/application-detail.tsx`, `apps/api/src/crm.service.ts`                                         |
| Review checks                                     | `tests/resume-domain.test.ts`, `tests/resume-database.test.ts`, `tests/e2e/resume.spec.ts`                          |

## Verification

Verified locally on October 5, 2026:

| Check                            | Result                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production API/web Docker builds | Passed; local services healthy after launch and restart                                                                                                       |
| TypeScript and ESLint            | Passed                                                                                                                                                        |
| Vitest                           | 20 tests passed, including evidence validation, owner isolation, revision conflicts, concurrent publication, immutable versions, lineage and PDF page bounds  |
| Playwright                       | All 4 scenarios passed: CRM, localization, resume tailoring/publication/submission, and security                                                              |
| PDF inspection                   | All four A4 pages rendered and inspected; extracted text preserves section order, contacts, nine long experience blocks and English/Russian/Ukrainian content |
| Backup recovery                  | Restored into an isolated temporary database; all 14 referenced PDF artifacts passed checksum verification                                                    |
| Persistence                      | Profile, draft/version snapshots, CRM records, session and generated PDF bytes survived database/API/web restart                                              |
| Git candidate audit              | No credential matches; private data, runtime files and backups excluded; diff whitespace check passed                                                         |

Public screenshots contain synthetic data: [editor](reviews/phase-2/editor.png), [publication review](reviews/phase-2/review.png), [Ukrainian published version](reviews/phase-2/version-ukrainian.png), [mobile editor](reviews/phase-2/mobile-editor.png), and [mobile version](reviews/phase-2/mobile-version.png). The running desktop and mobile screens were visually inspected.

No ATS vendor integration or ATS score is claimed. Phase 2 GitHub Actions will run after the owner commits and pushes these changes; local results are not presented as remote CI results.

## Limits

- Profile facts and requirement matching are authored and approved by the owner; the software validates references, not the truth of arbitrary user input.
- Profile changes require a new draft. Forking preserves only unchanged currently approved facts; it does not silently migrate changed facts into old wording.
- The HTML preview shows content, not exact PDF pagination. Download the PDF for the final appearance.
- One PDF template, no DOCX or arbitrary PDF import. Contact context and role/date strings are editable text rather than separate normalized career-history tables.
- PDF output is bounded to 20 pages and 2.5 MB. The stream timeout is eight seconds; layout work is synchronous and input is bounded. Worker-level termination/recovery and durable attempt history remain Phase 3.
- Approval is per publication with a complete diff/evidence review. There is no AI suggestion acceptance workflow yet.
- Published records have no mutation routes. Database administrator access is still the trusted local owner boundary.
- Existing uploaded PDFs remain valid independent artifacts; only generated artifacts have structured version lineage.
- Normal navigation and page reload warn about unsaved edits; there is no offline autosave.

## Review gate

Stop after this increment for owner code and visual review. Phase 3 is not authorized automatically. Phase 2 changes are not committed or pushed automatically.
