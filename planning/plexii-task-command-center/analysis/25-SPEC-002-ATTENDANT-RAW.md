# Analysis 25 — SPEC-002 "The Attendant" (raw, verbatim)

**Recovered 2026-08-30.** The operator delivered this spec in-session on
2026-08-29 (transcript `df9200c8`, ~/.claude/projects/-Users-ryanmcquillan-AI/);
until this file it existed nowhere in the repo. Preserved verbatim below —
including its self-assigned decision/crossroads numbers, which COLLIDE with the
live log (see analysis/26 §2.4) and must be re-minted before any ruling.

**Status: REFERENCE ONLY.** The spec is a draft for ruling, not an approved
plan. Nothing in it is authorized for build. The verified comparison against
the as-built system is [26-SPEC-002-ATTENDANT-COMPARISON.md](26-SPEC-002-ATTENDANT-COMPARISON.md).

---

# SPEC-002 — The Attendant
**Subtitle:** Akiflow teardown → executive-assistant model → Attention Layer behavioural spec
**Status:** Draft for ruling. Sits downstream of SPEC-001-CONSOLIDATED and DEC-014.
**Scope:** Interface + interaction spec for the Attention surface, and the behavioural spec for the agent that operates it.
---
## 0. What this document is
DEC-012 named the surface. DEC-014 named the eight categories. Neither answered the two questions that decide whether Attention feels like a product or a list:
1. **What does the surface look like and how do you drive it?**
2. **What does the agent behind it do when nobody is asking it anything?**
This spec answers both by triangulating two sources: Akiflow — the closest existing thing to the interface we want — and the executive-assistant relationship, which is the closest existing thing to the *agent* we want.
The naming proposal throughout is **the Attendant**: the layer that sits below Plexi's primary agent, watches, routes, prepares, and speaks rarely. It shares a root with Attention on purpose. Alternative considered and rejected: "Chief of Staff" (implies delegated decision authority, which is exactly the thing we are refusing).
---
# PART I — AKIFLOW TEARDOWN
## 1.1 What Akiflow actually is
Not a task manager and not a project tool. It is a **personal execution layer that sits on top of other people's systems**. Work continues to live in Jira, Asana, Linear, Gmail, Slack, Notion; Akiflow pulls the items assigned to you into one triage queue and makes you put each one on a calendar.
Founded 2020, Padua, Italy; YC S20; claims 100k+ users. Desktop-first (Electron-class Mac/Windows app), with iOS/Android and web.
Note the architectural sympathy: this is the same "reference, don't own" instinct as Attention. Akiflow arrived at it commercially rather than architecturally, and — as Part I.11 shows — it pays for having arrived only halfway.
## 1.2 Structure model
Four levels, plus a time axis:
| Layer | Rule |
|---|---|
| Folders | Containers of projects |
| Projects | **Exclusive** — a task lives in exactly one. Colour-coded; colours propagate to calendar blocks |
| Sections | Subdivisions inside a project page |
| Tags | **Additive** — many per task. Used for cross-cutting states like "waiting for", "quick win" |
The projects/tags split is the load-bearing distinction: *projects are what the work belongs to; tags are how you want to filter it.* Experienced users report tag sprawl degrades the system, so they keep tags to a handful.
Time axis (the "Upcoming" page, `U`): **Today → This Week → Next Week → This Month → Next Month → Someday**, with Inbox as the widest container. Four zoom levels: Overview, Days, Weeks, Months.
There is a `Goal` priority tier (`H`) that marks the small number of tasks that actually move things forward. Weekly Planning writes goals as Goal-priority tasks.
**What it deliberately lacks:** subtasks, dependencies, Kanban/Gantt, team assignment, and — notably — a *time* component on deadlines (deadlines are date-only, which reviewers call out as a real gap).
## 1.3 The core loop
Three phases, and skipping any one collapses the system:
- **Capture** — everything lands in the Universal Inbox. Global command bar (`Cmd+E`, works from any app), natural language (`Call John tomorrow 3pm for 1h #Marketing` parses date, time, duration, project). Copy a URL first and it auto-attaches. Star a Gmail message or "later" a Slack message and it appears.
- **Process** — triage the Inbox on purpose. Inbox is deliberately walled off from Today so incoming work cannot corrupt an already-committed plan. Per item: under two minutes → do it and press `E`; otherwise `P` to schedule or `Cmd+S` to Someday.
- **Execute** — work from the *calendar*, not the list. Day view, `F` for focus.
**The design lesson:** the wall between Inbox and Today is the single most important structural decision in the product. It is what makes the queue non-anxious. Attention needs the equivalent wall.
## 1.4 Interaction model
This is the part worth stealing wholesale.
**Two command bars, one binding, different scopes.** `Cmd+E` is a *system-global* invocation — it works while you are in Figma or Chrome. `Cmd+K` is the same bar scoped inside the app. Same mental model, no relearning.
**Modal single-key verbs.** With a task selected, one unmodified keystroke does the thing. The published set:
| Key | Action | Key | Action |
|---|---|---|---|
| `C` | create task | `E` | mark done |
| `P` | plan / replan | `Cmd+S` | send to Someday |
| `H` | set as Goal | `!` | priority |
| `#` | assign project | `*` | assign tag |
| `<` | deadline | `Cmd+=` | duration |
| `O` | open attached link | `Cmd+O` | copy link |
| `F` | focus mode | `Cmd+D` | duplicate |
| `J`/`K` | prev/next | `Cmd+Z` | undo |
| `I`/`T`/`U` | Inbox / Today / Upcoming | `G` | go to anything |
| `A` | chat to Aki | `⌥A` | voice to Aki |
| `S` | share availability | `@` | meet with |
| `/` | search | `?` | shortcut help |
Every one is remappable in Settings → Shortcuts.
**The special-character grammar is shared between the command bar and the task editor.** `#` means project everywhere. `*` means tag everywhere. `<` means deadline everywhere. There is one syntax, not a typing syntax and a clicking syntax. This is why users describe becoming "blazing fast" — the grammar transfers.
## 1.5 Time Slots — the actual differentiator
A **Time Slot** is a named, project-coloured container placed on the calendar that holds *multiple* tasks. `⌥Click` the calendar to create one. It shows a progress bar as the tasks inside complete. It can recur, so "Monday Admin" or "Wednesday Deep Work" reappears weekly, pre-shaped and ready to be filled during planning.
**Locking:** a scheduled task can be locked, which writes a real busy event to the connected Google/Outlook calendar so colleagues see the time is taken. Auto-lock can be defaulted on.
Time Slots are the answer to a problem every time-blocker hits: blocking at task granularity is too fine, and blocking at "work" granularity is too coarse. A named container with a fill level is the right unit. **This maps almost perfectly onto a PlexiDesk desk** — see §3.7.
## 1.6 Rituals
Configurable in Settings → Rituals, with auto-triggers at chosen times.
- **Daily Planning** (~5–10 min): review yesterday; note that un-replanned pending tasks auto-roll into today and will silently overload it; review inbox and Someday; set 1–3 goals; time-block.
- **Daily Shutdown**: review what completed, analyse where time actually went, optionally plan tomorrow, add free-text notes that surface at the bottom of Today.
- **Weekly Planning / Weekly Shutdown**: last week's recap, goal review, write next week's Goal-priority tasks, pull items up from Inbox/Month/Someday into the Week frame, then create Time Slots and block everything.
- Skipping a shutdown makes it step one of the next planning session. The ritual chain is self-healing.
Experienced users are unanimous that rituals are the part people skip and the part that matters — without them overdue items pile up and the system becomes a burden within days.
## 1.7 Aki — what it is, and what it pointedly is not
Aki is an in-app assistant with a deliberately friendly persona. Turned on at Settings → AI Center. Reachable at `A` (chat), `⌥A` (voice), inside the command bar via a "Text Aki" option, and via `Tab` in the command bar to dictate then `Enter` to send.
**Surfaces it reaches you through:**
- In-app chat + desktop corner button
- Mobile: daily dashboard, plus a mic on task/event creation
- **WhatsApp** — full task/calendar management by text or voice note, no app open
- **Siri** — "Use Akiflow, add a task…" (English only; needs the two-step "Use Akiflow" preamble)
- **Email** — forward anything to `aki@akiflow.com` and it extracts events/tasks. Flight confirmations become events. Only processes mail where Aki is in the To field, not CC/BCC.
- 50+ languages typed, 30+ spoken.
**AI Workflows** are the automation primitive: a natural-language prompt compiled into trigger + conditions + actions, configured at Settings → AI Workflows. The published community library is instructive about what people actually want:
- daily schedule overview
- alert on overlapping meetings
- if overdue tasks exist, propose new times
- insert breaks if >3h of meetings today
- if Inbox exceeds 10 items, prompt a clear-out
- flight check-in reminders
- weather-conditional exercise suggestions
- "when's my first meeting tomorrow?"
Note the shape: **almost all of these are conditional observations that end in a nudge, not an action.** That is the real product surface people want, and it is exactly the Attendant's job description.
**What Aki refuses to do:** auto-schedule your day. Reviewers consistently frame Akiflow as the "assist, don't override" option against Motion and Reclaim, which fill your calendar for you. Users who want that leave for Motion; users who stay say the balance is the reason they stay. Critics wish for deeper auto-reschedule.
A **Meeting Assistant** handles notes, transcripts, highlights, action-item extraction and follow-up emails, pushing extracted actions into the Inbox rather than into a separate silo.
An **MCP server** is live, so external agents can drive Akiflow.
## 1.8 Ambient surfaces
- **Tray / menu bar** (`Cmd+Y`): the day at a glance, next thing up, one-click join.
- **`Cmd+J`**: join the upcoming meeting from anywhere.
- **Share Availability** (`S`): select free slots, generate a booking link with buffers and caps, checks all connected calendars. Multiple users report it replaced their Calendly subscription.
## 1.9 What people love
Ranked by frequency across G2, Capterra, Product Hunt, Trustpilot and long-form reviews:
1. **The Universal Inbox.** Cited most often as the thing that keeps the subscription. One place to see everything assigned to you across five tools.
2. **The keyboard shortcuts and command bar.** "A shortcut for everything." Users describe genuinely reduced overhead once learned.
3. **Time-blocking implementation quality.** Cleanest execution of the pattern many reviewers have tried.
4. **Rituals.** The daily review is repeatedly described as worth the price on its own — starting the day on purpose rather than in panic.
5. **The calendar/task seam.** No context-switch between deciding and scheduling.
6. **Support and onboarding.** Named support staff, real onboarding calls, active Slack community.
7. **Share Availability.** Replaced a separate paid tool.
8. **Assist-don't-override AI.** For the segment that stays, this is a feature and not a shortfall.
## 1.10 What people hate
1. **Mobile.** By a wide margin the loudest product complaint. Rated well below desktop (roughly 3.8/5 Android, 4.2/5 iOS against a 4.7 Capterra overall), with unresponsive touch targets, drag-and-drop failures, occasional total load failures forcing the web app, and missing desktop features. Described repeatedly as an afterthought.
2. **Price with no free tier.** $34/mo monthly, ~$19/mo annual, 7-day trial requiring a card. Reddit sentiment describes it as outrageously priced relative to peers.
3. **Billing conduct.** The angriest reviews are not about the product. Charges landing without warning emails, refusals to refund during or immediately after trial, difficulty cancelling. This has become a brand liability.
4. **Sync that is one-way in practice while marketed as two-way.** Completing in Akiflow does not reliably complete at source for several integrations. Users end up double-updating.
5. **No export.** One user lost account access and could not retrieve their tasks. For a tool positioned as your single source of truth, this is disqualifying.
6. **No Apple Calendar / iCloud / CalDAV.** Hard blocker for a large Mac population.
7. **No timed deadlines.** Date-only deadlines described as a missing industry standard.
8. **No subtasks.** Real work decomposes; the model does not.
9. **Learning curve.** Clean surface, dense underneath. Users report months of not knowing how to use it fully.
10. **The over-organising trap.** Users self-report spending planning time instead of working time. The tool rewards fiddling.
11. **Integration noise.** Connect everything at once and the Inbox becomes unusable. Jira in particular floods it.
12. **Project sprawl with no archive**, made worse by AI auto-assigning new tasks into dead projects.
## 1.11 Design read
**Visual:** clean, low-chroma, high-density. Purple accent (~`#9000ff`/`#cb52ff`). Colour is used semantically — project colour carries from the project into the calendar block, so a glance at the day tells you the *shape* of your attention across domains without reading a word. Dark mode is first-class.
**Layout:** persistent two-panel — task list left, calendar right — with the drag between them as the central gesture. Nothing is more than one keystroke deep from either panel.
**Interaction posture:** modal and keyboard-primary. The mouse is for the one gesture (drag task → calendar) that is genuinely spatial; everything else is keys.
**Information density:** deliberately high on desktop, and this is precisely why mobile fails. The design does not degrade; it was never designed to.
**Feedback:** progress bars on Time Slots, hover totals showing slot duration and completion, description-present icons on compact rows, haptics on mobile. Small, honest, non-gamified signals.
## 1.12 What we take and what we refuse
**Take:**
- The Inbox/Today wall
- One grammar shared between command bar and editor
- Modal single-key verbs on a selected item
- Global invocation that works outside the app
- The named-container time block with a fill level
- Rituals with auto-trigger and self-healing chaining
- Conditional-observation automations that end in a nudge
- Ambient tray surface: now / next / one action
- Assist-don't-override as a stated stance
**Refuse:**
- Mobile as an afterthought (either commit or state the constraint openly)
- Marketing two-way sync we do not have
- Shipping without export
- A queue that rewards organising over doing
- Silent auto-rollover of yesterday's unfinished work into today (this is how Akiflow quietly overloads people)
- Persona-forward assistant chrome. A good assistant is not charming at you.
---
# PART II — THE PERFECT EXECUTIVE ASSISTANT
## 2.1 The scenario, stated precisely
An assistant travels with the principal, holds the day, holds the files, holds the relationships, and **is silent by default**. It has three moments of speech:
1. When summoned — instantly, fully prepared, no ramp-up.
2. When a window is closing — "five minutes until we need to leave."
3. When something it did on the principal's behalf has completed — reported, not celebrated.
And one defining property: **when the principal overrides, the assistant absorbs the consequences without argument.** "Call them and push it" is met with "done" and a re-planned afternoon, not with a re-litigation of the priority.
## 2.2 Seven properties of the relationship
**1. Authority is derived, never held.** The assistant has no independent view of what matters. It has a *model* of what the principal has said matters, and that model is always contestable and always cheap to correct. The moment an assistant develops its own agenda it becomes a colleague you have to manage.
**2. The core skill is knowing when to speak.** Everyone can list a calendar. Almost nobody can judge which of forty true facts is worth saying out loud right now. Interruption is the scarce resource, not information.
**3. Preparation is invisible.** The files are ready before they are asked for. If the principal ever watches the assistant fetch something, the assistant is a step behind. Preparation done and unused costs nothing; preparation done late costs the meeting.
**4. Standing knowledge, never re-asked.** A good assistant does not ask twice whether you take calls before 9am, whether this counterparty gets a same-day reply, or which airline you refuse. Every question asked once is a question that must never be asked again.
**5. Consequence absorption.** Overriding must be *cheap for the principal and fully handled by the assistant*. The principal says one sentence; the assistant makes six phone calls. This asymmetry is the whole value.
**6. Never surprise the principal in front of others.** No assistant walks into a room and says something the principal didn't already know. All surprises are delivered privately and early.
**7. Reports outcomes, not activity.** "Moved; they were fine with Thursday." Not "I have initiated the rescheduling workflow."
## 2.3 The interrupt trigger is irreversibility, not importance
This is the load-bearing insight and it is where every notification system in productivity software gets it wrong.
The assistant does not interrupt a meeting because the next item is important. It interrupts because **a window is closing and the cost of missing it exceeds the cost of the interruption.** Travel time is the canonical case: there is a moment after which leaving on time becomes impossible, and that moment is knowable in advance.
Formally, an interrupt requires **all four** of:
| Test | Question |
|---|---|
| **Closing window** | Is there a moment after which the option disappears? |
| **Irreversibility** | Is the cost of missing it greater than the cost of the interruption? |
| **Actionability** | Is there a decision the principal can make *right now*? |
| **Novelty** | Has this not already been said recently? |
Three of four is not enough. An important-but-not-closing item goes in the queue. A closing-but-not-actionable item goes in the brief. A closing, actionable, irreversible item that was already flagged ten minutes ago is nagging, and nagging destroys the trust that makes the next real interrupt work.
## 2.4 Control is the product
The principal must never feel managed. Practically this means:
- Every proposal carries a **stated default** and a visible way to not take it.
- Defaults are **reversible for a stated window**. "I've held 4:15–4:30 with Theodore; undo any time before 3."
- Overriding is a **single sentence**, never a form.
- The assistant **never argues twice**. It may state a cost once, plainly, and then execute.
- The assistant **never silently learns a preference from one override**. It asks whether that was a one-off. Assistants that quietly generalise become assistants you cannot predict.
## 2.5 Bad-EA failure modes and their software equivalents
| Bad EA behaviour | Software equivalent |
|---|---|
| Talks constantly | Notification spam |
| Has opinions about your priorities | AI that reorders your day unasked |
| Asks the same question every week | No preference memory |
| Reports process instead of outcome | "Workflow initiated" toasts |
| Optimises the calendar into a wall | Motion-style gapless auto-scheduling |
| Needs managing | Configuration surface larger than the benefit |
| Loses the file | No export, no local copy |
| Surprises you publicly | Alerts that fire during screen share |
Each row is a design constraint, not a joke.
---
# PART III — THE SPEC
## 3.1 Layer model
```
┌──────────────────────────────────────────────────┐
│  PRIMARY AGENT (existing)                        │
│  Build with AI · Voice commands · AI Command Bar │
│  Desk Agents · Living Doc · Mindmap              │
│  → Summoned. Does work. Operates on canvases.    │
└──────────────────┬───────────────────────────────┘
                   │  reads / proposes into
┌──────────────────▼───────────────────────────────┐
│  THE ATTENDANT  (this spec)                      │
│  Watches · Routes · Prepares · Speaks rarely     │
│  → Not summoned. Runs continuously. Operates on  │
│    work_items, time, and readiness.              │
└──────────────────┬───────────────────────────────┘
                   │  reads by reference
┌──────────────────▼───────────────────────────────┐
│  ATTENTION  (DEC-012)                            │
│  work_item nodes across 8 categories (DEC-014)   │
│  → Reference, don't own. Work lives in desks.    │
└──────────────────────────────────────────────────┘
```
**Division of labour, stated as a rule:** the primary agent *does work*; the Attendant *manages the conditions under which work gets done*. If a request requires opening a canvas and producing content, it belongs to the primary agent. If it requires knowing what is next, what is closing, and what is ready, it belongs to the Attendant. The Attendant may summon the primary agent; the primary agent may not silence the Attendant.
## 3.2 Surfaces
**S1 — The Ribbon.** A persistent thin bar (menu bar extra + optional in-app strip). Shows exactly three things: **now**, **next**, and **the one action**. Never more. This is the tray-notification pattern and it is the highest-value low-cost thing in the whole spec.
```
● Drafting Q3 deck  ·  next: Caleb 1:1 in 22m  ·  [Prepare desk]
```
**S2 — Attention.** The triage surface. Two panels: category-grouped queue left, Day right. The drag between them is the one mouse gesture. Categories collapse; counts always visible; **an item's presence in Attention never moves it out of its desk.**
**S3 — The Command Bar.** Existing Command Center (`Cmd+K`) extended, plus a global binding that works outside PlexiDesk. One grammar shared with the item editor.
**S4 — The Day.** Calendar with time blocks, meetings, and *desk-linked* blocks. Held time is visually distinct from committed time.
**S5 — Rituals.** Open, Close, Survey. See §3.10.
**S6 — The Attendant itself.** No persistent chat window. No avatar. No persona chrome. It appears as a summonable pane (`⌥Space`) and as transient shoulder-taps. When idle it is a dot in the Ribbon, nothing more.
## 3.3 Keyboard grammar
Existing bindings preserved: `Cmd+N` new node, `Cmd+K` command centre, `Cmd+Shift+K` AI build, `Cmd+Opt+A` AI command bar.
**Single-key verbs, active when Attention has focus and an item is selected:**
| Key | Verb | Notes |
|---|---|---|
| `J` `K` / `↑` `↓` | navigate | |
| `Enter` | open | routes to the owning desk, does not extract the item |
| `E` | done | |
| `P` | plan | opens time placement |
| `S` | someday | |
| `R` | **route** | change category — PlexiDesk-specific, this is the DEC-014 verb |
| `W` | await | sets awaiting state (per the Await-is-a-state reversal) |
| `D` | **ask sender** | fires the intake clarification back to the point of intent |
| `A` | ask Attendant about this item | |
| `O` | open source | |
| `!` | priority · `#` room · `<` deadline · `Cmd+=` duration | shared grammar |
| `Cmd+Z` | undo | |
| `?` | shortcut sheet | |
`D` is the one verb Akiflow has no analogue for, and it is the highest-leverage key on the board. It is sender-side clarification made a single keystroke.
## 3.4 The Attendant's behavioural spec
**Perception loop.** On a tick (default 60s) and on event, the Attendant evaluates: calendar deltas, work_item_state transitions, deadline proximity, travel/leave-by times, engaged-time overrun against the current block, Attention queue depth, and desk readiness for upcoming blocks.
**Default state: silent.** Producing no output is a successful tick.
**Interrupt tiers:**
| Tier | Channel | Dismissal | Reserved for |
|---|---|---|---|
| **T0 Ambient** | Attention queue only | n/a | Everything by default |
| **T1 Glance** | Ribbon change, count badge | none needed | State the person would want on next look-up |
| **T2 Shoulder tap** | Transient toast, auto-dismiss, one action + snooze | passive | All four interrupt tests passed |
| **T3 Hold** | Modal, requires acknowledgement | active | Irreversible + imminent + no prior tap acknowledged |
**Budget.** T2 is capped (default 6/day, configurable), and the cap *decays* — each T2 in a rolling hour raises the bar for the next. T3 is uncapped but requires a failed T2 first, except for travel-critical leave-by events. Budget resets at the Open ritual.
**Escalation ladder** (the "five minutes" case):
```
T-25m  T1  Ribbon: "leave for Northside in 15m"
T-10m  T2  Tap: "10 min until you need to leave. [Leave on time] [I'll be late] [Not going]"
T-5m   T2  Tap, only if T-10 unacknowledged
T-0    T3  Hold: "You needed to leave now for Northside." + the override menu
```
Acknowledging at any rung suppresses the rest. Choosing "I'll be late" hands control to §3.8.
**Anti-nag rule.** The Attendant never says the same thing twice at the same tier. Repetition is only ever escalation.
**Public-surface rule.** While screen-sharing or presenting is detected, T2 downgrades to T1 and T3 downgrades to a private-device tap. No assistant surprises the principal in front of others.
## 3.5 The mandate model
The single most important configuration surface, and the answer to "the CEO always maintains control."
| Mandate | The Attendant may… | Reports |
|---|---|---|
| **M0 Watch** | observe only | never |
| **M1 Brief** | answer when asked | on request |
| **M2 Flag** | interrupt up to its tier ceiling | at interrupt |
| **M3 Prepare** | perform reversible prep — assemble desks, gather files, pre-fetch, draft internally | in the brief |
| **M4 Propose** | compose outbound artefacts (replies, invites, reschedule requests) but not send | at proposal |
| **M5 Act & Report** | execute in-scope actions, always visibly | immediately |
| **M6 Act Silently** | execute and log only | in the digest |
Mandates are granted on a **grid**, not globally: `category × counterparty class × room`. So: *To Respond, internal, Product room → M4. To Respond, external → M2. To Meet, internal reschedules → M5. To Know, all → M6.*
**Rules:**
- Default for every new cell is **M2**.
- M5 and M6 require explicit grant and are **revocable in one keystroke from any report**.
- No mandate is ever inferred from behaviour. Escalation is always an explicit act.
- Every M5/M6 action is reversible for a stated window, and the window is stated in the report.
## 3.6 Category routing table
The Attendant's per-category behaviour, keyed to DEC-014. This is the table that turns eight nouns into an operating agent.
| Category | Attendant watches for | Prepares | Interrupt ceiling | Default mandate |
|---|---|---|---|---|
| **To Do** | Blocks approaching, estimate overrun, deadline proximity | Stages the owning desk; restores widget state | T2 | M3 |
| **To Review** | Review items aging past their window; upstream blocked on you | Opens the artefact; assembles prior-version diff | T1 | M3 |
| **To Decide** | Decisions with a closing window; decisions blocking others | Assembles the options, the constraint, and what changes after | **T3** | M3 |
| **To Respond** | Response-time expectation by counterparty class; thread going cold | Drafts a reply; surfaces the last exchange | T2 | M4 |
| **To Meet** | Leave-by, prep-by, overrun, conflicts, no-agenda meetings | Stages the meeting desk; pulls last meeting's notes and open actions | **T3** | M3 (internal reschedule: M5) |
| **To Discuss** | Counterparty availability; topics accumulating without a slot | Batches topics per person into a single agenda | T1 | M3 |
| **To Remember** | Date-anchored surfacing; dormancy | Surfaces at the anchor, not before | T1 | M2 |
| **To Know** | — machine-authored only — | Composes the brief itself | T1 | M6 |
**To Decide and To Meet are the only categories permitted T3.** Both are inherently window-bounded. Everything else can wait for a look-up.
**To Know is the Attendant's own output channel.** Briefings, digests, "the thing you asked about resolved itself," travel and weather context, meeting-outcome summaries — all land as machine-authored To Know items, exempt from intake clarification per DEC-014. This is a clean fit and worth noting: the category already had the exact property the Attendant needs.
## 3.7 The Day Plan engine
**Stated stance: PlexiDesk proposes a plan. PlexiDesk never applies one.** This is the Akiflow position, deliberately, and against Motion. Say it in the marketing.
**Input:** committed calendar, work_items due or Goal-marked, estimates, velocity history (PlexiDesk already tracks estimate accuracy — this is a real edge over both Akiflow and Motion), declared energy shape, protected time.
**Output:** a *proposed* Day, rendered as ghost blocks alongside the real calendar. One keystroke accepts all. Arrow-through accepts individually. Escape discards. Nothing is written to any calendar until accepted.
**Desk Blocks — the Time Slot equivalent.** A Desk Block is a named, room-coloured container placed on the Day that points at a desk and holds an ordered set of work_items. It shows a fill level as items complete. It may recur. It does not own the items.
The mapping is nearly free: Akiflow's Time Slot is a container that holds tasks; a PlexiDesk desk is *already* a container that holds work and its tools. **Placing a desk on the calendar is the whole feature.** This is the point where PlexiDesk's architecture is strictly better than Akiflow's — Akiflow's Time Slot holds task titles; a Desk Block arrives with the browser tabs, the spreadsheet, the notes and the timer already arranged.
**Explicit refusals:**
- No silent rollover. Un-replanned items from yesterday do **not** appear in today automatically; they appear in the Close ritual as an explicit choice. Akiflow's auto-rollover is the mechanism by which its users quietly become overloaded.
- No gap-filling. Empty time is a valid output.
- No plan longer than the person's demonstrated velocity supports. If the proposed plan exceeds historical throughput, the Attendant says so before proposing, once.
## 3.8 The override cascade
The scenario the whole spec exists to serve.
```
[meeting overruns]
T2  "10 minutes until you need to leave for the Northside review."
    [Leave on time] [Running late] [Not going]
→ "Running late"
    "How late?"  [10m] [20m] [Ask them to push] [I'll handle it]
→ "Ask them to push"
    "I'll ask Dana to move Northside to 3:30 — that's your next
     clear window and it holds the Q3 block. Sending in 10s. [Edit] [Cancel]"
→ [sent]
    "Dana confirmed 3:30. I moved the Q3 block to 4:15 and pushed
     the vendor call to tomorrow 10am — they had no constraint.
     Two things now conflict with your 5pm hard stop.
     [Show me] [You handle it]"
```
**The properties that matter, and must be tested:**
- The principal spoke three times, in fragments. Never filled a form.
- Every step had a **default with a countdown**, not an open question.
- The Attendant re-planned the *downstream* chain unasked. That is consequence absorption (§2.2.5).
- The one thing it could not resolve — the 5pm hard stop — was surfaced explicitly rather than quietly optimised around.
- The outbound message required M4+ for that counterparty. Under M2 the same flow ends at "here's a draft."
- It reported the outcome, not the process.
## 3.9 Desk staging
Under M3, ahead of a Desk Block or meeting, the Attendant *stages*: opens the desk in the background, restores widget state, refreshes the Living Doc, pulls the previous meeting's notes and any open actions with that counterparty, and pre-loads the linked file/browser widgets.
By the time the Ribbon says "next: Caleb 1:1 in 22m · [Open desk]", the desk is already warm. **Staging is silent, reversible, and never mentioned unless used.** Preparation done and unused costs nothing.
This is the single feature that no calendar-first competitor can copy, because none of them own a workspace to stage.
## 3.10 Rituals
**Open** (morning, auto-triggerable):
1. Yesterday, honestly — completed, and what didn't, with the explicit choice on each (no silent rollover)
2. Attention triage to zero, keyboard-only
3. Set 1–3 Goals
4. Accept, edit, or discard the proposed Day
5. Attendant states its posture for the day: "I'll flag Decide and Meet. Everything else waits."
**Close** (end of day):
1. What completed
2. Where engaged time actually went vs. plan (PlexiDesk already measures this honestly — use it)
3. Replan or release what didn't
4. Note field, surfacing tomorrow
5. Attendant's overnight mandate confirmed
**Survey** (weekly): last week's goals, velocity delta, what got pushed more than twice (the Attendant names these — repeatedly-deferred items are the highest-signal thing in the system), next week's Goals, shape the recurring Desk Blocks.
**Chaining:** a skipped Close becomes step one of the next Open. Skipping never loses data; it only defers the decision.
## 3.11 Voice and ambient capture
Akiflow's reach — WhatsApp, Siri, email-to-assistant — is a real advantage worth noting, and PlexiDesk's local-first architecture makes most of it hard. Honest position:
- **Ship:** global command bar, voice via existing Whisper path, `⌥Space` summon.
- **Cheap and high-value:** an inbound address that parses forwarded mail into work_items. Requires a hosted component; conflicts with pure local-first. Flag as a ruling.
- **Defer:** WhatsApp/Siri parity. State the constraint openly rather than half-shipping it.
---
# PART IV — DATA MODEL & PROTOCOL DELTAS
## 4.1 Entities
| Entity | Status | Notes |
|---|---|---|
| `work_item` | exists (DEC-011) | node with `kind: 'work_item'` |
| `work_item_state` | exists (A-02) | canonical; `nodes.status` remains derived |
| `TimeBlock` | exists | extend, do not replace |
| **`desk_block`** | **new** | TimeBlock variant carrying `node_id` (the desk) + ordered `work_item` references. Reference-only; deleting the block never touches the items |
| **`mandate_grant`** | **new** | `(category, counterparty_class, room_id) → mandate_level`, versioned, with grant/revoke audit |
| **`attendant_event`** | **new** | every observation, interrupt, proposal, action and outcome. Append-only. This is the audit trail that makes M5/M6 trustworthy |
| **`preference`** | **new** | standing knowledge (§2.2.4). Written only by explicit statement, never inferred |
## 4.2 New FlowActionTypes — coin carefully
**A-01 precedent applies: any name published as a `FlowActionType` is permanently frozen, because user-authored saved Flows will reference it.** Renaming silently breaks them. Every name below is a permanent commitment and should be ruled on before a single one ships.
Proposed:
| Wire name | Purpose |
|---|---|
| `propose-plan` | emit a proposed Day; never writes |
| `hold-time` | place a reversible hold |
| `stage-desk` | prepare a desk in the background |
| `brief` | author a To Know item |
| `flag` | raise to a stated interrupt tier |
| `request-reschedule` | compose (M4) or send (M5) an outbound move |
| `ask-sender` | fire intake clarification back to the point of intent |
`create-task` remains frozen and unchanged (DEC-013 / A-01).
## 4.3 Sync, ACL, and the trashNode interaction
`desk_block` and `mandate_grant` inherit the node whitelist and ACL scoping if implemented as nodes; if implemented as tables they must be added to the sync whitelist explicitly. This decision should be made once, for all three new entities, rather than per-entity.
**Live defect, now more urgent:** the `trashNode` recursive child sweep has no kind filter. With the Attendant staging and authoring work_items, the blast radius of a sender trashing their desk grows. This should be fixed before the Attendant writes anything.
## 4.4 Metrics — and a note for Caleb
Two metrics, and they interact badly if not separated:
- **`attentionPrecision()`** — of items surfaced, what fraction were acted on. Existing; To Know handling still open pending Caleb's ruling.
- **`interruptPrecision()`** — new. Of T2/T3 interrupts, what fraction were acted on rather than dismissed. This should drive the adaptive budget in §3.4.
**The interaction Caleb should see:** if the Attendant authors To Know items (§3.6) *and* To Know counts in `attentionPrecision()`, the Attendant can move its own score by changing how much it briefs. A silent agent scores well by producing nothing; a chatty one dilutes. This argues for excluding machine-authored To Know from `attentionPrecision()` entirely and measuring briefing quality separately — but that is Caleb's call, and it now has a downstream consequence it didn't have when the question was first logged.
---
# PART V — COSTS, TRADEOFFS AND REFUSALS
**Real costs of this spec, stated plainly:**
1. **Always-on process.** The Attendant needs a background tick, OS notification permission, and idle/focus detection. This is battery, complexity, and a permissions prompt at onboarding.
2. **Calendar write access.** Holds, moves and locks require two-way calendar sync. This is the single largest architectural concession against local-first, and it is the exact place Akiflow gets its worst technical reviews. Options: (a) read-only import, holds live only in PlexiDesk — cheap, honest, less useful; (b) full two-way — expensive, and we inherit the class of bug Akiflow users complain about. **Needs a ruling.**
3. **Outbound messaging.** M4/M5 for `request-reschedule` means composing and sending on the user's behalf. Requires a mail/message path and a very well-designed undo window.
4. **The mandate grid is a configuration surface**, and §2.5 lists "needs managing" as a bad-EA failure mode. The mitigation is that defaults must be good enough that most people never open it. If the grid needs tending, the design has failed.
5. **Interrupts sit in tension with PlexiDesk's stated refusal of manipulative engagement patterns.** The guardrail must be explicit and in the product: the budget exists, it is visible, it is lowerable to zero, and `interruptPrecision()` is shown to the user, not just to us.
6. **Mobile.** Akiflow's worst-reviewed surface, and the Ribbon is inherently a mobile-relevant thing. PlexiDesk is an Electron desktop app. Either commit to a companion or state the constraint plainly. **Half-shipping mobile is the documented way to lose the reviews.**
7. **Export.** Non-negotiable, and cheap given SQLite-on-disk. Ship it in the same release as the Attendant. Akiflow's missing export is the complaint that most damages trust in a "single source of truth" product.
---
# PART VI — DECISIONS REQUESTED
**Decision records to open:**
- **DEC-015** — Name the layer. Proposal: *Attendant*. Alternatives: Chief of Staff (rejected — implies held authority), Aide, Second.
- **DEC-016** — The mandate model M0–M6 and the `category × counterparty × room` grid.
- **DEC-017** — Interrupt tiers T0–T3, the four-test gate, the decaying budget, and which categories may reach T3.
- **DEC-018** — Proposed-never-applied Day Plan. Explicit anti-Motion stance.
- **DEC-019** — `desk_block` as reference-only container, and its relationship to the existing `TimeBlock`.
- **A-03** — Freeze the seven new `FlowActionType` wire names, or defer any that are not certain.
**Crossroads rulings to add to the CR-01–CR-07 batch:**
- **CR-08** — Calendar sync depth: read-only import vs. full two-way write.
- **CR-09** — Hosted inbound address (email-to-Attendant) vs. strict local-first.
- **CR-10** — Mobile posture: companion Ribbon app, or stated desktop-only constraint.
**Ambiguities to add to the Q1–Q8 log:**
- **Q9** — Does a `desk_block` recur as a container only, or does it carry its work_item references forward? Akiflow carries tasks over; that is also how their queues silently bloat.
- **Q10** — When the Attendant stages a desk under M3 and the meeting is cancelled, does the staged state persist or revert?
- **Q11** — Counterparty classes: enumerated (internal/external/VIP) or derived from interaction history? Derivation is inference, and §2.4 forbids inferred preference.
**For Caleb:** the `attentionPrecision()` / To Know question now has the §4.4 self-scoring consequence attached. Worth including in the ruling brief.
---
# PART VII — PHASING
**P1 — Surface, no agent.** Attention with the two-panel layout, the single-key grammar, the Inbox/Today wall, and the Ribbon showing now/next/one-action. Zero AI. This alone is most of what Akiflow users pay for. Ships the `R` and `D` verbs, which Akiflow does not have.
**P2 — Rituals + Day.** Open/Close/Survey, Desk Blocks, the proposed Day with accept/edit/discard. Still no interrupts. Export ships here.
**P3 — The Attendant, mute.** Full perception loop, T0 and T1 only. It watches and stages under M3. It never speaks unbidden. This is the phase where `interruptPrecision()` gets calibrated against *would-have-interrupted* logs before anything actually fires.
**P4 — Voice.** T2/T3 enabled with the budget. Mandate grid ships. Escalation ladder and override cascade.
**P5 — Reach.** M4/M5 outbound, counterparty coordination, the full §3.8 flow.
P3 is the phase most likely to be skipped and the one most worth protecting. Shipping an agent that speaks before its precision has been measured against a shadow log is how good assistants become notification spam.
---
*End SPEC-002.*