# PlexiSuite apps — implementation roadmaps to the aspirational design

This document reviews every new app shipped in the suite build-out and lays out a
concrete, phased plan to take each from its current state to the full design in
the aspirational PlexiSuite mockup. It is written to be executed: each app names
what exists, what the finished thing looks like, the gap between them, and the
phases that close it, with the real files and dependencies involved.

The reference design is the PlexiSuite home mockup: a connected workspace where
the home is a launcher plus a live dashboard (People Map, Upcoming, My Tasks,
Recent Activity, Recent Files, Favourite Desks), every product is grouped and
clearly marked live or coming, and each live product is a genuinely useful tool
that beats the Microsoft and Google equivalent by being native to one workspace.

## How to read the status

Every app below was built locally-first on its own SQLite table with its own IPC,
which is why they shipped fast and work offline. "Phase 1" or "v1" means the
single-user, in-app loop is real and verified. The aspirational design adds three
recurring capabilities on top, and they are the same across most apps, so they
are described once here as shared foundations and then referenced per app.

## Shared foundations (unblock several apps at once)

These are the cross-cutting pieces. Building them once lifts every app toward the
aspirational design, so they are worth sequencing first.

### F1. Shared routing reconciliation (immediate, blocking)

Every new view registers a `kind` in three files: `src/renderer/src/stores/view.ts`,
`src/renderer/src/components/MainPane.tsx`, `src/renderer/src/components/Sidebar.tsx`.
The People-Map chat and this build are both editing them, so commits through that
surface are serialised. Resolution: the People-Map chat commits its feature files
(its view component, presence store, signal changes) but not those three routing
files; then one chat commits the three routing files carrying every feature's
routing. Until that lands, PlexiForms routing and PlexiSign routing stay held.

### F2. Signal-server services (cross-user, presence, voting)

The local-first apps need a server tier to become multi-user and to power the
launcher's coming-soon upvotes. The signal server (`projects/focusbuddy-signal`)
already hosts identity, orgs, ACLs and live-doc collaboration. Three additions
ride here: account-level presence (the People Map, in flight in the parallel
chat); a `feature_votes` table and `/features` routes so the launcher upvotes
record real per-account demand and can notify voters; and an org-scoped sync
layer so each app's local tables can replicate to teammates. All three want a
single coordinated deploy.

### F3. Public hosting / viewer layer

Several aspirational features are outward-facing: a public form submission page,
a public document-for-signature page, a published dashboard or report. These need
a hosted viewer (the existing `focusbuddy-viewer` Vercel app is the seed) plus
short-lived signed links minted by the signal server. One viewer build serves
forms, sign and reports.

### F4. AI depth

Every app has an AI ceiling above its current keyword-and-prompt floor: semantic
retrieval (embeddings) for PlexiBrain and PlexiSearch, structured extraction for
PlexiMeet, generation for PlexiBuild and PlexiSlides. This is a shared embeddings
+ retrieval service, local where possible, that each app calls.

---

## PlexiSuite home (the launcher and the dashboard)

**Current state.** A polished launcher: the PlexiDesk hero, every product grouped
exactly as the mockup, live products full-colour opening their own page,
coming-soon ones greyed with a badge and a working local-first upvote. It is the
default landing. Files: `src/renderer/src/components/suite/*`,
`src/shared/plexiSuite.ts`, `src/renderer/src/stores/featureVotes.ts`.

