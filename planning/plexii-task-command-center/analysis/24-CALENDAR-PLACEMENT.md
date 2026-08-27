# Analysis 24 — The calendar: placement, and what already exists

**2026-08-27 · RECOMMENDATION PASS. No code written; the operator asked for a
placement recommendation with reasoning before implementation.**

## 0. Recommendation

**Both — but not as "a widget plus a tab". The calendar becomes ONE component
rendered at two sizes: a live day column docked permanently in Attention, and
the full grid in its own destination. Attention never loses sight of the day;
the Calendar destination is where week and month planning happen.**

Concretely:

1. **Attention's right rail becomes a real day column.** The rail exists
   already (DEC-049: Today + Overdue radar, sticky, `340px`). Today's block is
   a *list* of what's on the calendar; it becomes a narrow **day grid** you can
   drag an item onto. Triage and scheduling stop being different places. The
   geometry works without redesign: the grid renders at `HOUR_PX = 44` with a
   15-minute snap, so a single day column inside 340px is roughly the density
   the week grid already uses per column.
2. **Calendar returns to the sidebar rail** as a peer of Attention, and holds
   the full surface: day / 3-day / week / month, with the Attention queue as a
   narrow list on its left to drag from.
3. **One grid component, two widths** — the same `variant` architecture
   DEC-048/050/051 established for the blocks and rows. Not two calendars.
4. **No list⇄calendar toggle anywhere.** A toggle is the one option to reject:
   it replaces the list with the grid, so the drag has nowhere to start.

### What Akiflow actually does — and why it changed this recommendation

I went in expecting Akiflow to have a Calendar tab. **It does not have one at
all.** Its window is a permanent three-zone split — nav sidebar, task list,
calendar — all visible at once. The calendar is docked on the right and never
goes away; pressing `I` / `T` / `U` changes only the *middle* column (Inbox /
Today / Upcoming). There is no Calendar item in their sidebar, and the only
calendar-hiding affordance (`0`) works on the Upcoming page, not on Today.
(`product.akiflow.com/help/articles/0807758-customize-your-calendar`,
`…/2426425-focus-mode`, `…/0741055-today-page`.)

That is a strong signal, and it argues against my first instinct of a
calendar-only destination: **the value is in the adjacency**, not the surface.
You drag from the list into the day without navigating, and the plan is always
in your peripheral vision. Their users asked for the *opposite* control for
years — "calendar-only view" (82 upvotes) and "resize/hide the task panel"
(122 upvotes) — which tells you the pairing is the default and hiding is the
exception.

So: adopt the adjacency (point 1), and keep a full destination (point 2)
because Plexi's Attention page is far denser than Akiflow's flat task list —
KPI band, AI strip, eight class tabs, lens control, tag filter — and a week or
month grid genuinely needs the width. Akiflow gets away with one surface
because their list is a plain list. Ours is a command center.

### Why not the brief's option 1 (a lens/toggle inside Attention)

It fails on the interaction, not on space: **planning needs the list and the
grid on screen together.** A toggle replaces one with the other. Akiflow's own
design confirms this — they never swap; they dock.

The second argument is drift, and this project has been bitten twice: a
calendar rendered inside Attention *plus* the existing `CalendarView` means two
grid implementations of the same data. DEC-048 fixed exactly that for home
widgets; DEC-051 fixed it again for widget rows. One grid, one row renderer,
two surfaces that share them — enforced by the variant prop, not by discipline.

### Why the rail, when Calendar already has a home

Calendar is not homeless today — it is an app tile inside the PlexiDesk
segment ("Your work by date"), gated on the `time_blocking` capability, plus a
⌘K entry. That is one level of nesting below Attention, which sits in the rail.

Discoverability should track frequency of use. Triage is continuous —
Attention earns its slot. Planning is a **daily ritual**, and Akiflow's
best-documented failure mode is users falling out of that ritual: an
independent practitioner guide reports that skipping it means *"overdue tasks
pile up, the inbox grows, and within a few days the whole system feels like a
burden"* (`dawid.ai/how-to-use-akiflow-effectively`), and their own Today page
stacks overdue items first by design. A surface whose value depends on a daily
visit should not be two clicks inside a segment grid. Keep the segment tile and
the ⌘K entry — they cost nothing — and add the rail row beside Attention.

### One coordination flag before this is acted on

DEC-020 recorded a **Caleb note**: *"the Calendar tab is a shared surface —
upstream merge must either carry this retirement or re-add the row; flagged in
the G6 ledger."* Restoring the rail row is therefore not purely our call; it
touches the same shared-surface boundary DEC-047 D-6 drew around desk status.
The recommendation stands, but it should go to Caleb before the row lands, and
the G6 ledger updated either way. Everything else here — rewiring the calendar
to the Attention layer, the day column, scheduling, sync — is ours alone.

### What this does NOT change

Attention remains the front door and the inbox. The calendar is a second lens
on the same objects, not a second place work lives — the rule that has
governed this layer since SPEC-017. Deep links run both ways: a block opens its
item; an item shows where it is scheduled.

---

## 1. What the app already has (verified in the tree, not inferred)

