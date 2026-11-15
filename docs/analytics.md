# Analytics contract

## Cohort and evidence

`GET /api/v1/analytics` and `GET /api/v1/analytics/export` require the owner session. Optional query parameters: `from`, `to` (real `YYYY-MM-DD` UTC days, inclusive), `source` (captured source exact match), `resumeKey` (submitted artifact ID, `no-resume`, or `not-recorded`). One server as-of time is returned. Drafts/future submissions are excluded. Workspaces above 10,000 applications fail explicitly; no silent aggregation truncation. The report carries schema version 1 and full cohort dimensions, metrics, comparison groups and at most 50 detail rows.

Source attribution comes from `Application.vacancySnapshot`, not mutable current vacancies. Resume attribution comes from the pinned artifact/version relationship; version content/name are immutable. Missing resume records and an explicit no-resume submission are separate groups.

The shared pure implementation is `packages/analytics/src/index.ts`. Distinct application-stage observations use the earliest valid occurrence at/after submission and no later than report time. Evidence outside this interval is excluded and counted as an evidence issue. Explicit milestones (`milestone_recorded` with a known kind) are append-only; a `milestone_voided` event removes that explicit observation from calculation without deleting history. Corrections after a report's as-of time do not alter earlier evidence.

Historical transitions to `offer_received` count as offer observations even after rejection/reopening. Completed interview events count as interviews; a linked interview of type `final` also provides final-interview evidence. Their event occurrence is the completion recording time in the legacy model, not a guaranteed real attendance timestamp. Record an explicit actual date to refine an earlier occurrence. Scheduled/cancelled interviews do not count. Other statuses, notes, and later stages do not manufacture recruiter response or human-interaction observations. Only owner-confirmed milestones can be corrected through the new API; legacy interview/status evidence retains its existing history.

## Metrics

- Full-cohort stage rate: distinct observed applications for that stage / all submitted cohort applications.
- Adjacent conditional conversion: applications with observations for both current/preceding stages / applications with the preceding stage. First-stage denominator is submitted cohort. Empty denominators return `null`, displayed as a dash.
- Missing earlier evidence: applications with a later-stage observation but no observation for the displayed stage. Stage totals may be non-monotonic.
- Response timing: first valid recruiter response minus submission, in hours. Median averages the central pair for even samples; p90 uses nearest rank `ceil(0.9*n)`. Unanswered applications never enter the response-time sample. UI displays days and `n`.
- Current unresolved outcomes: latest status outside accepted/rejected/withdrawn. Their ages are submission-to-as-of, bucketed ≤7 days, >7–30 days, >30 days. No recorded response is a separate count and can include terminal outcomes. Silence is not inferred rejection.
- Reopened: an application with a historical reopening event, counted once.
- Source/resume comparisons: same metrics per captured source or submitted artifact. Fewer than five submissions receives a small-sample label; it is a visibility heuristic, not significance analysis. These observational groups do not control for role, market, geography or chronology.
- Operations: current run states, historical failed attempts, successful runs containing earlier failures, top failure codes and current worker/Redis/AI health. Date filters apply to run creation time. Source/resume application filters do not change this separate operational scope.

## Recording and correction API

`POST /api/v1/applications/:id/milestones`: `{ revision, kind, occurredAt, note? }`, with known kinds recruiter_response/human_interaction/interview/final_interview/offer. Actual date must lie between submission and now. One active explicit observation per kind; record a replacement only after correction.

`POST /api/v1/applications/:id/milestones/:eventId/void`: `{ revision, reason }`. Applies only to an uncorrected explicit milestone in the same owner application. Both actions lock the application and increment its optimistic revision. Stale updates, owner crossing and repeated correction fail. Original events, notes and correction reasons remain in JSON export schema version 4.

The UI retains the last valid report during loading/errors and labels it accordingly. Export becomes available only for a successfully loaded current filter set. Aggregate and export computations share the same contract; as-of timestamps can differ between requests.
