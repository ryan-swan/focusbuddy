# Phase 1 — Spec Intake & Decomposition — Tactical Plan

**Strategic spec:** [ROADMAP Phase 1](../../ROADMAP.md) · **Status:** NOT STARTED (waiting on the spec)
**Gate:** G1 — every spec item inventoried as SPEC-NNN; overall interpretation confidence ≥ 0.80;
every ambiguity logged as a question, none silently resolved
**Closes gaps:** GAP-009

## Pre-flight
- [x] Intake protocol written ([SPEC-INTAKE.md](../../SPEC-INTAKE.md))
- [x] Destination ready (`analysis/`)
- [x] Baseline verified (branch @ a92b30cb, even with origin/main; dev app live)
- [ ] Operator pastes the product spec ← **the trigger**

## Build steps
1. **analysis/00-SPEC-RAW.md** — verbatim spec + received-date frontmatter — *test: diff-identical to the paste*
2. **analysis/01-FEATURE-INVENTORY.md** — SPEC-NNN decomposition per the intake protocol
   (item schema, product principles, non-goals) — *test: completeness re-read; every spec
   sentence maps to an item or an explicit non-requirement*
3. **GAP-REGISTER.md** — append one GAP-NNN per ambiguity — *test: zero ambiguities resolved
   by interpretation alone*
4. **ASSUMPTIONS.md** — append load-bearing interpretation assumptions with triggers
5. **ACTIVE-MISSION.md + NEXT-SESSION-PROMPT.md** — phase close per handoff discipline

## Tests
- Success: inventory covers 100% of spec content; confidence profile reported; ambiguity
  list surfaced to operator as direct questions.
- Adversarial/edge: re-read the raw spec hunting for anything WITHOUT an ID (mockup captions,
  parentheticals, implied behaviors); spot-check 5 items against the raw text for faithful
  restatement (no drift toward what's easy to build).

## Success criteria
- Operator can answer the ambiguity list without re-explaining the spec.
- Phase 2 can start from the inventory alone (acid test: no other context needed).

## Unresolved questions
- Spec format/size unknown — if it arrives as multiple pastes or files, Step 1 concatenates
  with source markers before anything else runs.

## Done when
- [ ] G1 gate met · GAP-009 CLOSED · ambiguity questions delivered · ACTIVE-MISSION updated ·
  NEXT-SESSION-PROMPT regenerated · handoff note in `phases/HANDOFFS/`
