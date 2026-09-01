# 27 — Demo feedback: 20 items → 12 threads → 5 phases

**Date:** 2026-08-30 · **Source:** operator walkthrough of the build with Caleb
(transcript notes, items 1–20) · **Status:** Phases 1–3 EXECUTED (DEC-087,
DEC-088, DEC-091; DEC-089/090 were follow-on operator QA on the same
surfaces); phases 4–5 awaiting operator go.

The operator demoed the Attention + Calendar work to Caleb and brought back 20
raw items. Reviewed each against the code. The consolidation below is the
ruling on what is a bug, what is a design gap, what was a demo artifact, and
what is process — then the phased plan.

---

## Consolidation — 20 items → 12 real threads

### True bugs (4)

**#1 + #5 → one bug — capture card overflow.** The capture card had no
max-height and no internal scroll (`fb-card` with no cap, unlike
NewNodeDialog's `max-h-[86vh]` convention), so an open Desk drawer + mention
popover ran off the bottom of the viewport with no way to reach them. One
geometry fix covers both reports. → **Fixed in Phase 1 (DEC-087a).**

**#8 + #9 → one bug — the planner couldn't leave today.** The demo ran in the
evening: the planner window is `dayStart..17:00` and `freeSlots` floors at
*now*, so after ~5pm there are literally zero slots and Plan-my-day
honestly-but-uselessly reported "the day is full." Compounding it, intent mode
only picked *items*, never the *day* — "schedule this before noon tomorrow"
still targeted the viewed day. → **Fixed in Phase 1 (DEC-087b):** the intent
parses day words (tomorrow/today/tonight/weekday) into the plan target, and a
closed today rolls to tomorrow with an honest note.

**#10 — duplicate-vs-edit.** Repro found the mechanism (three compounding
causes): single click on a block did *nothing*, so users clicked, got
silence, clicked beside the block — and the column's plain-click handler
booked a NEW slot ("it duplicated"). Separately the 6px resize lips at block
edges snapped a whole 15-minute step off a ~7px hand-slip ("it keeps adding
time"). → **Fixed in Phase 1 (DEC-087c):** single click routes to the same
editor as double-click, a 5px dead zone gates all block drags, and a drag
that moved consumes its click.

**#4 — person-name disambiguation is not a system.** The clarify lane exists
only for *deadlines*; the "which Caleb?" question the operator once saw was a
one-off AI behavior. Real inconsistency → Phase 2 (People workstream).

### Design gaps the demo exposed (4)

**#2 + #3 + #6 + #12 → one workstream: People.** Root cause is a single
decision: the spec put the @ field inside the Desk drawer, and mentions today
are *references, not assignments* (by design, DEC-039; true route-to-teammate
is the deferred SPEC-027 delegation lane, R-06). Near-term: a separate
**People pill/drawer** (desk attach un-buried, its own pill), meeting
extraction converting "Caleb needs to…" into structured mentions, and the
name-clarify lane. Actually *sending* attention to Caleb stays SPEC-027 —
that boundary is stated honestly rather than faked.

**#7 — Slack deep-links.** `source_url` already exists in the schema (built
for exactly this); marks made on webview widgets just don't capture the
current URL. Feasible now, no OAuth required.

**#16 — tags.** Known tension — tags are deliberately never mandatory. The
fix that fits the system: AI-*suggested* tags in the confirm step,
accent-marked as inferred like every other inference.

**#11 — mail.** Pre-existing surface; needs recipient confirmation + real
send-state feedback.

### Not bugs — demo artifacts or already known (4)

- **#13 transcript UI** — already queued ("Fireflies-level rebuild", gated on
  operator go).
- **#14 doc destination** — mostly opened-behind-a-window; the small real fix
  is a created-toast with a link + item association.
- **#15 taxonomy/Discuss** — a standing ruling under the taxonomy law
  (DEC-029); needs usage data, not code.
- **#17 home widgets / live doc embed** — new product build, not a defect.

### Process (2)

- **#18/#19 Caleb access** — the branch is already on origin
  (`saasmouth/focusbuddy`, `ryan-command-center`); he can check it out today
  with a two-line instruction + the flags note. Michael review before merge
  stands.
- **#20 synced docs** — one two-device QA session, same shape as the P1 live
  pass.

---

## Phased plan

| Phase | Items | Size | Status |
|---|---|---|---|
| **1 — Demo-blockers** | Capture modal scroll/cutoff · Plan-my-day day-targeting + after-hours fallback · calendar duplicate-vs-edit guard | ~1 session | **DONE — DEC-087** |
| **2 — People** | People pill/drawer split · capture names → structured mentions · person-clarify lane (groundwork for SPEC-027; routing itself stays deferred) | 1–2 sessions | **DONE — DEC-088** (wrapup-proposal mentions ride Phase 4's transcript rebuild) |
| **3 — Context fidelity** | Slack/webview `source_url` capture · doc-created toast + linkage · mail send verification | ~1 session | **DONE — DEC-091** |
| **4 — Polish & intelligence** | Transcript UI rebuild · AI-suggested tags · home-page widgets / live doc embed | on operator go, per-item | **#13 SATISFIED by SPEC-003** (DEC-099…103: attributed Thread, provenance Record, moment anchors, Recall) · **#16 DONE — DEC-110** · #17 gated on operator shaping |
| **5 — Rulings & process** | Caleb checkout note · synced-docs QA session · taxonomy ruling with queue-usage data · Michael review → landing | as scheduled | open |

## Phase 1 verification record (2026-08-30, live app over CDP :9223)

- **(a)** capture card computed max-height = 758.2px = exactly 76vh at the
  live window; body scroller present; with the Desk drawer open the card
  bottom sat at 633/997 — fully on screen, drawer visible.
- **(b)** at 22:19 (five hours past the 17:00 window) Plan-my-day produced
  proposals **for tomorrow** with the note "Today's working window has
  closed — this plans tomorrow instead." — review sheet opened; nothing
  auto-booked (DEC-052/071 stances hold).
- **(c)** on a scratch block (created and deleted via IPC): plain click →
  Book time editor opened; 3px slip → block unmoved, duration unchanged,
  editor still opened; 56px drag → moved exactly 60min, editor stayed
  closed; 3px wobble on the bottom resize lip → duration unchanged.
- Gates: 3,347 unit tests green (13 new DEC-087 pins), 0 type errors.
