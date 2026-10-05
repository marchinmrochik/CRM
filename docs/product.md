# Product and Application Behavior

## Purpose

Help an experienced developer discover eligible remote opportunities, prepare truthful applications, and track what happens next. Provide an extensible product that demonstrates frontend, backend, data modeling, and operational skills.

## Product boundaries

The initial product is a private workspace for one owner. Public demonstrations use isolated synthetic data. Multi-user collaboration, billing, automatic applications, mailbox/calendar synchronization, browser extensions, and LinkedIn scraping are outside the initial scope.

## Navigation

| Area | Responsibility |
| --- | --- |
| Overview | Upcoming actions, application totals, recent activity, operational warnings |
| Vacancies | Saved opportunities, descriptions, eligibility, filters, source provenance |
| Applications | Table, status transitions, interviews, notes, next actions, submitted documents |
| Profile and resumes | Verified career facts, editable drafts, immutable versions, tailoring |
| Sources | Search service directory, saved external searches, supported connectors |
| Monitoring | Saved searches over imported vacancies, new matches, exclusions |
| System activity | Execution history, failures, retries, connector health, recovery actions |

## Vacancy lifecycle

1. Add a vacancy manually using its URL and pasted description; URL fetching is not required.
2. Store the source, original URL, company, title, description snapshot, and capture time.
3. Record location eligibility, work mode, timezone requirements, seniority, language, contract type, and compensation when known.
4. Classify the opportunity as `inbox`, `shortlisted`, `dismissed`, or `archived`.
5. Create an application when preparing an actual submission.

Vacancy availability (`unknown`, `open`, `closed`) is separate from the owner's disposition and application status. An unavailable source does not prove a vacancy is closed.

Unknown eligibility remains unknown. Salaries retain currency and period; do not compare monthly and annual figures without explicit normalization. Missing salary is not zero.

## Application lifecycle

Application statuses: `draft`, `applied`, `in_progress`, `offer_received`, `accepted`, `rejected`, `withdrawn`.

Interview stages and milestones are separate records rather than overloaded statuses. Examples include recruiter conversation, technical interview, final interview, and offer. Companies may skip or repeat stages.

- Preparing a draft does not count as an application sent.
- Marking an application `applied` requires a submission date and explicit confirmation of the submitted resume, or an explicit record that no resume was used.
- Each status change writes an event with old/new status, occurrence time, recording time, and actor in the same database transaction.
- Interview records have type, scheduled time, timezone, status (`scheduled`, `completed`, `cancelled`), outcome, and notes.
- A next action contains a due date, description, and completion state. Overdue does not automatically change application status.
- Terminal statuses require confirmation before reopening. Reopening appends history rather than erasing the prior outcome.
- Corrections remain traceable. Backdated events distinguish occurrence time from recording time.
- Repeated submissions to the same role are allowed only as explicit separate applications; warn about an existing application.

Application detail shows the original vacancy snapshot, exact submitted resume, timeline, interviews, notes, and next action. Editing a vacancy or base resume never changes previously submitted evidence.

## Career profile and resume workflow

The profile stores approved facts: employment, projects, responsibilities, technologies, education, and achievements. Each fact has an identifier and optional supporting context. Numbers and dates require owner confirmation.

Workflow:

`vacancy snapshot -> requirements -> evidence mapping -> draft edits -> diff -> manual approval -> immutable resume version -> document export -> application`

Requirements distinguish mandatory, preferred, responsibility, and constraint items. Evidence states are `supported`, `partially_supported`, `needs_confirmation`, and `unsupported`.

Suggestions reference requirement IDs and profile fact IDs. Missing evidence is shown as a gap or question, never inserted as experience. Accept/reject individual suggestions. Manual edits are supported without AI. AI output cannot mutate the approved profile or send an application.

Resume drafts are editable; published versions are immutable. A revision creates a new version. Store the structured content, parent version, creation time, targeted vacancy snapshot, accepted changes, and exported artifact identity. The application references the version actually submitted, which may differ from the most recent draft.

Start with one English, single-column PDF template with selectable text. Verify extracted text and rendered layout. DOCX export and arbitrary PDF/DOCX import are later enhancements, not prerequisites for structured editing.

## Sources and monitoring

The source directory works independently of integrations: name, URL, description, regions, and saved external search links.

Connector flow: fetch supported RSS/API -> validate -> normalize -> deduplicate -> store source occurrence and snapshot -> evaluate saved searches -> show new matches.

Deduplicate within a source using its stable ID or canonical URL. Cross-source matching creates reviewable duplicate candidates; never merge solely because title/company are similar. Imports are repeatable without duplicating vacancies. Preserve original descriptions alongside normalized fields.

Saved searches define include/exclude criteria. Every match explains the satisfied criteria and unknown constraints. Users can mark an item seen, shortlist it, dismiss it with a reason, or prepare an application. Source failures are visible and do not invalidate previously imported records.

## Analytics rules

- Use actual event milestones, not the current status alone.
- Count applications by submission date cohort; exclude drafts.
- Distinguish automatic acknowledgments, human responses, interviews, final interviews, and offers.
- Human response rate: submitted applications with at least one recorded human response divided by submitted applications in the selected cohort.
- Interview rate: submitted applications with at least one completed interview divided by submitted applications in that cohort. Scheduled interviews are a separate measure.
- Offer rate: submitted applications with an offer event divided by submitted applications in that cohort.
- Show unique application counts, denominators, observation cutoff, and pending cases. Do not count repeated interviews as repeated converted applications.
- Show elapsed time to first human response only where a response is known; unresolved applications remain pending.
- Compare sources and resume versions descriptively with sample sizes. These comparisons do not establish causality.
- Optional stages make a strict sequential funnel misleading; show milestone reach first and conditional transitions only with explicit denominators.

## UX requirements

Support loading, empty, validation, permission, offline/network failure, and recovery states. Preserve draft input after recoverable errors. Filters live in the URL where practical. Tables support keyboard navigation and clear sorting. Dates display in the owner's configured timezone; timestamps are stored as UTC.

Destructive actions require clear confirmation. Archive is preferred for records with history. CSV/JSON exports prevent lock-in; imported CSV rows receive preview and validation before committing.
