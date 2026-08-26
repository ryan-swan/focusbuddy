# Intake Verification — Spec + Bug Register vs. Repo Ground Truth

First adversarial pass over 00-SPEC-RAW + 07-BUG-CONFLICT-REGISTER, verified against the live
repo at `a92b30cb` (+ branch tip `43bded65`, docs only). 2026-08-24 late.
Confidence: 0.90 · why_not_higher: BUG-C1-03's root cause and BUG-C1-04's behavior are
UI-runtime claims not yet reproduced live; sync passthrough remains Phase 2's proof.

## Verdicts on the register's C1 claims

| Claim | Verdict | Evidence |
|---|---|---|
| **C1-05** AI layer labels desks "tasks" | **CONFIRMED — worse and more concrete than claimed** | 244 "task" occurrences across `src/main/ai`. Smoking gun: the agent action schema itself — `agentDispatcher.ts:144` puts `{"kind":"create-task",…}` in the prompt, `discoveryMode.ts:32` instructs the model *"propose the desk with a 'create-task' action"*, `creationGate.ts:33` gates `'create-task'`. Desk creation is literally named "create-task" in the prompts the model reads. `discoveryMode.ts:29` also references a `create-todo-list` action — a second vocabulary surface for the SPEC-044 audit. Conflation with a new work_item tool is guaranteed by construction, exactly as the register argued. |
| **C1-02** No canonical desk state model | **PREMISE PARTIALLY FALSE — in a way that shrinks SPEC-042** | Desks already carry `status: TaskStatus` (open / in_progress / **done** / parked, `types.ts:169`) and `archived: boolean` (`types.ts:188`, whose comment references "the dashboard's archived view"). The state *substrate* exists: completed = `status='done'`, archived = flag. Missing: stale (derived), coherent lifecycle semantics/UX, and the memory contract. SPEC-042 becomes "ratify + complete the existing model," not "create one." |
| **C1-01** Archive/delete broken + undefined semantics | **PARTIALLY CONFIRMED — data layer exists, exposure/semantics don't** | `nodes:delete` (ipc:706) + `nodes:restore` (:718) exist; soft-delete via `trashed_at` with recursive child trashing (`db/nodes.ts:213-230`); `listNodes` filters `trashed_at IS NULL`. The reported "desks cannot be deleted" is a UI-exposure bug or regression on top of working substrate — cheaper to fix than the register assumed. The memory contract (Q5) remains genuinely unresolved: brain/memory content survives trashing. |
| **C1-03** Shared desks route to All Desks | **MECHANISM UNVERIFIED — triage before relying on it as validation case** | `sharedFromHandle` has zero hits in `Sidebar.tsx`/`stores/nodes.ts` — the Shared-tab filter lives elsewhere. Root cause could be enumeration-filtering (the register's theory) **or** metadata (desks arriving via org sync never get share metadata stamped). Keep as a SPEC-004 validation case *conditionally*: it validates the census method only if triage proves it is an enumeration bug. Either way the fix matters. |
| **C1-04** Room→desk click-through unreliable | **ACCEPTED AS REPORTED** (UI-runtime; reproduce live at fix time). Narrow-fix scoping endorsed; the horizontal-layout redesign stays out (BUG-C3-03). |

## New verified fact the register didn't have — SPEC-043's danger is concrete

`nodes.parent_id REFERENCES nodes(id) ON DELETE CASCADE` (`database.ts:32`), and the
soft-delete path (`trashNode`) **recursively sweeps all children by `parent_id` with no kind
filter** (`db/nodes.ts:223`). Consequence: a work_item parented to a desk is silently trashed
(soft path) or cascade-deleted (hard path) when the desk goes. A routed item assigned to *you*
would vanish because the *sender* trashed their desk. `trashNode`'s recursive sweep is a
live, named Class-C consumer for SPEC-004, and SPEC-043's "must be answered at SPEC-002" is
upgraded from prudent to mandatory.

## Verdicts on the amendments

- **SPEC-042** — endorse, resized: extend/ratify existing `status`+`archived` (+ derived
  stale, + `generatedBy` provenance if CR rules need it); desk subsystem owns it.
- **SPEC-043** — endorse, now evidence-backed (see above). Default cascade behavior exists
  and is wrong for routed items; the schema answer lands at SPEC-002.
- **SPEC-044** — endorse; starting census 244 occurrences / `src/main/ai`; audit must cover
  action-kind names (`create-task`, `create-todo-list`), prompts, tool schemas, parser
  branches (`agentDispatcher.ts:372`), and output labels. Note: renaming action kinds is a
  prompt+parser+gate change in lockstep — small but atomic.
- **SPEC-004 validation case** — endorse conditionally (triage C1-03's root cause first;
  BUG-C3-04 carries the same note). Add `trashNode`'s recursive sweep as a *confirmed* named
  Class-C site.
- **SPEC-014/017 click-through acceptance** — endorse as written.
- **SPEC-037 P2→P1** — defer the re-tier to G3's cut-line pass; the argument (recap makes
  archive emotionally safe) is strong and now cheaper given the existing archived substrate.

## CR-07 position

**Option B (parallel prerequisite), resized down.** With `status`/`archived`/`trashed_at`
machinery verified present, the prerequisite is: fix the delete/archive exposure bug, ratify
lifecycle semantics (incl. stale derivation + memory contract Q5), and surface it in UI —
not build a state model from zero. Smaller than the register priced it; ownership argument
(desks own desk state, Attention reads) unchanged and endorsed. Sequence the Q5 memory-contract
decision once, covering desks AND work_items.

## Intake completeness flags

- **IQ-1:** the bug synthesis paste is missing sections 7, 8, 13, 14, 17 (numbering jumps).
  Operator to confirm: trimmed deliberately, or lost in paste?
- **IQ-2:** primary objective sentence (spec §0) awaits operator confirmation — G1 requirement.
- **IQ-3:** the crossroads docket is now CR-01..CR-06 (spec §7) + CR-07 (register §3) — one
  batched ruling pass, per protocol.
