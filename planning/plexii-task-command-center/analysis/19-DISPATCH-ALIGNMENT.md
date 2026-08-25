<!-- Intake 2026-08-25: operator pasted the Dispatch build brief (A6 built / A7 planned,
     paused for OUR build). Instruction: analyze and compare ONLY — nothing built or
     changed against it. Recommendations below await operator ruling before any register,
     stage-prompt, or architecture amendment lands. -->

# Dispatch (A6/A7) vs the Attention Layer — Alignment Analysis

**Source:** operator-supplied brief, 2026-08-25. A6 (agentic browser runtime) BUILT and
live-driven; A7 (Dispatch) researched+planned, **paused while "the task management
system" — i.e. THIS BUILD — is built**. **Our state at intake:** S0–S3 shipped
(commit `00240bda`), S4 next.

## 0. Verdict

**Strongly convergent — we are Dispatch's named critical path, not a parallel effort.**
The brief's own pause rationale says D4 "will drive the task system directly" and names
two capabilities it needs from us: (1) task create/update/complete callable by the app —
**already shipped** (S3's `workItems:*` over the F008 one-code-path); (2) task changes
that record who made them — **half-shipped** (creation attribution via `wi_origin` +
`originator_id`; per-CHANGE attribution is the one genuine seam gap, see A-1). No
foundational conflict found. Seven friction points identified, none blocking S4–S7,
two deserving cheap seam reservations now.

## 1. Where Dispatch explicitly depends on us — and our status

| Dispatch need (verbatim intent) | Our provision | Status |
|---|---|---|
| "task create/update/complete callable by the app" | `createWorkItem` / `setWorkItemState` / `updateWorkItemFields` — main-process, F008 single code path, typed refusals | **SHIPPED (S3)** |
| "task changes can record who made them (a person or an agent acting on their behalf)" | `wi_origin` ('human'\|'ai'\|'system') + `originator_id` at CREATION; per-change attribution absent | **PARTIAL** → A-1 |
| "reliable notifications for exactly two things — needs-you and done" (D1) | S4's substrate: durable `wi_notifications`, generic `ref`+`queue`, UNIQUE dedupe, rate caps | **DESIGNED (S4, next)** → A-2 |
| "keep or dismiss per finding" (trust law 1) | `approval_state` substrate from birth (auto/approved/suggested/dismissed/merged) + `dismissed` state, never-done projection | **SHIPPED (S2)** |
| "provenance stamp on anything the AI creates" | `source_ref`/`source_type` (incl. 'browser') + `wi_origin` + `confidence` on every work_item | **SHIPPED (S2)** → A-3 for the mission id |
| "'done' is computed, never claimed" | A-02/F012: status is DERIVED from work_item_state, recomputed at every apply, never writable from the wire or a patch | **SHIPPED (S2/S3)** |
| "structural scoping — capability limits, not instructions" | The §2.6 scope invariant + leaf invariant + typed refusals at the db module — same enforcement philosophy, same layer | **SHIPPED (S1)** |
| "every mission reaches a terminal state; a wedged run is force-failed" (their no-hang contract) | Same doctrine in our park-inbound (no silent swallow), wake-coalescer, bounded purge | **SHIPPED** (philosophical twin) |

## 2. Adoption list (cheap, high-leverage; each names its absorbing stage) — AWAITING RULING

- **A-1 · Reserve per-change attribution in the write path** *(the one real seam gap).*
  Add an optional `actor?: { kind: 'human'|'agent'|'system'; agentRef?: string;
  missionRef?: string }` parameter to `createWorkItemCore` / `setWorkItemStateCore` /
  `updateWorkItemFieldsCore`. v1 threads and logs it; storage (columns vs event log) is
  a D4-time decision. Because F008 makes these THE only write path, reserving the
  parameter now costs minutes; retrofitting after S5's callers multiply costs a sweep.
  *Absorb: S4/S5 (they touch these signatures anyway). Requires: a small architecture
  amendment note (v2.3 §2.3), operator-approved.*
- **A-2 · S4 substrate doubles as the Dispatch notification rail.** Already generic
  (`ref` TEXT, `queue` TEXT); adopt by DOCUMENTATION: S4's close notes state that
  mission events post through it (`queue='mission-needs-you'|'mission-done'`,
  `ref=<mission id>`), so D1 never builds a second notification path. Also: keep the
  words "dispatch/dispatcher" OUT of all S4 naming (scheduler, delivery, sweep are the
  house words). *Absorb: S4, zero code delta.*
- **A-3 · Reserve `source_type='mission'`.** The enum is doc-level over a TEXT column —
  additive. Missions stamping `source_ref=<mission id>` + `source_type='mission'` gives
  work_items mission provenance with zero schema work. *Absorb: S5 (classifier enum).*
- **A-4 · Vocabulary reservations.** Add to the quarantine card: **"Dispatch"** (the A7
  nav section), **"mission"** (a Dispatch run), and note the pre-existing
  `agentDispatcher.ts` (per-agent invocation — Caleb's to reconcile with the Dispatch
  name). S6 must not name any surface/nav item "Dispatch". *Absorb: 00-PROTOCOL card +
  S6 prompt, doc-only.*
- **A-5 · S6 anticipation, free:** WorkItemsView ships a "By origin" lens
  (human/ai/system) — trivially anticipates mission filtering; the System queue is the
  natural landing for mission system-events later. *Absorb: S6, already congruent with
  its design.*
- **A-6 · The D4 integration doctrine (for the eventual PR/handoff to Caleb):** agents
  write work items ONLY through the workItems module — never a parallel path — or every
  invariant (projection, leaf, scope, C2, CI locks) silently dies. One paragraph in the
  merge-readiness preconditions (§8 R016 family). *Absorb: S7 close-out.*

## 3. Conflict register (named early, per the operator's directive)

| # | Conflict | Severity / when it bites | Proposed resolution shape |
|---|---|---|---|
| C-1 | **Mission-undo vs no-hard-delete.** "Undo the mission as a unit" wants to remove created artifacts; work_items have no hard-delete at v1 (§2.5.10, R008-pending). Our CI delete-lock makes any fourth delete path fail the build — deliberately. | Bites at D1 (mission undo). Not before. | DEC at D1: mission-undo of an agent-created work_item = `dismissed` (+ wi_local flag) OR rides the already-sanctioned agentHistory-undo site with its detach-and-revive. The lock forces the conversation — working as designed. |
| C-2 | **Two "what needs me" surfaces.** Dispatch monitor (desk/mission rail) vs Attention (item rail). Split attention models would be a UX failure. | Design-time, D1–D3. | Compose, don't compete: mission needs-you moments ALSO materialize as work_items (`needs_approval`, origin 'system'/'ai', source 'mission') → one attention plumbing, two lenses. A-1+A-3 make this nearly free. |
| C-3 | **Duplicate notification substrates.** D1 lists "reliable notifications" as its own build item. | Bites if D1 starts before reading S4. | A-2: S4 lands first and is offered as the rail; flagged in the upstream notes. |
| C-4 | **anthropic.ts churn collision (R001 extension).** A6's post-branch refinements + future A7 mission verbs live exactly where S0's quarantine strings live. | Textual merge pain, grows with time. | Pre-S6 checkpoint: diff main, size drift, absorb A6 refinements deliberately. `vocabulary.ts` single-source is the merge-friendly shape (Caleb's mission prompts can import it). |
| C-5 | **Vocabulary.** "Dispatch", "mission" now reserved (A-4); the browsing "task" third sense was already quarantined in S0 — the brief confirms why it exists. | Low. | A-4. |
| C-6 | **Two automation rails later.** D4's scheduler ("recur or trigger on conditions") vs Flows (`fb_flows` triggers). | Caleb-side, D4-time. | Register the note for the handoff: a mission trigger could ride Flows' trigger machinery rather than a second scheduler. Not ours to solve. |
| C-7 | **Parallel write path risk.** If D4 lets agents write tasks around the db module (direct SQL, own IPC), every S1/S2 invariant silently breaks on merge. | The one EXISTENTIAL integration risk; bites at D4 or at merge. | A-6 doctrine + our parity/CI locks (which fail loudly in-repo) + the §8 merge-readiness preconditions. |

## 4. Resonances worth keeping in view (no action)

- Their trust laws ≅ our quality framework: computed-done ≙ derived projection; hard
  ceilings ≙ bounded sweeps/caps; visible artifacts ≙ our honest-ledger close protocol;
  two-tier confirmation ≙ our S4 rate-cap + S7 nudge-restraint split.
- D2's "new since you last looked" overlaps the existing review-point machinery
  (`ceMarkReviewed`) and our `wi_local.read_at` — three consumers of one concept;
  worth one shared-substrate look at D2-time.
- Their D0 market finding — "visibility of artifacts, not narration" — is exactly why
  the Attention layer renders state from data (queues from `work_item_state`), never
  from AI narration. The two features will demo as one philosophy.

## 5. Standing answer to "is our work in support of this vision?"

Yes — structurally. Dispatch paused FOR this build; its D4 gate ("delegate a real task…
come back to work you can audit") is only reachable over the rails we are laying:
app-callable task verbs (shipped), attribution (A-1 closes it), provenance (shipped +
A-3), approval/dismissal substrate (shipped), one notification rail (S4), and
capability-enforced scoping (shipped). The remaining stages S4–S7 need only the six
A-items above — five of which are documentation-weight — to make the eventual Dispatch
build land on us without rework.