**Aspirational target.** The mockup home is a launcher *plus* a live dashboard:
a right rail with the People Map (142 people), Upcoming (calendar), My Tasks,
Recent Activity; and below the product grid, a PlexiCam presence row, Recent
Files and Favourite Desks. The PlexiDesk hero carries quick actions (Open My
Desk, New Desk, Templates, Widgets, Surfaces). A global search ("Search anything
in Plexi", Cmd-K) spans everything. Upvote counts are the real cross-user
aggregate and voters get notified at test time.

**Gap.** The launcher exists; the surrounding dashboard rails, quick actions,
global search and the server-side vote aggregate do not.

**Plan.**
- Phase 2a — Dashboard rails. Add a right rail composed from existing stores:
  Upcoming from the calendar store, My Tasks from the node store, Recent Activity
  from the activity log, Recent Files and Favourite Desks from the files/nodes
  stores. These are read-only reads of data that already exists; mostly layout.
- Phase 2b — Hero quick actions. Wire Open My Desk / New Desk / Templates /
  Widgets / Surfaces to the existing canvas, template and widget-picker actions.
- Phase 2c — Vote aggregate (needs F2). Deploy `feature_votes`; the client store
  already syncs, so counts become real and an admin view lists voters to notify.
- Phase 3 — Global search (needs F4 + PlexiSearch). One Cmd-K box over documents,
  tables, knowledge, meetings, people and products, answering in text and links.
- Phase 3 — People Map + PlexiCam row embed (needs the People-Map chat's work +
  F2 deploy). Embed the live map and a presence row on the home.

---

## PlexiDash (charts and dashboards)

**Current state.** A `chart` canvas widget (bar/line/area/pie/KPI) bound to a
table, aggregating real rows live, config in `widget.content`. Several charts on a
desk are a dashboard. Files: `src/renderer/src/components/widgets/ChartWidget.tsx`,
`src/shared/charts.ts` (pure aggregation, 16 unit tests).

**Aspirational target.** "Live business views from your data" that replace Power
BI / Looker. First-class dashboards (named, shareable, multi-source), richer chart
types and interactions (drill-down, cross-filter, combo charts, tables-as-widgets),
scheduled and AI-narrated reports (this is PlexiReports), and dashboards published
to a link.

**Gap.** Charts exist; first-class dashboards, drill-down/cross-filter, more chart
types, and reporting do not.

**Plan.**
- Phase 2 — First-class dashboards. A `dashboard` entity (its own table) that is a
  saved arrangement of chart configs, independent of a desk, with a grid layout
  and a presentation mode. Reuse `computeChartData`; add a dashboard store + view.
- Phase 2 — Chart depth. Add combo (bar+line), scatter, stacked, and a number-grid
  KPI panel; add per-series filters and a date-range control; add "table as a
  chart" (a live filtered table view).
- Phase 3 — Interactions. Click a bar to cross-filter the other charts on the
  dashboard (shared filter state); drill from an aggregate to its underlying rows.
- Phase 3 — PlexiReports (sibling product). Schedule a dashboard to render to PDF
  on a cadence, with an AI-written narrative (needs F4), delivered by email (needs
  the mail send path, which exists) or to a link (needs F3).
- Phase 3 — Published dashboards (needs F3). A read-only public link.

---

## PlexiBrain (company knowledge base)

**Current state.** A real knowledge base: CRUD entries with title, body, tags and
pinning; keyword relevance search (pure, 7 unit tests); and AI grounding, knowledge
entries join the assistant's retrieval corpus. Files: `src/main/db/knowledge.ts`,
`src/renderer/src/components/views/KnowledgeView.tsx`,
`src/main/workspaceSearch.ts`, `src/shared/knowledge.ts`.

**Aspirational target.** "The shared memory for people and agents." Semantic
search over the whole corpus, agents that *write* to the brain as they work
(auto-capture from meetings, documents and decisions), rich entries (links,
embeds, sources), cited answers with provenance, and one memory shared across the
team (org-scoped sync).

**Gap.** Keyword search not semantic; entries are plain text; AI reads but agents
do not write; single-user.

**Plan.**
- Phase 2 — Semantic search (needs F4). Embed entries on save; rank by vector
  similarity blended with the current keyword score; this also upgrades the
  assistant's grounding quality.
- Phase 2 — Richer entries. A proper editor (reuse the Tiptap doc editor) so an
  entry can hold formatted text, links and embeds; a `source` field for
  provenance so cited answers can link back.
- Phase 2 — Agent write-access. A `knowledge.upsert` action exposed to desk agents
  and the meeting summariser, so the brain fills itself: a meeting's decisions, a
  document's summary, a resolved question all land as entries automatically (with
  a review queue so it stays curated, not noisy).