The framing question assumed the calendar is something we build. It mostly
already exists — and it is **disconnected from the Attention layer**, which is
the same defect DEC-048 fixed for the home widgets.

| Surface | File | State |
|---|---|---|
| Global calendar route (`kind: 'calendar'`) | `src/renderer/src/stores/view.ts` | exists, routed in `MainPane.tsx` |
| Calendar as an **app tile inside the PlexiDesk segment** ("Your work by date"), gated on the `time_blocking` capability | `components/segment/segments.tsx:50`, `lib/viewCapability.ts:26` | this — not ⌘K — is its real home today |
| Calendar view — month grid + week | `components/views/CalendarView.tsx` | works; **month and week only** — no day view, no 3-day |
| Week time grid — click-to-create, drag-move (cross-day), drag-resize both edges, accepts a dropped node | `components/views/WeekTimeGrid.tsx` | the real time-blocking surface; 06:00–23:00, 15-min snap |
| Recurrence — materialised forward on a 60-day horizon, deterministic occurrence ids, series-scoped delete | `main/db/timeBlocks.ts` | more complete than the brief assumes |
| Time blocks (data) | `stores/timeBlocks.ts`, `shared/types.ts` | `TimeBlock` has `taskId`, `startMs`, `durationMin`, `status`, `meeting`, `recurrence`, `seriesId` |
| "Today" block in Attention's rail | `components/attention/attentionBlocks.tsx` | DEC-049 — already merges today's blocks with due work |

**The disconnect, precisely:** `CalendarView.tsx` and `WeekTimeGrid.tsx`
contain **zero** references to `useWorkItemStore` or `workItem*`. The calendar
buckets `nodes` where `kind === 'task'` by `dueDate`, keyed off the legacy
`status` field. Attention items — which carry `dueAt` and `workItemState` —
**do not appear on the calendar at all**.

The link is *expressible but unreachable*: `time_blocks.task_id` is a foreign
key to `nodes(id)`, and work items are rows in `nodes`, so the column could
hold one today. But the grid resolves a block's node through `useNodeStore`,
and `listNodes()` filters work items out on purpose
(`... AND kind != 'work_item'`, `main/db/nodes.ts:149`). So a block pointed at
an Attention item would render blank. Nothing writes such a block anyway: the
`to_meet` queue's closing verb is a state flip to `scheduled` — **it does not
create a time block.**

## 2. The placement question is partly already answered — by DEC-020

