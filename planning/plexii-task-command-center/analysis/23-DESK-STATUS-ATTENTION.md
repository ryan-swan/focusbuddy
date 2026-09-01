# Analysis 23 — Desk status ⇄ the Attention layer

**2026-08-26 · INVESTIGATION ONLY (operator: "not asking you to make any
changes right now… purely investigation"). Nothing here is built.**

The operator's frame: the All Desks page groups desks by status (to-do / in
progress / done / archived) and that is worth keeping — but a desk-level
"to do" *is* an attention-shaped fact, so the two systems should meet. If a
whole desk is a to-do, items created on it should group under that broader
to-do, automatically or after the fact, with a depth limit. And the capture
box should be able to tag status (in progress, waiting…) at creation.

## 1. Two substrate facts that decide the shape

**Fact 1 — the vocabularies are ALREADY the same.** Desk `status` is
`open | in_progress | done | parked` (TaskStatus). A work item's rich
`work_item_state` PROJECTS onto exactly those four values
(`statusForWorkItemState`, §2.3). This is not a coincidence to exploit
casually — it means a desk's status and an item's coarse state are the same
species of fact, and any bridge can be built without inventing a third
vocabulary. The All-Desks groups and the Attention queues already speak one
language underneath.

**Fact 2 — desk-as-attention already half-exists, deliberately one-way.**
The S7 feeders surface due/stale desks *as* attention (computed, muteable,
never materialized), and CR-09 Q3 ruled the manual half: "attend to this
whole desk" = ONE work item referencing the desk (`sourceType:'desk'`) — an
item, never a feeder, never a plan. The boundary rule stands: *items point,
scopes group, plans are CHOSEN.*

## 2. The trap to refuse: stored auto-grouping (dual encoding)

The obvious build — when a desk is "to do", auto-write `groupId` on every
item created there, pointing at a desk-level item — fails the operator's own
"without it getting messy" bar, for a reason worth recording:

> An item's membership in its desk is ALREADY stored, in `parentId`.
> Auto-writing `groupId` to say the same thing encodes ONE fact in TWO
> places, and they WILL drift: move the item to another desk and the stale
> group either lies or needs a sweeper; delete the desk-item and every child
> needs re-parenting; sync races multiply all of it. DEC-035's grouping was
> built for relations `parentId` CANNOT express (cross-desk, ad-hoc). Using
> it to mirror `parentId` is the mess.

Auto-creating the desk-level item itself has a second trap: a materialized
row per statused desk is a feeder that writes — queue pollution, and a
violation of pull-not-push (CR-09 §8) the moment it notifies or crowds the
queues.

## 3. The shape that survives: DERIVE the cluster, never store it

**Recommendation (Option C):** in the Queue lens, items sharing a `parentId`
render CLUSTERED under a desk header row — the desk's title, its own status
chip, its due date if any. No new state. It cannot drift (it is a rendering
of `parentId`), it works retroactively and "automatically" by construction
(his ask — because there is nothing to add), and moving an item between
desks re-clusters it for free.

- **Depth solved without touching the DB invariant.** Visual hierarchy
  becomes: desk header → its items → (existing one-level manual groups
  inside). Three visual levels; storage stays EXACTLY one level (DEC-035's
  enforced rule). The operator's "sub-sub items… we will need to limit"
  lands as a render fact, not a schema loosening.
- **The desk-mark item (CR-09 D-A's "Attend to this desk") becomes the
  header's anchor when one exists** — clicking the header opens the desk;
  marking the desk gives the header a closeable loop. Optional, manual,
  already-designed.
- **Status flows as SUGGESTIONS, never writes.** Closing the last open item
  on a "to do" desk → one quiet offer: "everything here is closed — mark the
  desk done?" A "to do" desk accumulating ≥N items → the existing
  plan-suggestion machinery (CR-09 Q3 ruled: accumulation only ever
  SUGGESTS). Desk status stays USER-OWNED — it is a core-Plexii field on
  Caleb's surfaces, and auto-writing it is a PRESERVATION-DOCTRINE crossroads
  requiring coordination, not a side effect.
- **All-Desks gains the reverse signal cheaply:** per-desk attention badges
  ("3 open · 1 due") on the cards, derived from the same query the feeders
  already run. The status groups stay exactly as they are.

**Naming caution:** All-Desks' "To Do" group and the item class `to_do` are
different facts wearing one word. Surfaces must label them so they cannot be
read as the same thing (e.g. desk chips say "Desk: to do").

## 4. Status at capture (the second ask)

Small, real, and safe with one restriction. `createWorkItemCore` hardcodes
state `open`/`suggested`; a draft `state` field restricted to ACTIVE states
(`open | in_progress | waiting | blocked`) is a clean extension — terminal
states at birth would skip closure notifications and pollute Recently
closed, so they stay setState-only. UI: the preview card is already dense;
lean = a compact status row beside urgency (editor already covers the rest).
Q1/nudges/ranker all read states, so a born-'waiting' item behaves correctly
everywhere by construction.

## 5. Decision list (for the operator's ruling — nothing proceeds without it)

- **D-1** Adopt derived desk-clustering in the Queue lens (headers from
  `parentId`; no stored grouping)?
- **D-2** Desk header anatomy: status chip · due chip · open count · click
  opens the desk · shows the desk-mark item when one exists?
- **D-3** Status suggestions: offer desk-done when the last item closes;
  offer plan-promotion at ≥N (reuse CR-09's threshold DEC)?
- **D-4** All-Desks cards gain attention badges (count + due), status groups
  unchanged?
- **D-5** Capture-time status: ACTIVE states only, as a compact row on the
  card + form?
- **D-6** Coordination: any change to how desk `status` is WRITTEN (vs read)
  goes to Caleb first (core-surface field)?

**Explicitly rejected on the mess bar:** stored auto-grouping mirroring
`parentId`; auto-materialized desk items; auto-written desk status; any
second nesting level in storage.
