# Analysis 26 — SPEC-002 "The Attendant" vs the built system

**2026-08-30 · REVIEW BACKLOG — NOTHING AUTHORIZED, NOTHING BUILT.** Operator's
framing, verbatim in substance: *keep it as potential items to review further
and adopt gradually; don't actually build any of this yet.* Every row below is
a candidate for a future individual ruling, not a work item. Adoption, if any,
is per-item, by DEC, gradually.

**Provenance.** The spec is preserved verbatim in
[25-SPEC-002-ATTENDANT-RAW.md](25-SPEC-002-ATTENDANT-RAW.md). A first
comparison was produced in-session 2026-08-29 but lived only in the transcript;
this document REBUILDS that analysis against the code at `9216f335`
(3,196 tests green) rather than transcribing it. Where the rebuild disagrees
with the transcript version, this document is right and says so (§2.1, §4).

---

## 1. Headline

**Plexi has already built the Attendant's judgement. It has almost none of the
Attendant's hands.**

The overlap concentrates at the doctrine and data layer — restraint,
propose-never-apply, approval-before-action, quiet analytics — much of it
arrived at independently and some of it *ruled* before this spec existed
(DEC-052 predates it by two days and answers several of its Part VI requests).
The gaps concentrate at the input and ambient-surface layer: keyboard grammar,
tray/ribbon, rituals, export, and the agent loop itself. That is the good
direction for the asymmetry to run: doctrine is the expensive half to get
right, and it is the half that is done.

---

## 2. Corrections to the spec — required before any ruling

Three of the spec's factual claims about the existing system do not survive
contact with the code, and a fourth problem is bookkeeping. The first is used
as the stated differentiator vs Motion, so these are not nits.

### 2.1 §3.7 — "PlexiDesk already tracks estimate accuracy … a real edge over both Akiflow and Motion"

**Overstated, with a nuance the transcript version missed.** An
estimate-accuracy calculator DOES exist —
`computeVelocity()` in `src/renderer/src/lib/velocityStats.ts` (present since
the initial commit `cd08e0a2`) computes sample count, avg/median actuals, and
an actual-vs-estimate ratio. But it is not the thing the spec claims:

- It measures **legacy `kind === 'task'` nodes** — today's *desks* — never
  `work_item`s (velocityStats.ts:23-29).
- Its "actual" is **wall-clock elapsed** `completedAt − startedAt`
  (velocityStats.ts:40), which conflates a week of calendar time with an hour
  of work. The honest engaged-time record — `focus_sessions.planned_seconds` /
  `actual_seconds` (database.ts:97-106) — is not what it reads.
- Its only consumers are the **NewNodeDialog estimate hint**
  ("Your history: N% of estimates…", NewNodeDialog.tsx:640-646) and
  `focusInsights.ts`. **The Day Plan engine does not read it**:
  `attentionPlanner.ts` imports only `rankScore`/`isTerminalState` — no
  velocity, no energy. Its plan ceiling is a fixed 330 min (DEC-052 Track B),
  not a velocity-derived one, and §3.7's "no plan longer than demonstrated
  velocity supports" check does not exist.

So: the raw material is collected (estimates, extensions, focus sessions with
planned and actual seconds), a desk-level elapsed-time ratio is computed and
shown at creation — and **nothing computes work-item velocity, and nothing
feeds any of it to the planner.** As "a real edge over Motion, today," the
claim is false; as "an edge Plexi could build from data it already collects,"
it is right, and that version is what belongs in the spec. (Adoption candidate:
§6 item 6.)

### 2.2 §3.10 — "PlexiDesk already measures this honestly [engaged time vs plan] — use it"

**Half-right.** Engaged time IS aggregated and surfaced — `focusInsights.ts`
computes focused minutes, medians, completion rate, focus-by-hour, top tasks,
and `InsightsView` (routed in MainPane) renders it. What does not exist is the
**vs-plan** half: `plannedSeconds` is written at session start and used for the
countdown UI (`stores/focusSession.ts`), and no computation anywhere compares
it to `actualSeconds` — not per session, not aggregated, not in the Close-ritual
shape the spec wants. Recording ≠ comparison. The Close ritual's step 2 would
be new work, not a reuse.

### 2.3 §4.3 — "Live defect … the trashNode recursive child sweep has no kind filter"

