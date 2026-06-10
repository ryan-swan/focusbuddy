# Table, SME doc (master of destiny)

Tier: Hero. This is one of the widgets people will judge Haptyx on, so it has to
clearly beat best of breed for its core on-canvas job at launch.

## The use case

Someone is planning or tracking something with more than one attribute per item:
a content calendar, a bug list, a CRM of ten leads, a reading list, a sprint
board. They don't want to leave their desk and open Airtable in another tab,
lose the context of the notes and browser tabs and timer already on the canvas.
They want a real typed database sitting next to everything else, that an AI can
populate from a sentence, that they can flip between a grid and a board and a
calendar without rebuilding it, and that stays on their machine. The moment of
use is "I have a messy pile of things with properties and I want structure
without ceremony, right here."

## Current state

Backed by `fb_tables` + `fb_rows` (per-row JSON cells) in SQLite, rendered by
`src/renderer/src/components/widgets/TableWidget.tsx` with the per-view rendering
in `TableViews.tsx` and AI construction in `lib/tableAiBuild.ts`.

What works today:
- Multiple views over one dataset: table, list, cards, kanban, calendar, and a
  gantt/timeline. Switching view doesn't rebuild the data.
- Typed columns (text, number, checkbox, select, date, and more) with per-cell
  coercion, so a date column behaves like a date.
- AI build: describe the table in the command bar and it scaffolds columns +
  seed rows (`tableAiBuild.ts`), and the share/agent pipeline can upsert rows
  non-destructively by key column.
- Lives as a first-class canvas object, resizable, wireable, shareable, and now
  reconstructable from a share snapshot.

Rough edges (honest):
- No formula / rollup / lookup column types, so it can't compute across columns
  or aggregate a group.
- No relations between two tables, so it's a flat database, not a relational one.
- Filtering, sorting, and grouping are limited compared to a real database view.
- Kanban/calendar/gantt are present but thin on per-view configuration (which
  field drives the board column, swimlanes, date-range bars).
- No row-level detail/expand record modal with all fields + attachments.
- Import is CSV-on-drop; no paste-a-grid, no two-way sync to a real source.

## Best-of-breed landscape

- **Airtable** owns the relational + automation high ground: linked records,
  lookups and rollups, rich field types (attachment, barcode, button, user),
  interface designer, and a deep automation engine. It is the thing a power user
  compares us to and the reason "table" reads as "Airtable-lite" until proven
  otherwise.
- **Notion databases** win on being embedded in documents, fast view switching,
  relations + rollups, and the "everything is a database" feel. Their weakness
  is performance at scale and shallow number/formula tooling.
- **Coda** wins on formulas-as-a-language and tables that drive a whole doc with
  buttons and automations. Overkill for most, but the ceiling is high.
- **Rows / Baserow / Grist** win on spreadsheet-grade formulas, SQL-ish power,
  and (Grist) local/self-hosted data ownership, the closest philosophical
  neighbours to our local-first stance.
- **Smartsheet** owns the gantt/project end: dependencies, critical path,
  baselines, the bar our timeline view is implicitly measured against.

What we already do better or uniquely could: the table is one object on an
infinite canvas next to the notes, tabs, and timer for the same task, it can be
populated and mutated by an AI from natural language in place, it can be wired to
other widgets and to desk agents, and the data never leaves the machine. No
incumbent has the canvas + AI + local-first combination.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No relations / lookups / rollups (Airtable, Notion, Coda).** "I want each
   task to link to a project and show the project's status." Today impossible.
   This is the single biggest perceived gap versus Airtable.
2. **No formula column (Coda, Rows, Airtable).** "Days until due", "price ×
   qty". Without it we're a typed list, not a database.
3. **Thin view configuration (Airtable, Notion, Smartsheet).** "Group the board
   by status, colour by priority, show the gantt bar from start→due." The views
   exist but can't be steered enough to be the daily driver.
4. **No expanded record view (everyone).** "Click a row, see all fields and
   attachments and edit calmly." Editing wide rows in a grid cell is painful.
5. **Weak filter/sort/group (everyone).** Real database views filter on multiple
   conditions and persist per view.
6. **Import/paste friction (Rows, Notion).** Pasting a grid from a spreadsheet
   should just work; today it's CSV-on-drop only.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")
- **Formula column type.** A safe expression evaluator over the row's own cells
  (arithmetic, dates, string ops, if/else). Acceptance: a "Days left" column
  computes `dueDate - today` and updates live; beats Notion's number tooling for
  the common case.
- **Expanded record modal.** Click a row → full-height panel with every field,
  long-text editing, and attachments. Acceptance: editing a 12-column row is
  comfortable; parity with Airtable/Notion record view.
- **Per-view configuration.** Kanban group-by field + card fields; calendar
  date field; gantt start/end fields + bar colour; table column show/hide +
  width persistence. Acceptance: a user can turn one dataset into a usable board
  AND a usable calendar without touching data, the core Airtable/Notion promise.
- **Multi-condition filter + multi-key sort, persisted per view.** Acceptance:
  "open bugs, priority high, sorted by due" survives reload on the table view
  only.

### Launch-polish
- **Relations between two on-desk tables** (link a row to a row in another
  table) + a **lookup** column that pulls a field across the link. Acceptance:
  tasks table links to projects table and shows project status, the Airtable
  headline feature, scoped to two tables.
- **Paste-a-grid import** (tab/newline delimited from the clipboard creates
  columns + rows with type inference).
- **Rollups** (count/sum/avg of linked or grouped rows) and **group-by
  aggregation footers** in the table view.
- **Richer field types**: url, email, rating, currency, multi-select, person
  (from share recipients), and a button field that can trigger a desk agent.

### Post-launch (pull ahead)
- **AI views**: "show me what's overdue and at risk" generates a filtered,
  grouped view on the fly, something no incumbent does because they lack our
  in-place AI.
- **Wire-driven tables**: a wire from a browser/agent widget streams rows in
  (research results land as rows), uses our unique canvas wiring.
- **Two-way CSV/Sheet sync** for the embed crowd, with local staying the source
  of truth.
- **Dependencies + critical path** on the gantt view to take the Smartsheet
  ground.

## The unfair advantage

Only Haptyx can put a real typed database on the same surface as the live browser
tab, the voice note, and the timer for the same piece of work, let an AI fill and
reshape it from a sentence in place, wire other widgets into it so research flows
in as rows, and keep every byte on the user's machine. The plan above closes the
Airtable/Notion feature gaps; the wiring + in-place AI + local-first trio is why,
once at parity, ours is better in kind rather than a cheaper clone.

## Implementation log

- 2026-06-09, SME doc created as the flagship example for the widget
  master-of-destiny program. No table-specific implementation started yet; the
  launch-blocking tier is the first work to schedule.
- 2026-06-10, Closed the import-friction gap. Imports now read CSV, JSON, XLS,
  and XLSX (SheetJS in the main process, src/main/gridImport.ts). A new
  per-table Import button opens a mapping wizard (TableImportDialog) that maps
  each file column onto an existing column, a new column, or skip, then upserts:
  pick a primary-key column and a matching incoming value updates that row in
  place while everything else is appended. New columns are created on apply. The
  matching and coercion are a pure planner (src/renderer/src/lib/tableImport.ts)
  with unit coverage (tests/unit/tableImport.test.ts, 8 cases) plus a grid-reader
  suite that round-trips a real xlsx (tests/unit/gridImport.test.ts, 7 cases).
  This delivers the "import/paste friction" gap item ahead of the launch-polish
  paste-a-grid work.
