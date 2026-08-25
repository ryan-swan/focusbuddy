# S5 — Capture Console, Classifier, Self-Routing Closure

> **DEC-018 rider (A-3):** `source_type` gains the reserved value `'mission'` in the
> classifier's enum — Dispatch missions will stamp `source_ref=<mission id>` +
> `source_type='mission'` for provenance with zero schema work.

> **Synthesis-intake riders (analysis/20, Δ1–Δ13):** source_type also gains
> `app, sheet, slide, chat` (Δ1). Loose-thought DECAY v1-simple (Δ3): a sweep dismisses
> untouched `loose_thought` items after 14 days (`reason_code='decayed'`); promotion =
> reclassify. Scheduling = tentative holds ONLY, riding the existing proposal-card flow —
> no new calendar machinery (Δ5). Cleanup is opt-in propose-and-approve; priority phrases
> ("no rush") preserved verbatim (Δ6). Multi-intent: primary routes, secondary intents
> surface as additional suggested cards via the existing multi-card pattern (Δ7). FYI
> with durable value also offers create-knowledge-entry (Δ8). The composer carries the
> ONE Q1 question (DEC-016): unanchored-deadline-on-actionable is the P0 trigger
> (named-recipient ambiguity cannot fire while self-routing). Δ12: the six deterministic
> scenarios (mixed-intent review · opt-in cleanup · unrouted banter · scheduling hold ·
> reclassification · voice split) become NAMED end-to-end tests. Δ13: voice notes route
> through the classifier (the S0 parser arm activates). **Flag flip:** this stage turns
> `workItems.enabled` ON — the S0 catalog addendum goes live, and the executor's
> create-work-item no-op is replaced by the real apply path (origin='ai',
> approval-by-card = 'approved').

**Class:** ADDITIVE (new pipeline on the standup AI pattern) · **Needs:** S0 (vocabulary),
S4 (closure notification) · **Risk:** MED (AI-path latency + misclassification UX).

**Mission:** a person (or the AI acting for them) can capture a thought and have it become
a correctly-classified work_item that flows to a terminal state and notifies — the full
loop, self-routed (P0), end to end.

## Read first
- ARCHITECTURE **§6 capture bullets (SPEC-007–013) + §2.6 (self-first)** ·
  [analysis/16-Q1-Q7-PROPOSALS.md](../../analysis/16-Q1-Q7-PROPOSALS.md) (approved Q1
  parameters; Q7 → `wi_origin` handling per DEC-016) · the standup AI split in
  `src/main/ai/` (house pattern: purpose-tagged calls, `discoveryMode`, `creationGate`)

## Build items
1. **Capture console (Routed/Unrouted/Expand)** per SPEC-007–013, plexi primitives only.
2. **Classifier:** the standup split pattern with `AIPurpose:'intent-classify'` →
   `intent_class` + confidence; **hard triggers resolve deterministically WITHOUT the
   model** (R011); model fallback failure ⇒ `intent_class='loose_thought'`,
   `confidence=0`, never a blocked capture.
3. **Q1 rule in the COMPOSER, not the model** (DEC-016): the approved analysis/16
   parameters govern when capture auto-creates vs. suggests (`approval_state` from birth:
   `auto` vs `suggested`).
4. **Self-routing closure:** originator=recipient path wired end-to-end; terminal
   `setState` posts through S4 (queue per intent_class; dedupe_key = item+transition).
5. **AI-created items:** `wi_origin='ai'`, `confidence` set, `approval_state='suggested'`
   unless Q1 auto-threshold met; creationGate honored.

## Adversarial / verify
- **Q1 table-driven tests:** the approved parameter matrix — every row's expected
  auto/suggest/skip outcome.
- **Fallback tests:** model timeout/error/garbage-output ⇒ the loose_thought fallback,
  capture never lost, no unhandled rejection.
- **End-to-end (the mission proof):** capture → classified item → visible in
  `workItems:list` → setState terminal → notification delivered — asserted in one
  integration test AND once live.
- **Latency (R011):** classified-capture ≤ standup-baseline + 1s measured on the dev app;
  hard-trigger path model-free by construction (assert no AI call in the trace).
- Vocabulary: classifier prompts import S0's shared constant (grep-assertion extends).

## Close
Suites + e2e green · live capture demo proof · commit sequence: console → classifier →
Q1 → closure · ACTIVE-MISSION + handoff.