**Stale — this was fixed before the spec was written.** The spec asks for it
to be "fixed before the Attendant writes anything"; it was fixed in S1 and
hardened through DEC-021/022. `src/main/db/nodeLifecycle.ts` is the single
owner of trash/restore/purge/detach; because the FK cascade cannot be
kind-filtered, **every hard-delete path detaches-and-revives work_item
descendants before deleting** (`detachAndReviveWorkItemDescendants`,
nodeLifecycle.ts:114-135), direct work_item deletes are refused (C2,
nodeLifecycle.ts:60-62), the leaf invariant is enforced at create AND sync
apply, and a CI delete-site lock pins the closed enumeration of delete sites.
R008 is ratified: no work_item hard-delete ever; purge revives items to
Attention with a counted notice. The Attendant's §4.3 precondition is already
met — the spec should cite it as satisfied, not open.

### 2.4 Part VI — every self-assigned number is already taken

The spec proposes opening **DEC-015…019**, **CR-08…10**, and **Q9…11**. The
live log consumed DEC-015…019 (autopilot, mission queues, per-stage prompts,
actor seam, capture model) and CR-08/CR-09 (tabs consolidation, contextual
attention) months of decisions ago. Q9–Q11 happen to be free. Any adopted item
gets a **fresh DEC number at ruling time**; the spec's internal cross-refs
(e.g. §3.5 → "DEC-016") must not be pasted into the log as-is.

Two of its requested decisions are also **already substantively ruled**:

- Spec-"DEC-018" (proposed-never-applied Day Plan, anti-Motion) — **ruled** as
  DEC-052(5): both AI modes preview-first, user rearranges/accepts, Accept =
  one undo batch; re-affirmed by DEC-071 (review pane books nothing).
- Spec-"CR-08" (calendar sync depth) — **part-ruled** as DEC-052(3): external
  sync is design + foundation ONLY (schema + connector contract landed:
  `origin`/`locked`/`pushPolicy`/`external_*`), build deferred. A two-way-write
  ruling remains open but starts from that stance, not from zero (§7.4).

---

## 3. Side by side — what already exists

Evidence is file:line at `9216f335`; verify commands in §9.