- Phase 3 — Shared brain (needs F2 sync). Org-scoped entries replicate to
  teammates with the ACL model already built.

---

## PlexiMeet (meetings that turn into actions)

**Current state.** Meetings store with record (transcribe → summarise → extract
actions via the existing pipeline) or manual notes; transcript, summary and action
items; one-click action-item-to-task; search. Files: `src/main/db/meetings.ts`,
`src/renderer/src/components/views/PlexiMeetView.tsx`. Live transcription needs a
Whisper/Anthropic key (honest about it).

**Aspirational target.** "Meetings that turn into actions" end to end: join or
record a live meeting, get a diarised transcript (who said what), a structured
summary, decisions and actions auto-filed to the right desks and to PlexiBrain,
and a searchable meeting history linked to the calendar event and the attendees.

**Gap.** No live capture from a call, no diarisation, no calendar/attendee link,
actions are manual one-click rather than auto-filed.

**Plan.**
- Phase 2 — Calendar link. Attach a meeting to a PlexiCalendar event and its
  attendees, so history is organised by when and who.
- Phase 2 — Diarisation + structure. Use the transcript pipeline's diarised mode
  to label speakers; have the summariser emit structured decisions vs actions vs
  questions (the action extractor already returns proposals, extend the schema).
- Phase 2 — Auto-file. On finishing a meeting, offer to file each action to a desk
  and each decision to PlexiBrain in one accept-all step (reuses the action
  applier and the F-of-PlexiBrain write action).
- Phase 3 — Live capture. Capture system audio during a call (Meet/Teams/Zoom in a
  webview or via the recorder) and transcribe in near-real-time. Larger; depends
  on platform audio capture.

---

## PlexiBuild (no-code app builder)

**Current state.** Phase 1: a single-screen app is a stack of typed components
(heading, text, input field, button, divider) built in a Build mode and run in
Preview, persisted. Files: `src/main/db/apps.ts`,
`src/renderer/src/components/views/PlexiBuildView.tsx`, `src/shared/apps.ts`. The
component model is forward-compatible (a loose config bag, no migration needed).

