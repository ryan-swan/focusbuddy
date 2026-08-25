# S0 — SPEC-044 Vocabulary Quarantine Execution

**Class:** ADDITIVE + label-only edits · **Blocks:** S5's classifier · **Risk:** LOW
(no schema, no wire changes — the wire gains one NEW verb, changes none)

**Mission:** make the model-visible and user-visible vocabulary unambiguous BEFORE any
work_item code exists: the AI prompt layer learns what a work_item is and that a "task"
in the wire protocol is a Desk; the reserved `create-work-item` verb is defined end-to-end
(parsed, capability-gated, no-op until S3 wires it); the mislabeled UI strings from the
audit worklist are corrected.

## Read first
- ARCHITECTURE §1 (quarantines + vocabulary splits), §7 S0 row
- [analysis/11-AI-VOCAB-AUDIT.md](../../analysis/11-AI-VOCAB-AUDIT.md) — the 62
  model-visible occurrences, riskiest-5 ranking, persistence map, label worklist
- The Flow-executor and apiServer arms named in analysis/11 (both must gain the new-verb
  arm; saved Flows must keep parsing `create-task` byte-identically)

## Build items
1. **Prompt definitions:** every AI prompt assembly site from analysis/11's riskiest-5
   gains the quarantine block — "task"=Desk on the wire; `work_item`=the attention entity;
   never emit `create-task` for a to-do. Definitions live in ONE shared constant, imported
   (no copy-paste drift): `src/main/ai/` shared vocabulary module.
2. **`create-work-item` reserved + defined:** wire-verb constant, parser arm in the
   command dispatch (same switch as `create-task`), **capability-gated on
   `workItems.enabled`** (config flag, default OFF — its first introduction), typed no-op
   handler returning a "not yet enabled" result. Flow-executor + apiServer arms added.
3. **Label worklist:** the audit's user-visible mislabels corrected exactly per the
   worklist (labels only — no behavior). AllTasksView/Pulse renames are NOT here — they
   are S6 (CR-04(b)); do not jump the gun.
4. **Persistence check:** for each edit, consult analysis/11's persistence map — strings
   that persist into saved Flows/templates are NOT edited (compat), only their
   render-time labels.

## Adversarial / verify
- **Grep-assertions (add to a `tests/unit/vocabQuarantine.test.ts`):** (a) no prompt
  file emits the phrase "create a task" for work-item intent; (b) `create-work-item`
  appears in parser + Flow + apiServer arms; (c) the shared vocab constant is imported at
  every riskiest-5 site (no local redefinitions).
- **Label snapshots:** before/after snapshot of each worklist label.
- **Saved-Flow compat:** load a saved Flow containing `create-task`; execute; identical
  behavior (wire unchanged). Live HMR: palette + standup still behave identically.
- **Gate check:** flag OFF ⇒ `create-work-item` returns the typed not-enabled result and
  creates nothing.

## Close
Suites green · grep-assertions in CI · live proof captured · commit
`s0: vocabulary quarantine (SPEC-044)` · ACTIVE-MISSION + handoff updated.