| SPEC-002 asks for | Status | Evidence |
|---|---|---|
| 8 categories, exact names (§3.6) | **Shipped** | `INTENT_CLASSES` = to_do/to_review/to_decide/to_respond/to_meet/to_discuss/to_remember/to_know — `src/shared/workItems.ts:140-149`; legacy map at every boundary; DEC-029a taxonomy tests are LAW for any change |
| Reference-don't-own (§3.1) | **Shipped** | work_items are `nodes` kind rows living on desks; leaf invariant + C2 refusals (`nodeLifecycle.ts`); "presence in Attention never moves it out of its desk" holds by construction |
| S2 two-panel triage: queue left, Day right, drag between (§3.2) | **Shipped** | DEC-052 Track A: CalendarView rebuilt on work items, queue rail drags onto the grid (`text/fb-workitem`), Attention rail = same grid narrow; DEC-049 layout |
| S4 The Day: blocks, meetings, held-vs-committed (§3.2) | **Substantially** | `TimeBlock` carries `status: planned\|done\|missed\|skipped`, `origin: manual\|auto` (replan may only move `auto`), `locked`, `pushPolicy`, recurrence, meeting shape — `src/shared/types.ts:302,326-351`. Ghost proposals are visually distinct and not real blocks |
| Propose-never-apply Day Plan (§3.7) | **Shipped + ruled** | DEC-052(5); planner emits ghosts (`CalendarView.tsx:350`), `acceptPlan()` explicit incl. per-block subset (`:313`), ONE undo batch; DEC-071 centre-peek review shows items/when/**why** before anything books |
| No silent rollover (§3.7 refusal) | **Conforms** | `sweepMissed()` (attentionPlanner.ts) marks passed planned blocks `missed` — the record stays, nothing moves; items re-PROPOSED via planDay, 1-hour grace. Yesterday never auto-lands in today |
| No gap-filling / empty time valid (§3.7 refusal) | **Conforms** | Planner runs only when invoked (Plan-my-day / intent mode), honesty filter (waiting/blocked never scheduled), session cap, 330-min ceiling |
| Interrupt budget (§3.4) | **Shipped (simpler)** | `QUEUE_HOURLY_CAP = 5` per queue per rolling hour; overflow collapses to ONE summary banner; security/critical bypass individually — `substrate.ts:38,205-231`. No decay-per-use; cap is flat, not adaptive |
| Interrupt tiers T0–T3 (§3.4) | **Partial** | `EscalationLayer = 'ambient' \| 'inbox' \| 'interruptive'` exists and is carried on posts (`substrate.ts:33`) ≈ T0/T1/T2. No T3 modal-hold tier, no four-test gate predicate |
| Anti-nag / novelty (§3.4) | **Shipped** | `dedupeKey` UNIQUE across all time — "restart-survival + once-ever guarantee" (`substrate.ts:47`); deadline nudge = once per item per due-day |
| Perception loop tick (§3.4) | **Partial** | 30s scheduler sweep exists (`scheduler.ts:15,39-70`): block reminders, decay, deadline nudges, due deliveries. It watches deadlines and blocks — not engaged-time overrun, not desk readiness, not leave-by |
| "Default state: silent" restraint (§3.4) | **Shipped as doctrine** | S7: deadline proximity is "the ONE proactive item trigger" (`scheduler.ts:60-62`); decay is quiet (reason `decayed`, never notifies); DEC-052(8) flow-state-is-sacred ruling |
| Human-in-loop completion (§2.2, §3.4) | **Shipped + ruled** | DEC-052(6): "NEVER auto-complete without approval"; Track D typed ledger (`wi_signal`, once-ever pairing as a DB guarantee), Enter-to-complete toast |
| Outcomes not activity (§2.2.7) | **Shipped** | Quiet-wins analytics: `desk_closed` etc. counted "from the work, not the checkboxes" — feeds analytics, never a prompt |
| `attentionPrecision()` (§4.4) | **Shipped, not user-visible** | `metrics.ts:34-38` + release regression gate MET-013 (`:66`, >2% drop blocks); wired via `workItems:precision` IPC (`ipc/index.ts:813-815`). No renderer UI consumes it yet — Part V item 5 ("shown to the user") is unmet |
| §4.4 self-scoring concern (machine To Know inflating precision) | **Live but dormant** | `attentionPrecision()` does not filter by `wi_origin`; `wi_origin: 'ai'` items already exist (`actionExecutor.ts:888`). No Attendant brief channel yet, so no distortion today — but the exclusion question is real and remains Caleb's call |
| Await-is-a-state (`W` verb's target) (§3.3) | **State exists, verb doesn't** | `waiting`, `delegated`, `blocked`, `suggested`, `stale` all active states (`workItems.ts:98-108`); `decided`/`archived` terminal. No keystroke sets them |
| Dormancy / date-anchored surfacing (§3.6 To Remember) | **Partial** | `decayLooseThoughts` (14-day dismiss, reason `decayed`) rides the sweep; due-date anchoring via the nudge. No "surface at the anchor, not before" hold-back |
| Desk Block ≈ Time Slot (§3.7) | **Close** | `TimeBlock.taskId` points at a node (`types.ts:328`); DEC-068's `meetSchedule.ts` links Meet items to real blocks (refuses without a start; matches on the LINK). Missing: a block that points at a *desk* with an ordered work_item set + fill level + recurrence-as-container. Recurrence itself is built (`seriesId`, materialised forward) |
| Meet with when/where/who/join/RSVP (§3.6) | **Shipped** | DEC-063/064/068: six manifest columns, invite-shaped rows, provider-labelled Join, RSVP inline; `meet_start_at` deliberately NOT `due_at` |
| `suggested` / approval gate (§3.4 M4-shape) | **Shipped** | `approval_state` + `suggested` state in the manifest; ProposalTray discipline (CR-09 Part II); DEC-038 "Start it with Plexii" = prefilled chat **staged, never sent** — the compose-don't-send precedent already ruled once |
| Per-queue muting (§3.4 budget adjacency) | **Shipped** | Feeder mutes (Δ10 both halves) + `suppressedQueues` in the substrate sweep |
| T1 glance channel (§3.4) | **Partial, in-app only** | Top-bar headline count (SPEC-015, zero-silent) + `attentionBadgeCounts`. Nothing outside the window |
| Voice capture (§3.11 "ship" row) | **Shipped** | `localWhisper.ts` + `voiceProviderPref.ts`; voice → capture prompt activation (S5) |
| Per-meeting calendar interop (§ Part V export adjacency) | **Partial** | `shared/ics.ts`: standards-compliant per-event .ics + add-to-Google URL (WeekTimeGrid, IPC). This is one meeting out — not data export (§5) |
| Declared energy shape as plan input (§3.7) | **Collected, unconsumed** | `stores/energy.ts` logs `EnergyLevel` history; the planner never reads it |

### 3.1 Where Plexi is ahead of Akiflow (the spec undersells its own side)

Akiflow's two most-complained-about model gaps (§1.10 items 7–8) are both
already closed here, and a third refusal is already conformed to:

- **Sub-items.** DEC-035 grouping: one level, sibling-ref `group_id`, leader
  never carries a `group_id`, enforced at the DB; children promoted (never
  hidden) when the leader leaves the queue; rendered as ONE animated group
  (DEC-070). Deliberately one level, not a tree — but Akiflow has zero.
- **Timed deadlines.** `due_at` is a full ISO-8601 instant (manifest,
  `workItems.ts`), not date-only.
- **Assist-don't-override** is not a stance to adopt — it is DEC-052(5)/(6)/(8),
  already ruled, in the operator's own words, before this spec existed.

---

## 4. The gaps — verified absent at `9216f335`

Every row grep-verified (commands in §9); false positives ruled out
(`themeRitual` is a theme animation; "mandate" appears only as an English word
in AI-prompt comments).

**Surface / input:**

| Gap | Evidence of absence |
|---|---|
| Single-key verb grammar (§3.3) | AttentionView keyboard handling is form-local only (Enter-to-file, Escape, Enter/Space on focused controls — `AttentionView.tsx:1321,1346,1817`). No selection model with J/K/E/P/S/R/W/D |
| System-global invocation (§1.4, §3.2 S3) | `globalShortcut` never registered anywhere in `src/` |
| Ribbon / tray (§3.2 S1) | No `Tray` construction anywhere. Nothing exists outside the window |
| Rituals Open/Close/Survey (§3.10) | Absent. No planning/shutdown flow, no chaining |
| Inbox↔Today wall (§1.3) | No Attention triage inbox; capture files direct to the queue (DEC-034's preview is a per-item confirm, not a holding pen). The only "inbox" in the codebase is the messaging/mail unified inbox (`stores/messaging.ts` — GAP-017 territory) |
| **Export (Part V item 7)** | No data export of any kind — no CSV/JSON dump, no bulk .ics, no backup-to-file UI. `shared/ics.ts` exports ONE meeting |

**Agent:**

| Gap | Evidence of absence |
|---|---|
| Mandate model M0–M6 + grid (§3.5) | No mandate/grant concept |
| Four-test interrupt gate (§2.3) | No closing-window/irreversibility/actionability predicate; no leave-by or travel awareness |
| T3 hold + escalation ladder (§3.4) | No modal tier, no laddering |
| Adaptive/decaying budget (§3.4) | Cap is flat 5/queue/hour |
| `interruptPrecision()` (§4.4) | Zero hits |
| Desk staging (§3.9) | Nothing pre-opens/pre-warms a desk ahead of a block |
| `attendant_event` audit / `preference` store (§4.1) | Neither exists |
| Counterparty classes (§3.5) | Zero hits |
| Public-surface rule (§3.4) | No screen-share/presentation detection |
| Outbound compose-and-send (§3.8) | No send path on the user's behalf (and see §7.3) |

---

## 5. Adoption candidates — ranked for review, NOT scheduled

Each row = a potential future ruling. Order is value-to-risk, cheapest
trust-win first. **None of these are authorized.**

1. **Export.** Non-negotiable in the spec and it is right — the missing-export
   complaint is Akiflow's most trust-damaging (§1.10 item 5), and Plexi is
   SQLite-on-disk so the cost is small. Attention items + desks + blocks to
   JSON/CSV (and bulk .ics for blocks — `shared/ics.ts` already knows the
   format per-event). Also the honest answer to the P1-F1 class of fear: your
   data is extractable. *Prerequisite: none.*
2. **Single-key verb grammar on the queue.** Akiflow's #2 most-loved feature;
   pure renderer work on surfaces that exist (selection model + keymap +
   `?` sheet). `R` (route) and `D` (ask sender) have no Akiflow analogue and
   are genuinely ours — though `D` in full depends on SPEC-027 delegation
   rails; `R` is buildable today (reclassify exists on rows). *Watch: ⌘K's
   omni-intent Tab cycler owns capture-phase keys in chat (DEC-030's lesson) —
   the queue needs its own focus discipline so verbs never fire in an input.*
3. **The four-test interrupt gate as a posted-notification predicate.** The
   best idea in the spec, and cheap HERE because the substrate already has
   queues, layers, caps, dedupe, and per-queue mutes — it is a gate function
   in front of `post()`, not new machinery. Adopting the *vocabulary*
   (closing-window / irreversible / actionable / novel) also gives future
   feeders a shared standard for what may escalate past `ambient`.
4. **Desk staging (§3.9), M3-shaped only.** The one feature no calendar-first
   competitor can copy — they have no workspace to stage. Plexi's version is
   honest: ahead of a block whose item points at a desk, pre-warm that desk
   (webview/widget state already persists — the P1 re-toucher finding), so
   "Open desk" lands warm. Requires no mandate grid — just a single
   "may prepare quietly" toggle. *Open question Q10 (staged state on
   cancellation) must be answered at ruling time; Q10 is a free number (§2.4).*
5. **P3's mute-agent shadow log before ANY proactive expansion.** The
   discipline that keeps the Attendant from becoming notification spam:
   log would-have-interrupted events, calibrate `interruptPrecision()` against
   them, only then let anything speak. Cheap (a table + a metric twin of
   `attentionPrecision()`), and it is the spec's own best guardrail for its
   own riskiest half. Pairs with finally surfacing precision to the user
   (Part V item 5 — currently computed but invisible, §3).
6. **Work-item velocity / estimate accuracy — the honest version.** Not
   because §3.7 claims it exists (§2.1: it doesn't, in the form claimed), but
   because the inputs are already collected: `estimate_minutes`,
   `focus_sessions.planned_seconds`/`actual_seconds`, and the Track D signal
   ledger. Compute engaged-time-based accuracy for work items; feed the
   planner's ceiling; make `computeVelocity`'s elapsed-time desk ratio either
   honest or retired. This also unlocks §2.2 (planned-vs-actual for any future
   Close ritual) and would make §3.7's differentiator claim TRUE before it is
   ever said in marketing.
7. **Ribbon-lite: a tray extra.** Now / next / one action, from data that all
   exists (current block, next block, headline count). Real cost is an
   always-on surface + macOS permission posture — smaller than the spec's full
   S1 but not free. Below the fold because items 1–6 beat it on value-per-risk.
8. **Rituals (Open first).** High leverage, but it is a product-shape
   commitment (Akiflow's most-skipped feature) and its best version wants
   items 5 and 6 first (honest yesterday + honest velocity). Survey's
   "pushed more than twice" detector is the highest-signal cheap piece if
   rituals are ever taken.

## 6. Recommend refuse — with the standing rulings that already decide them

1. **M5/M6 (act, and act silently).** Directly contradicts DEC-052(6):
   *"NEVER auto-complete without approval; the human stays in the loop about
   everything happening on their behalf"* — and M6 (execute, log only, report
   in the digest) is that ruling inverted. The spec never reconciles the two.
   CR-09 Part II's two-layer LAW (AI only pre-fills/proposes/enriches) is the
   same line drawn a third time. Hold it.
2. **The mandate grid as specified.** `category × counterparty × room × 7
   levels` is a combinatorial configuration surface, and the same spec lists
   "needs managing — configuration surface larger than the benefit" as a
   bad-EA failure mode (§2.5). It specs the thing it diagnoses. If any mandate
   concept ever ships it should be one global dial with per-category
   exceptions earned singly — and item §5.4 shows M3-shaped staging needs no
   grid at all.
3. **Send-on-behalf (§3.8's "Sending in 10s").** Highest trust-risk item in
   the document; a wrong send is not undoable the way a wrong block is.
   M4 (compose, never send) is the honest ceiling, and it is ALREADY the
   shipped pattern: DEC-038's staged-never-sent chat. Also premature by
   sequencing: GAP-017 rules that the messaging surface gets a designated
   investigation before Respond changes anything.
4. **Two-way calendar write.** The spec itself concedes this is where Akiflow
   earns its worst technical reviews (Part V item 2), then proposes option (b)
   anyway. DEC-052(3) already set the stance: foundation only. The schema
   carries `pushPolicy: 'local' | 'push'` and the honour-and-pin `locked`
   convention — read-only import with local holds is the version that fits
   local-first, and it is the standing recommendation if/when Track C builds.
5. **Counterparty classes derived from interaction history.** The spec flags
   its own contradiction (Q11 vs §2.4's "never silently learns a preference").
   Derivation is inference. Enumerate or don't do it — and don't do it before
   SPEC-027 gives person-addressing any substrate at all.
6. **Persona chrome.** Already refused in the spec (§1.12) and worth
   ratifying: no avatar, no charm. Plexi's existing pattern (cards, trays,
   quiet counts) is the right register.

## 7. The one structural question worth its own ruling

**The Inbox↔Today wall (§1.3: "the single most important structural decision")
does not exist in Plexi — and it is genuinely open whether Plexi needs it.**
Akiflow needs the wall because five integrations flood one queue. Plexi's
pressure is lower and differently shaped, and four existing mechanisms already
do parts of the wall's job: the `suggested` approval gate (AI proposals wait),
capture's confirm/preview stop (DEC-019/034), loose-thought decay (Δ3), and
the queue's grouping/muting. What none of them do is protect **a committed
Today** from *human* capture landing straight in the working set. Options at
ruling time: (a) a real triage lane; (b) declare the Day the "Today" and the
queue the "Inbox" — the wall then already exists as the propose/accept gate;
(c) status quo, revisit when feeders widen (email tier 3a would be the flood
moment). Recommendation: **(b) as the stated frame now, (a) re-examined at
Track D tier 3a** — the email feeder is exactly when Plexi inherits Akiflow's
flood problem.

## 8. If/when a ruling pass happens

Group for one operator sitting, smallest first: refusals §6 (six one-line
ratifications, three already implied by standing DECs) → structural frame §7 →
candidates §5 in order, each with its own fresh DEC number (§2.4). Spec
corrections §2 need no ruling — they are facts; the spec text should be
amended (or this analysis cited alongside it) before it circulates further.
Q9 (does a desk_block carry its item refs when it recurs) is answerable
cheaply at §5-item-4/8 time; the spec's own warning — that carrying refs
forward is how Akiflow's queues silently bloat — is the right default answer
(container recurs, contents don't).

## 9. Verification appendix

All at `9216f335`; every claim above is one of these or a cited file:line.

```bash
# 8 categories, states, manifest
sed -n '96,160p' src/shared/workItems.ts
# substrate: cap, collapse, layers, dedupe
sed -n '25,60p;205,235p' src/main/notifications/substrate.ts
# one proactive trigger + decay + 30s sweep
sed -n '1,70p' src/main/notifications/scheduler.ts
# precision: pure fn + gate + wiring + (no) UI consumer
grep -n "attentionPrecision" src/main/meta/metrics.ts src/main/db/workItems.ts src/main/ipc/index.ts
grep -rn "precision" src/renderer/src --include="*.tsx" | grep -v test   # → no hits
# velocity reality (§2.1)
cat src/renderer/src/lib/velocityStats.ts
grep -rln "velocityStats" src/                                # dialog + insights only
head -30 src/renderer/src/lib/attentionPlanner.ts             # planner imports
# engaged-time-vs-plan (§2.2)
grep -rn "plannedSeconds" src/renderer/src --include="*.ts*" | grep -v test  # countdown only
# trashNode claim stale (§2.3)
sed -n '1,140p' src/main/db/nodeLifecycle.ts
# absences (§4) — each returns nothing (or false positives shown in §4)
grep -rn "globalShortcut" src/ ; grep -rnE "new Tray|Tray\(" src/
grep -rni "ritual" src/ --include="*.ts*" | grep -v -i theme
grep -rni "interruptPrecision\|counterparty\|mandate_grant\|attendant" src/
# plan accept / ghosts / reason / block model
grep -n "acceptPlan\|ghosts\|\.reason" src/renderer/src/components/views/CalendarView.tsx | head
sed -n '302,352p' src/shared/types.ts
# keyboard reality on the queue
grep -n "onKeyDown" src/renderer/src/components/views/AttentionView.tsx
```