**Aspirational target (the user's choice: full visual app platform).** A Retool /
Power-Apps-class builder: multi-screen apps with navigation, components bound to
real data (read and write a table), logic and actions (on submit, on click do X),
a free-canvas layout not just a stack, reusable components/templates, and apps
shared across the team and launched from the suite.

**Gap.** Single screen, no data binding, no logic, stack-only layout, not
shareable.

**Plan (phased, multi-session by design).**
- Phase 2 — Multi-screen. Extend the model from `components[]` to
  `screens[{id,name,components[]}]` with screen tabs and a navigate-to-screen
  button action. The loose config bag means no migration.
- Phase 3 — Data binding. A `table` component (embed a live table view) and field
  components that read/write a chosen table column, so a form-like app actually
  persists. This is where PlexiBuild and PlexiTables/PlexiForms converge.
- Phase 3 — Logic and actions. A small action model on buttons and field events:
  create a row, navigate, call an AI prompt, open a link, run a PlexiFlow
  automation. Start with a fixed action set, not a full expression language.
- Phase 4 — Free canvas. Optional absolute positioning per component (reuse the
  canvas widget-frame drag/resize) for pixel layout, with the stack as the default.
- Phase 4 — Share + run. Save an app as a template, publish it to the team, and
  launch it from the PlexiSuite launcher like a first-class product.

---

## PlexiForms (capture requests, leads, data)

**Current state.** Engine committed: a form is a thin layer over a backing table
(fields = columns, each submission = a row), with Build / Fill / Responses tabs.
Submissions are real table rows, so they are instantly chartable in PlexiDash.
Files: `src/main/db/forms.ts`, `src/renderer/src/components/views/PlexiFormsView.tsx`,
`src/shared/forms.ts`. Routing + the catalog flip to ready are held pending F1.

**Aspirational target.** "Capture requests, leads, briefs and data" from anyone:
shareable public form links that outsiders fill without an account, conditional
logic and validation, file-upload fields, email notification on submit, and
responses flowing into tables, dashboards and automations.

**Gap.** Internal-only (no public link), no logic/validation, no notifications.

**Plan.**
- Phase 1.5 — Land routing (needs F1). Commit the held `forms` view kind, sidebar
  entry and catalog flip so the working, verified form is reachable and marked
  ready.
- Phase 2 — Field depth. Add validation (required, min/max, pattern) and a
  file-upload field (reuse `fb_files`); add a thank-you screen and a redirect.
- Phase 2 — Notifications. On submit, send an email (the mail send path exists)
  and/or create a task, configurable per form.
- Phase 3 — Public links (needs F3). Publish a form to a hosted page where an
  outsider submits without an account; the signal server mints the link and routes
  the submission to the backing table over an authenticated relay.
- Phase 3 — Conditional logic. Show/hide fields based on prior answers.

---

## PlexiSign (e-signatures)

**Current state.** Built in the tree (parallel work): `fb_sign_requests` holds an
agreement body, an ordered set of signers, an append-only audit trail and a
completion certificate (sha256 over body + signatures). Files: `src/main/db/sign.ts`,
`src/renderer/src/components/views/PlexiSignView.tsx`, `src/renderer/src/stores/sign.ts`.
Local-first, self-contained; catalog status `soon`.

**Aspirational target.** "Sign, approve and track documents" replacing DocuSign:
send any document for signature to people inside or outside the org, collect drawn
or typed signatures in a defined order, enforce approvals, and keep a
tamper-evident audit trail and certificate, all on the suite's identity layer.

**Gap (to confirm against the built code).** Likely: signing is in-app only (no
outside-party link), signatures may be typed not drawn, and it is not yet wired to
real documents from PlexiDocs or the ACL/audit identity layer.

**Plan.**
- Phase 1.5 — Review + land routing. Audit the built `PlexiSignView` against this
  target, then land its `sign` routing (with F1) and flip the catalog when ready.
- Phase 2 — Sign real documents. Send a PlexiDoc (or an uploaded PDF) for
  signature rather than a plain body; render the document with signature anchors.
- Phase 2 — Drawn signatures + ordered approval. A canvas signature pad (reuse the
  scratchpad ink) and enforce the signer order with per-signer status.
- Phase 2 — Identity + audit. Tie the audit trail to the Gate-2 audit log and the
  signer identities to accounts, so the certificate is backed by real identity.
- Phase 3 — Outside-party signing (needs F3). A hosted page where an external
  signer reviews and signs without an account; the certificate records it.

---

## PlexiTasks (already largely there)

**Current state.** The catalog marks it ready because the existing node/task system
(desks, tasks-with-workspaces, the sidebar tree, all-tasks view) is the product.

**Aspirational target.** "Tasks that live beside the work", plus the project layer
(PlexiProjects: dependencies, milestones, Gantt, auto-reschedule) which the kit's
plan-management agents already model.

**Plan.** Mostly a packaging and surfacing exercise: give it a clear product home
in the launcher, then build PlexiProjects (planned) on top using the existing
plan-architect / plan-steward capabilities. Lower new-build effort than the others.

---

## Suggested sequencing

1. Unblock F1 (routing reconciliation) so PlexiForms and PlexiSign go live, then
   cut a release batching PlexiMeet, PlexiBuild, PlexiForms, PlexiSign.
2. Coordinate the single signal deploy (F2): People-Map presence, the
   `feature_votes` aggregate, and the groundwork for org sync.
3. Build the home dashboard rails (PlexiSuite home Phase 2a/2b) since they are
   pure reads of existing data and make the home match the mockup quickly.
4. Build F4 (embeddings/retrieval) once, then lift PlexiBrain, PlexiSearch and the
   global search together.
5. Build F3 (viewer) once, then unlock public forms, outside-party signing and
   published dashboards together.
6. Take PlexiBuild through its multi-session phases in parallel, since it is the
   largest and most independent.

The pattern that made this build fast still applies: each phase is a local-first,
verifiable, releasable increment. Build the shared foundation, then let every app
draw on it, rather than rebuilding the same capability per app.