DEC-020 (2026-08-25, operator-approved, verbatim: *"Retire the tabs and add
plan due dates to the feeders first"*) **removed Calendar from the sidebar
rail**, on the reasoning that Attention absorbed it. The view stayed reachable:

- as an **app tile inside the PlexiDesk segment** (`segments.tsx:50`) — its
  real home today, and a level of nesting below the rail,
- the ⌘K palette (`CommandCenter.tsx:384`),
- a project header tab (`WorkspaceHeader.tsx` — jumps to the calendar scoped
  to that project),
- home rail cards and radar suggestions.

So the honest framing is not "should the calendar get a tab?" but **"was
DEC-020 right, now that the calendar is becoming a planning surface rather
than a read-only month grid?"** A recommendation that silently re-adds the
tab would be reversing an operator decision without saying so.

**Why the premise changed.** DEC-020 retired the row when the calendar was a
read-only month grid of desk tasks by due date — genuinely redundant, because
Attention's feeders already surfaced those same due dates, better. Its own
wording makes the retirement conditional: *"palette reachability is the escape
hatch **while Attention earns trust**"*, and the alternatives it rejected were
about not losing a due date's surface. Nothing in that reasoning covers a
calendar you **plan into** — drag to schedule, auto-place, replan, push to a
shared work calendar. That is a different verb, used at a different moment,
and it is not a duplicate of anything Attention shows. DEC-020 was right about
the view it retired; it did not decide this question.

### The prior rulings already point this way

Two entries in the register matter, and both support acting now:

- **GAP-007** records the operator's own words that *"the Calendar tab sees ~no
  use"*, and pre-signals openness to a ground-up calendar rebuild.
- **DEC-009** (2026-08-24) ruled on it: the **engine stays** (`time_blocks`,
  synced, recurrence intact), and *"the UI surface carries a granted rebuild
  license (specific ruling when the UX is specced)"*. External calendar was
  classified **P2**.

So the calendar UI is already cleared for rebuild — this document is the
"specific ruling when the UX is specced" that DEC-009 asked for. And the
sequencing here (rewire and rebuild the surface first, external sync later)
matches the priority already set.

**With one caveat the register itself raises.** The rebuild licence rests on
**A-006** — *"nobody currently uses the calendar tab"* — which is recorded at
confidence 0.75, **operator-stated for their own use, other users unverified**,
and carries an explicit warning: *"PlexiDesk has real external releases … so
'nobody' extends beyond this machine — verify before a destructive rebuild
ships beyond the fork"*, with the remedy being *"a migration/compat plan
instead of a clean replace"*.

This plan is deliberately compatible with that caution: **Track A is a rewire,
not a replace.** The engine stays (DEC-009 already ruled it does), recurrence
and existing blocks are untouched, and the change is that Attention work
becomes visible on a calendar that previously could not see it. Nothing a
current user relies on is removed. The one item that does need checking before
it ships beyond the fork is the **nav row**, which is the shared surface DEC-020
flagged — same conversation as the Caleb note above.

Worth naming plainly: *why* does the Calendar tab see no use? Because it shows
desk tasks by due date — legacy data, ranked by a legacy scorer — while every
item the person actually captured lives in Attention and never appears there.
A calendar that cannot see your work is not a calendar you visit. That is a
data-wiring failure being read as a demand signal, and it is fixed in Track A.

## 3. What Attention's page can and cannot absorb

After DEC-049/050 the Attention page is: KPI band → AI strip → class tabs →
lens control (Queue / Due / Origin) → tag filter → queue cards → history
shelves, plus a sticky rail (Today, Overdue radar).

Three facts matter for placement:

- **The rail is the right home for the day, and it already exists.** The
  "Today" block is the brief's option-3 widget, already reading the real
  calendar. Upgrading it from a list to a narrow day grid is an evolution of a
  surface the page already has — not a new region competing for space.
- **A calendar is NOT a fourth lens.** Queue / Due / Origin are three groupings
  of one list, and it is tempting to read a calendar as the fourth. It isn't:
  the others re-sort rows in place, while a calendar replaces the list with a
  grid — and the moment it does, there is nothing left to drag *from*. The lens
  control is the wrong place to hang it, however neatly it would fit.
- **The main column cannot hold a week grid.** Drag-to-schedule, resize and
  multi-day navigation need the full width and height of a view, under a page
  that already spends its first screenful on a KPI band, an AI strip, class
  tabs, a lens control and a tag filter.

Hence the split: **the day lives in the rail** (adjacent, always visible,
droppable — Akiflow's insight at our scale), and **the week and month live in
their own destination** (room to plan, with the queue beside them).

## 4. Schema reality — what the brief needs vs. what the tables hold

`time_blocks` (`src/main/db/database.ts:871`):

```sql
id, task_id REFERENCES nodes(id) ON DELETE CASCADE,
title, start_ms, duration_min,
status CHECK (status IN ('planned','done')), created_at, updated_at
```

**The good news, and it is bigger than it looks:** `task_id` references
`nodes(id)`, and work items ARE nodes (`kind='work_item'`). WeekTimeGrid
already resolves a block's node generically ("a block can link to ANY node").
So **scheduling an Attention item into a time block needs no migration** —
the link is already expressible. Track A is UI and query work, not a data
migration, which is why it can move fast.

**What is genuinely missing**, per section of the brief:

| Need | Missing today | Delta |
|---|---|---|
| AI placed this block (so "replan" knows what it may move) | no provenance | `origin TEXT` — `manual` \| `auto` |
| "Don't move this" | none | `locked INTEGER DEFAULT 0` |
| Block didn't happen | `status` CHECK allows only planned/done | widen to `planned\|done\|missed\|skipped` |
| Push to external calendar, per block | none | `push_policy TEXT` (`local`\|`push`), `external_event_id`, `external_calendar_id`, `external_etag` (for `If-Match` → 412 reconcile), `sync_state`, `last_synced_at` |
| Busy/free + visibility on the pushed event | none | `transparency` (free → busy **escalates** when the deadline is at risk, per §5c), `visibility` (`default`\|`private`\|`busy_masked`) |
| "The user moved this in Google, so stop managing it" | none | covered by `locked` above — set automatically on any external edit (§5c) |
| Hard vs soft deadline (a hard one may schedule outside working hours) | work items carry `due_at` only | `due_kind TEXT` (`hard`\|`soft`) on the item |
| Working hours / protected time for the scheduler | **no setting exists anywhere** — `WeekTimeGrid` hard-codes 06:00–23:00 (`START_HOUR`/`END_HOUR`) | new settings: work-hours windows per weekday, protected ranges, max daily focus load |
| Deadline vs. scheduled work, visually distinct | calendar has no deadline row | render-layer only |
| 3-day view | month + week only | render-layer only |

**Two rankers already exist for the same question**, which is a drift risk
worth naming now: the Attention layer ranks with `rankScore`
(`lib/attentionQueues.ts`, used by the queues, Start-here and the KPI band),
while the calendar ranks with `priorityScore` (`lib/dashboardScope.ts`,
`node.priority * 1.2 + node.importance` over legacy fields). When the calendar
is rewired to the Attention layer, `priorityScore` must stop deciding what
Attention items show — one ranker, or the two surfaces will disagree about
what matters on the same day.

**One asset nothing else has:** the `energy` store logs self-reported energy
with 72h of history (`stores/energy.ts`, `window.api.energy.*`). Motion and
Reclaim schedule against clock time and priority; scheduling against *observed
energy* is a differentiator that is already instrumented.

## 5. The completion loop (brief §4) — design and honest feasibility

The brief is right that this is the highest-value piece: capture is easy,
closure is where task systems rot. It is also the piece most likely to stall
the calendar if bundled, so it stays a separate track.

### 5.1 The infrastructure this can stand on already exists

This was the surprise of the inventory pass. Three pieces are already built,
and they are the three hardest parts:

- **The anti-nag machinery.** `wi_notifications`
  (`src/main/notifications/substrate.ts`) has a `dedupe_key UNIQUE` across all
  time (`ON CONFLICT DO NOTHING` — a once-ever guarantee), a rolling
  `QUEUE_HOURLY_CAP = 5` per queue with overflow collapsing to one summary,
  escalation layers (`ambient` / `inbox` / `interruptive`), and a **mandatory
  `trigger` field** — `postNotification` throws without it. The brief's "never
  nag" is not something we need to invent; it is something we need to *use*.
- **The detector pattern.** `lib/radar.ts` is already "cheap, deterministic
  detectors (NO model call) over the user's REAL work… pure over (data, now)
  so each unit-tests exactly", surfaced as dismissible one-tap suggestions
  (`RadarSuggestions.tsx`). Completion detection is a fourth detector in that
  family, not a new subsystem.
- **The prompt.** `promptText({ title, label, choices })`
  (`components/plexi/PromptDialog.tsx`) is a focus-trapped, Esc/Enter-wired
  chooser already used for the desk-done and subtask offers. Enter-to-confirm
  is its default behaviour.

### 5.2 What genuinely does not exist

- **No typed action ledger.** `actionHistory` looks like one and is not:
  its entries are `{ label, undo, redo }` — closures in renderer memory,
  untyped, unpersisted, with no reference to what was acted on. Nothing in the
  app can answer *"what did the user just do, to what object, when."*
- **No external deep links.** `sourceType` takes exactly four values today —
  `note`, `widget`, `widgets`, `chat` — all internal Plexi ids, and there is
  **no `sourceUrl` column anywhere** (zero hits repo-wide). The one URL scheme
  in the app (`haptyx://meet?room=…`) points *into* Plexi.
- **No Slack anything.** Slack exists as a webview bookmark, a logo, and an
  outbound webhook placeholder. There is no token, no API client, no events.

### 5.3 The shape, revised onto what exists

**Baseline (ships with the calendar).** Add the deep link at capture:
`source_url TEXT` on the work-item manifest, plus new `sourceType` values
(`email`, `web`, `app`). The capture paths that already record context
(`lib/contextMenu/universal.ts`, `CaptureConsole`, the web panel) fill it; the
row's existing "open it here" action gains an external sibling. Cheap,
independent, immediately shortens the manual loop.

**Detection, in the Radar family.** A pure
`detectCompletion(items, signals, now) → CompletionSuggestion[]`, scored on:
same `source_ref`/`source_url` target, same desk (`parent_id`), a mention
naming the target, recency, and **intent compatibility** — a `to_respond` item
is satisfied by a message sent, `to_review` by a document edited, `to_meet` by
a meeting ending. Pure ⇒ unit-tested like every other detector here.

**Prompting, through the substrate.** One notification per candidate with
`dedupeKey = completion:<itemId>:<signalId>`, `category:'attention'`,
`layer:'ambient'`, `trigger:'completion-detected'`. The UNIQUE dedupe key
makes "never prompt twice for the same evidence" a database guarantee rather
than a code convention, and the hourly cap makes "never nag" structural. The
prompt itself is `promptText` with two choices — the Enter default completes,
Esc dismisses. **Never auto-complete**: the notification is the only path, and
it always requires the keystroke.

### 5.4 Feasibility, tier by tier — the honest read

| Tier | What it detects | Feasibility |
|---|---|---|
| **1 — inside Plexi** | a Plexi message sent, a doc/sticky edited, a widget action, a meeting ended (`wrapup` already runs a full end-of-meeting pipeline), a focus session finished on a block linked to the item | **High.** We own these events. Needs the typed ledger (§5.2) — the one real new piece — plus the detector. Worth building alone; this is the right first increment. |
| **2 — Plexi-hosted external apps** (the webview panel) | "you sent a Slack message in the embedded Slack" | **Medium, and brittle.** The browser agent (`main/ai/browserActions.ts`) can drive and read a page, but it is command-driven, not observational — nothing subscribes it to user activity. Observing a third-party DOM breaks on their next redesign and crosses a privacy line that needs explicit per-app consent. Skip until Tier 3 exists. |
| **3a — email replies, over the IMAP we already have** | "you replied to the email this item came from" | **Higher than expected — no new auth at all.** Mail is a real IMAP/SMTP client with push (`onNewMail`). `sampleSent()` already locates and reads the Sent folder; `parseThreadingHeaders()` already extracts `In-Reply-To`/`References`. Capture the source Message-ID, then a reply is a Sent message whose threading headers contain it. And because `detectMailRadar` already polls mail on a timer, **this needs no ledger either** — it is a poll, exactly like the detector beside it. This is the cheapest true instance of the brief's target behaviour and should be the first external signal. |
| **3b — Slack and other SaaS** | "you replied in the thread this item came from" | **Real but expensive.** Needs OAuth + `conversations.history` scoped to the linked channel after the capture timestamp. No OAuth client exists anywhere in the app (mail is IMAP-only and says so; there are no Google/Graph SDKs in `package.json`). This is the same infrastructure external calendar sync (§3) needs — one OAuth layer, shared, and whichever track ships first pays for it. |

## 5b. Akiflow, in the detail that matters

Sourced from their own help centre and changelog unless noted. Three findings
change what we build; the rest is confirmation.

### Push-to-external is OFF by default, and that answers brief §3

Time-blocking a task in Akiflow puts it on *their* calendar only. Pushing it to
the connected external calendar is an explicit act called **"lock"** — a lock
icon on the block, plus a global default under Settings → Tasks, Events, Slots
(**Lock Tasks** and **Lock Time Slots** are separate toggles, both off).
Locking asks for visibility: **Public / Private / Busy**. Recurring tasks
auto-lock 15 instances forward.
(`…/3677363-time-blocking-101`, `…/0006630-task-features`, `…/7791811-settings`.)

That is exactly the model the brief asks for — per-block choice with a global
default — and it is the established convention, so **match it, including the
default: local unless you say otherwise.** Add their third visibility option
(Busy — title hidden even from admins); it is what makes pushing safe enough to
be the shared-visibility feature the brief wants.

### The replan guardrails are the real lesson for §2

Two distinct features, and the distinction is worth copying:

- **Replan Undone Tasks** — a "Magic Button" on a Time Slot that sweeps what
  you didn't finish and suggests **the next slot in the same recurring series,
  or the next slot already on your calendar carrying the same project**. It
  reschedules into *structure you already committed to*, not into arbitrary gaps.
- **Schedule Optimizer** — appears when you shorten or drag a task into a
  conflict, and reflows the rest of that day *preserving order*; an **ASAP**
  mode drops one task into the next free slot today.

What it deliberately **will not touch**: calendar events, time slots, recurring
task instances, tasks *above* the one you modified, and completed tasks. It
won't schedule into the past, and it won't rearrange at all if things can't fit
in the same day. (`…/3089241-time-slots`, `…/3161671-schedule-optimizer`.)

**Adopt that refusal list verbatim.** It is the difference between an optimiser
users trust and one they fight — and it is the answer to "what stops the AI
from rearranging my day behind my back."

### Time Slots map onto nesting we already built

A Slot is a container on the calendar holding several tasks; overlapping tasks
scheduled at the same time are **auto-bundled** into one. Tasks inside sort by
planned time, with manual drag reordering. Slots inherit colour from their
Project and carry a countdown and completion bar.

We do not need a new container concept: DEC-048 gave us 3-level nesting with
ordered children and `subtaskProgress` (the "2/5" and its bar). **A slot is a
parent work item with its subtasks scheduled inside it.** One model, not two.

Note their open defect here: **manual order inside a slot is not persisted** —
reorder, navigate away, and it reverts (their feedback board, unanswered). Our
`sortOrder` persists by design (DEC-035), so this is a free win.

### The keyboard model to extend ⌘K toward

Global capture is `Cmd+E` and works **anywhere on the machine** — copy text in
any app, `Cmd+E`, Enter, and the task lands with the page title, link and the
selected text. In-app the bar is `Cmd+K`. Structured entry rides trigger
characters inside the bar: `>` time slot · `=` duration · `#` project · `*`
tags · `<` deadline · `!` priority · `|` calendar/lock · `@` guests · `//`
description. Search is deliberately a *separate* key (`/`).

Single-key actions on the selected task: `P` plan · `E` done · `!` priority ·
`#` project · `<` deadline · `Cmd+=` duration · `F` focus · `J`/`K` move
through the list. (`…/7262522-keyboard-shortcuts`, `…/6483573-command-bar`.)

Two implications: (a) our ⌘K already does more *breadth* than theirs (deep
content search, omnibar routing, widget add) but has **no single-key actions on
a selected item** — that is the gap; (b) **`Cmd+E`-style global capture needs
Electron `globalShortcut`, which this app has never registered** (verified:
zero occurrences). Their capture-from-anywhere is a genuine capability gap, and
it is also the cheapest source of the deep links §5 needs.

### What to avoid, from their own users

- **One-way sync is their most specific, repeated complaint** — Slack tasks
  don't sync back when completed; Notion one-way; Gmail failures. It is exactly
  the gap our §5 completion loop closes, and it is why that track matters more
  than another calendar feature.
- **No task export at all**, and one reviewer lost access with no way out. Any
  data we hold should be exportable from day one.
- **Density fails at scale** — reviewers specifically flag weak handling of
  large task lists, and no responsive behaviour is documented at narrow widths.
- **Overdue compounds by design**: missed recurring instances stack while new
  ones keep generating, so a missed week has to be cleaned up by hand.
- **Over-organising is a named complaint** — a reviewer reports spending so
  long arranging tasks that she doesn't do them. Every affordance we add to the
  planning surface should be judged against that.

## 5c. External sync (brief §3) — the convention, researched

The brief said to find the established convention and implement it rather than
invent one. Here it is, with the half of the stated baseline that holds and the
half that does not.

### The baseline, adjudicated

> *"last-write-wins, with the external calendar as source of truth for events
> that originated there, and Plexi as source of truth for Plexi-native tasks
> and blocks"*

- **Second clause: confirmed, and it is the industry model.** Motion documents
  it explicitly — *events* sync bi-directionally, *tasks* sync one way
  (Motion → calendar) because external calendars can't carry the metadata the
  scheduler needs (priority, duration, deadline), and accepting inbound task
  edits would corrupt scheduling. External events always override task blocks.
  Reclaim reaches the same place differently: every non-Reclaim event is
  treated as Critical by default, so Reclaim never overbooks one. Todoist goes
  further — calendar events are read-only inside the app.
- **First clause: refuted. Nobody uses timestamp last-write-wins.** Both
  platforms ship optimistic concurrency instead: Google `If-Match` + ETag,
  Graph `If-Match` + `changeKey`, both returning **412 Precondition Failed**,
  and the documented remedy is *re-fetch and re-apply* — never blind overwrite.
  Adopt 412-and-reconcile; it is the difference between losing a user's edit
  and merging it.

### The decision that matters most: the user drags our block in Google

Two shipped answers, and they are opposites:

| | **Reclaim — honour and pin** | **Motion — ignore** |
|---|---|---|
| The drag | keeps the new time, and **auto-locks** the block so nothing moves it again | block **stays at its original time**; Motion never learns about the drag |
| Breadth | any direct external edit locks it, not just a move | — |
| Aftermath | locked blocks are always written Busy | the dragged block is a stale orphan until rewritten |

**Adopt Reclaim's.** A manual edit in the external calendar is the strongest
statement of intent a person can make, and silently discarding it is the most
trust-destroying thing this feature could do. The elegant part is that the edit
doesn't just win once — it **changes the block's mode** from scheduler-managed
to user-pinned, which resolves the conflict permanently instead of
re-litigating it on every pass. That is exactly the `locked` column in §4, and
it matches the operator's own instruction for the local case: *"Do not
auto-replan… the user decides."*

**Field ownership splits too:** Reclaim accepts external *time* changes and
re-asserts its own title, description, colour and linkage. **Time is
user-owned; identity is app-owned** — otherwise a renamed block becomes an
unattributable orphan.

*(Worth noting: Sunsama, Morgen and Akiflow publish no conflict rule at all for
externally-edited app blocks, despite all three marketing two-way sync. Read
the silence as a finding — this is the hard part.)*

### Busy or free? The convention is neither — it escalates

Motion and Reclaim converged independently on: **blocks are written FREE, and
escalate to BUSY only when the deadline is genuinely at risk.** Motion ships it
as a setting ("Show At-Risk Tasks as Busy"); Reclaim encodes the state visually
(dotted+🆓 free, solid+🛡️ busy, 🔒 locked — and locked is always busy).
Google's own first-party API agrees: `focusTime` and `outOfOffice` events
*require* `transparency: opaque`, while `workingLocation` requires
`transparent` — defended time is busy, informational time is free.

Akiflow is the only one with a true **per-block** choice at push time
(Public / Private / Busy-with-title-masked), with push off by default. Combine
them: **default local; on push, free-then-escalate; per-block visibility
override including title-masked Busy.** That is precisely the brief's ask, and
it is what users already expect.

### Mechanics, and the traps that cost real data

**Google:** scopes `calendar.events` + `calendar.readonly`. Full `events.list`
→ persist `nextSyncToken` (**only on the final page**) → `watch` channel per
calendar (**7-day TTL, no auto-renew, notifications carry no body — a doorbell,
not a payload**) → incremental list on ring → on `410 fullSyncRequired`, wipe
and full-resync. **Google states plainly that a small percentage of push
notifications are dropped under normal conditions**, so a low-frequency poll is
a required backstop, not an optimisation. Set our **own event `id`** on insert:
a retry then returns `409 duplicate` instead of creating a second event — the
cheapest correct de-dup available — and stamp
`extendedProperties.private` with `{app_id, item_id, schema_version}`
(key ≤44 chars, value ≤1024, both silently truncated). Note `syncToken` is
**incompatible with any filtering**, so reconciliation is local by necessity.

**Graph:** `Calendars.ReadWrite` + `Calendars.Read.Shared` +
**`MailboxSettings.Read`** (the only way to get an Outlook user's timezone) +
`offline_access`. Send **`Prefer: IdType="ImmutableId"` on every request** —
including subscription creation — or an item moved between folders orphans our
record. Use `transactionId` for idempotency and
`singleValueExtendedProperties` for the app id (open extensions **cannot be
filtered**). Webhook contract is unforgiving: **acknowledge within 3 seconds**
(validate `clientState`, enqueue, return `202`) or the endpoint gets marked
slow, then dropped — and dropped notifications are unrecoverable. Set
`lifecycleNotificationUrl` **at creation** (it cannot be added later); its
`missed` event means "run a full delta resync".

**The three traps worth naming in the code:**

1. **Graph's `calendarView/delta` window is frozen into the token, and an event
   moved outside it reports as `@removed: deleted`.** A meeting dragged from
   this month to next is byte-identical to a deletion — re-fetch by id to
   disambiguate, or we will delete real events.
2. **`iCalUID` semantics are inverted between platforms** — shared across a
   recurring series on Google, different per occurrence on Graph. Porting the
   Google assumption silently corrupts series.
3. **Patch, never delete-and-recreate.** Beyond being racier, Google throttles
   accounts that create very large numbers of events — *possibly for months* —
   and a re-optimising scheduler is exactly the shape that trips it.

And one rule that is cheap to honour and expensive to discover: **never put
attendees on an auto-movable block.** A scheduler that re-optimises fifty times
a week would email every guest fifty times.

### Scheduling defaults worth stealing (brief §2)

- **Deadlines: hard vs soft.** Motion's highest-leverage field — a *hard*
  deadline is permitted to schedule outside working hours. Ours should carry
  the same distinction rather than treating every due date alike.
- **Chunking with a minimum block size**, and Reclaim's trick of using *max*
  duration as the spacing control so chunks don't stack back-to-back.
- **Ordering:** ASAP → hard deadline → soonest soft deadline → priority →
  duration. Our `rankScore` already encodes most of this.
- **Daily load ceiling.** Neither Motion nor Reclaim enforces one — Sunsama
  does, and recommends **~5.5 hours of planned work per day** for new users.
  That single number is the best available calibration against the
  over-optimism that makes a disrupted day cascade.
- **All-day busy events are the documented #1 cause of "why won't it schedule
  anything?"** at both Motion and Reclaim. Surface that diagnosis in the UI
  instead of making the operator find a help article.
- **Rollover:** auto-roll incomplete work forward, but add Akiflow's **one-hour
  grace period** before anything is marked overdue (the cheapest possible fix
  for "I finished it at 5:04"), and let the roll be a prompt rather than
  silent, per Sunsama.
- **Don't over-pin by default** — Motion's own docs warn that too many locked
  tasks starve the scheduler. Guardrails should be user-invoked.

## 6. Merge map — Akiflow's feature set against what Plexi already holds

| Akiflow | Plexi today | Verdict |
|---|---|---|
| Universal Inbox (flat pile from many apps) | The Attention layer — same job, **already classified** into eight intents with a state machine and a ranker | **We are ahead.** Their inbox is undifferentiated; ours knows what each item is *for*. Do not rebuild. |
| Command Bar (capture + triage + navigate, keyboard-first) | `CommandCenter.tsx` (⌘K) — 1,100 lines: navigate, create, deep content search, omnibar routing, widget add, and an `@attention` capture path with a Tab-armed pill | **Ahead on breadth, behind on depth.** What's missing is the part users actually praise: **single-key actions on a selected item** (plan / complete / priority / duration). Also missing: any shortcut *registry* — all nine global bindings are ad-hoc `useEffect` listeners, and `lib/keymap.ts` remaps only canvas letters. A keyboard-first planning surface needs that registry first. |
| Manual time blocking | `time_blocks` + `WeekTimeGrid`, but linked to desk tasks and driven by a second ranker | **Extend + rewire.** The FK already permits pointing at a work item; the resolution path and the queries are what need doing. |
| Push a block to the external calendar ("lock"), off by default, per-item + global, Public/Private/Busy | outbound `.ics`/Google-URL export on *meeting* blocks only, one-shot | **Extend to the convention** — it answers brief §3 exactly, and the default (local) matches what users expect. |
| Global capture from any app (`Cmd+E`, carries page title + link + selection) | ⌘K works in-app only; **no `globalShortcut` is registered anywhere** | **Net-new, and doubly valuable** — it is also the cheapest source of the external deep links §5 needs. |
| Deadline row (deadlines separate from blocks) | absent | **Net-new**, render-layer only. |
| Time slots (several tasks in one block) | absent as a concept — but DEC-048 nesting + `subtaskProgress` is the same structure | **Reuse, don't invent.** A slot = a parent item with its subtasks scheduled inside; their countdown/completion bar is our progress bar. Their manual-order-not-persisted defect is a free win for us (`sortOrder` persists). |
| Replan undone tasks | absent | **Net-new**, cheap once blocks carry `origin`/`locked` — and copy their refusal list (never move events, slots, recurring instances, tasks above the edit, or completed work; never into the past). |
| Labels / projects | desks, plans, rooms, tags, mentions | **Ahead.** Skip. |
| Availability sharing | absent | **Skip for now** — needs external sync plus a public booking surface, and their own version is criticised as unbrandable. Not on the critical path. |
| Recurring tasks | Blocks recur properly — daily/weekly/monthly, materialised 60 days forward with deterministic ids and series-scoped deletes. Work items have no recurrence. Note `TimeBlockPatch` has no `recurrence` field: a pattern cannot be edited in place, only deleted and recreated. | **Partial.** Recommendation: recurrence stays on the block (as today); add in-place pattern editing before exposing it more prominently. |
| Write-back to source apps | §5 completion loop | **The differentiator, and their loudest complaint** — Slack/Notion/Gmail one-way sync is the specific thing their reviewers name. Separate track. |
| Auto-scheduling | Two naive precedents exist: the **Daily Brief** slots the top 3 tasks into fixed offsets from tomorrow 9am (`main/ai/dailyBriefContext.ts`), and the AI **`schedule-event` proposal** runs end-to-end (model → approval → real block, `actionExecutor.ts:335`). Neither computes free/busy — nothing in the app scans blocks for gaps. | **Net-new solver, but not net-new plumbing.** The approval path and the write path already work; what's missing is the placement logic. Second differentiator (Akiflow makes you plan by hand). |

## 7. Build sequence

Four tracks, ordered so each ships something usable and nothing blocks on
OAuth until it must.

**Why A and B1 are far cheaper than the brief assumes.** `WeekTimeGrid`
*already* implements the hard interactions: drag a block to another time or
another day, drag either edge to resize, and it accepts **a node dropped onto the
grid to book it** (`dataTransfer` type `text/fb-node` → look the node up →
create the block). Brief §1's "drag a task onto the calendar" and "drag to
resize" are therefore not new machinery — they are a wiring job.

Two caveats, both worth knowing before estimating. First, that drop path is
**currently unreachable**: `text/fb-node` has zero producers in the renderer
(only `text/fb-node-move` exists, in `FoldersCard`), so the receiver was built
and never connected. Second, one seam blocks connecting it: `listNodes()` filters work items out of the node store on purpose
(`... AND kind != 'work_item'`, `src/main/db/nodes.ts:149`), so the grid's
lookup cannot resolve an Attention item. The fix is to carry the payload on
the drag (or resolve against the work-item store too) — small, and worth
doing deliberately rather than by widening `listNodes`, which would leak work
items into every desk surface that reads it.

**Track A — make the calendar tell the truth (no new tables).**
Rewire `CalendarView`/`WeekTimeGrid` off `nodes`+`priorityScore` onto work
items + `rankScore`; add the deadline row (due items) as a band above the grid,
visually distinct from blocks; add day and 3-day views; adopt the DEC-048/050
row grammar so a task on the calendar is recognisably the same object it is in
the queue. Then render the **same grid narrow** as Attention's day column,
replacing the DEC-049 "Today" list block. Ships alone and is immediately
valuable, because today the calendar cannot see Attention work at all — which
is the likeliest reason the operator finds the tab unused (GAP-007).

**Track B — scheduling by hand, then by machine.**
B1: drag an item from the queue onto the grid → creates a block linked to it;
drag-resize changes duration. B2: schema delta (`origin`, `locked`, widened
`status`) + working-hours settings. B3: auto-place using the existing
`rankScore` plus due date, urgency, **momentum** and **energy**.

Neither of those last two is from scratch. *Momentum* is the closing-streak
machinery DEC-048 already shipped (`trendLines` counts consecutive closing days
from `updatedAt`) — grouped by desk/plan instead of globally, it answers "which
project is he riding". *Energy* is `stores/energy.ts`, which logs self-reported
levels with 72h of history and today feeds only a sort key on All Tasks;
pointing the scheduler at it is the differentiator Motion and Reclaim
structurally cannot have, because they never ask.

B4: "replan undone" — sweep `missed` blocks, respecting `locked`, and adopt
Akiflow's refusal list (§5b) rather than a free-for-all re-optimiser.

**Track C — external sync (the expensive one).**
Needs an OAuth layer that does not exist anywhere in the app. Google first,
Graph second. Per-block `push_policy` with a global default, `external_*`
columns for round-tripping.

Two assets make this less green-field than it looks. **`shared/ics.ts` already
builds VCALENDAR/VEVENT output and Google "add event" URLs** — today wired to a
one-shot export on meeting blocks only (`WeekTimeGrid` → `calendar:addMeetingIcs`
→ temp file → `shell.openPath`). And **`main/connectors/connectors.ts` already
specifies the sync contract** the work needs — declared capabilities
(`read/write/webhooks/incrementalSync`), a durable resume cursor with
idempotent `applySyncBatch` (this is exactly Google's `syncToken` model),
exponential `backoffMs` for rate limits, most-restrictive permission mapping,
and "removing a connector never deletes what it imported". It is currently
imported by **one unit test and no production code** — a specified, tested
contract waiting for its first real implementation. The Google connector
should be that implementation rather than inventing its own bookkeeping.

Build it to the convention in §5c, not to first principles: push-plus-poll
(never push-only), own event ids for idempotency, extended properties for
recovery, 412-and-reconcile rather than last-write-wins, honour-and-pin on any
external edit, and free-escalating-to-busy transparency.

Do not start before A and B1 are in a user's hands.

**Track D — the completion loop (separate track, per the brief).**
D1: capture deep links at source (new source types + a link column + an "open
source" action) — cheap, ships with Track A. D2: the typed signal ledger and
the pure matcher, with in-Plexi signals only. D3: email replies over the
existing IMAP (§5.4, tier 3a). D4: Slack, once Track C has paid for OAuth.

---

*The Akiflow research findings and the sync-convention standard are appended
below as those passes land.*
