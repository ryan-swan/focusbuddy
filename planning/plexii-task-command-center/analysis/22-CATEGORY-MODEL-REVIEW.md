# Review — "The Attention Category Model" synthesis vs the shipped build

**2026-08-26 · ANALYSIS ONLY (operator: "don't do or build — analyze, synthesize,
review").** Subject: the operator-pasted eight-category synthesis (To Do /
To Review / To Decide / To Respond / To Meet / To Discuss / To Remember /
To Know, with secondaries, five taxonomy tests, demotions, R-01…R-07).
Reviewed against: the shipped Attention layer (S0–S7, L1–L3, DEC-001…028),
CR-09 Parts I+II, and the standing doctrine.

## 0. Provenance and the headline

The synthesis **supersedes a seven-category model this build never had**
(Action/Review/Deliverable/Decision/Wait/Research/Miscellaneous) and cites
decision records from a different namespace (its "DEC-014 category axis" ≠
our DEC-014 G1 batch; its "DEC-013/A-01 create-task freeze" ≈ our DEC-011).
It is a parallel design lineage — and the headline finding is **convergent
evolution: it lands roughly 85% on what is already shipped.** Same anti-goal
(aggregate by reference, work lives in desks/rooms — F006 verbatim), same
states-not-categories law, same decay philosophy, same two-speed instinct,
and even the same COUNT: eight in, eight out.

| Synthesis primary | Shipped class today | Delta |
|---|---|---|
| To Do (5 secondaries) | `action` | rename + secondaries |
| To Review (4) | `review` | rename + secondaries |
| **To Decide (4)** | — (folded into review/action) | **genuinely new primary** |
| To Respond (4) | `acknowledgment` + `direct` + answer-shaped `action` | **consolidation** — ack demotes to a secondary |
| To Meet (6, dual-axis) | `scheduling` | rename + the only two-axis secondary set |
| To Discuss (4) | `discussion` | rename + attachment/batch-discharge semantics |
| To Remember (4) | `loose_thought` | rename + secondaries; decay-as-success MATCHES the shipped 14-day tier exactly |
| To Know (4, machine-authored) | `fyi` | authorship discipline is new; heads-up = the person-authored残 |

Net queue count: 8 → 8 (acknowledgment+direct merge in; To Decide splits out).

## 1. What the build already proves the synthesis right about

- **T-3 (states, not categories) is shipped law.** `work_item_state` already
  carries waiting/blocked/suggested/stale + the terminal set, with the
  never-done projection. The synthesis's biggest demotions (Await, Unsorted,
  Closed) describe the existing architecture.
- **To Remember's "expiring unpromoted is success"** = the shipped
  loose-thought decay tier (14d, reason 'decayed', quiet) — philosophy
  identical, down to the bail-out role (Unrouted files there).
- **Two-speed intake exists at P0:** the Unrouted mode is the one-keystroke
  bail-out; DEC-019's single confirm stop is the fast self-capture lane. The
  synthesis's mandatory-clarification lane applies only when a RECIPIENT
  exists — which is P1/SPEC-027 territory by definition, so there is no P0
  conflict, only a P1 amendment to schedule.
- **Machine-authored discipline half-exists:** `wi_origin='system'` is
  already excluded from the headline badge; agent/AI items already ride
  `approval_state='suggested'`.
- **Deliverable-as-entity, domain-as-Room, recurrence-as-property,
  calendar-as-surface** — all match shipped structure (DEC-009's calendar
  ruling said exactly "surface, not category").

## 2. Genuine upgrades worth adopting (improvement, low conflict)

1. **To Decide as its own primary.** T-5 is right: decide's questions (options,
   deadline, cost-of-no-call) are not review's (artifact, response kind,
   who's blocked). Today decide-shaped items mis-file as review/action and
   lose that routing. The strongest single change in the doc.
2. **To Respond consolidation.** Acknowledgment-as-primary is thin in
   practice (its queue rarely earns its rail); as a secondary under Respond
   with answer/reply/decline siblings it gains context instead of losing it.
   Also cleanly absorbs the awkward `direct` class.
3. **The five tests + anti-collision as STANDING LAW.** Regardless of any
   rename, T-1…T-5 are the best governance artifact in the doc — they end
   future taxonomy debates by rule instead of taste. Adopt on paper
   immediately, zero code.
4. **Secondaries as a RESERVED axis.** One nullable manifest column
   (`intent_sub`), emitted + allowlisted now while schema churn is cheap,
   UI adoption deferred until the question sets exist to justify them.
5. **R-03 (To Know out of the precision denominator).** Correct by
   construction; partially true already via origin exclusion — finishing it
   is a metrics fix, not a feature.
6. **The five taxonomy tests retro-applied** catch one shipped wart: the
   `question-mark → action` hard trigger conflates To Respond/answer with
   To Do — worth revisiting in the alignment pass.

## 3. Real conflicts and costs (named, not hand-waved)

- **DEC-016 (at-most-ONE question) vs per-category question sets.** Resolved
  by scope, not by loser: Q1 restraint governs SELF-capture (the 5-minute
  promise); the question sets belong to the RECIPIENT lane, which doesn't
  exist until SPEC-027. But this must be RULED as a scoped amendment to
  DEC-016/019, not assumed — the sender-pays principle (§Problem 2) is the
  right trade and it *changes a standing decision*.
- **DEC-019 (one confirm stop) needs the same P1 amendment** for the sender
  lane (N questions when addressing someone else). Self-lane untouched.
- **"The assistant holds the person to it" vs pull-not-push (CR-09 §8).**
  Accountability must surface at moments of use (standup, ranker, streaks) —
  never new banner families. The synthesis doesn't say banners; the
  reconciliation just needs to be explicit or the doctrine erodes.
- **R-04 (notifications become To Know items) is a big architectural move
  dressed as a ruling.** It would refactor the S4 substrate (delivery
  records, caps, dedupe) into item-space and changes queue volume
  characteristics (build failures as rows). Real appeal (one system), real
  risk (queue pollution; the caps exist because S4 learned they must).
  Needs its own analysis doc before anyone rules — recommend splitting it
  out of this model's adoption entirely.
- **The rename migration is a real stage, not a find-replace.** Inventory:
  DB values on live rows · HARD_TRIGGERS · model prompts (intentClassify
  CLASSES + vocabulary rules) · PRIMARY_ACTION / QUEUE_LABEL / ICON / ORDER ·
  CLASS_CHOICES/LABEL (card + AttentionView copies) · badge byIntent keys ·
  ~dozens of test pins · cross-version note (an un-updated peer coarsens an
  unknown class to 'action' via normalizeIntentClass — acceptable solo,
  stated for the fleet).
- **Vocabulary quarantine care:** "To Do" surface language must not leak
  'task' back into AI prompts where task=desk is locked (DEC-011). The V-A
  audit the doc proposes is our GAP-011 restated — genuinely needed if the
  rename lands.
- **Cross-reference drift:** the doc's DEC/GAP/A numbers don't match our
  log. If adopted, its content re-anchors into OUR records (a DEC-030-shaped
  ruling); its internal citations should not be trusted as pointers.

## 4. Interaction with CR-09 (Parts I+II)

- **Strengthens D-A:** the object-marking preset table gets a better target
  vocabulary (Slack→To Respond/reply; doc→To Review/feedback; agent→To
  Know/system vs Review — richer than today's classes).
- **The ProposalTray (D-H) IS this model's confirmation surface** — capture,
  marking, observers, and the future clarification engine all terminate in
  the same review pattern. No competition; mutual reinforcement.
- **The two-layer law (D-F) bites hardest here:** the synthesis's intake flow
  is AI-first ("no form, no field selection"). Under the law, the manual
  path must be equally complete — which PROMOTES the Layer-0 "bare manual
  form with a category picker" from optional (D-I third) to REQUIRED if
  this model is adopted. Eight primaries picked by hand must be as
  first-class as eight primaries proposed by AI.
- **Scoping, plan boundary, menus (D-B/C/D):** orthogonal — unaffected by
  the taxonomy either way.

## 5. Improvement vs competing priorities — the sequencing read

| Move | Cost | When |
|---|---|---|
| Adopt T-1…T-5 + anti-collision as law | paper only | **Now** (a DEC line) |
| Taxonomy alignment stage (rename to the eight, To Decide in, Respond merge, reserve `intent_sub`, data migration, prompt/test updates) | ~a day, bounded | **Post-landing**, alongside CR-09 — churning category names into the reveal diff delays it again for no user-visible P0 gain |
| Layer-0 manual form w/ category picker | small | With the alignment stage (required by D-F) |
| Clarification engine (question sets) + secondaries UI + two-speed sender lane | the P1 centerpiece | **With SPEC-027 routing** — it's the sender-pays feature and meaningless before recipients exist |
| R-04 absorption | unknown until analyzed | Own analysis doc first; no ruling now |
| R-03 precision fix | trivial | Any time post-landing |

**Net verdict:** this is not a rival model — it is the shipped model's own
next version, arriving from an independent lineage with three real upgrades
(To Decide, Respond consolidation, the tests-as-law), one big P1 feature
(the clarification engine) correctly separable, and one oversized ruling
(R-04) that must not ride along quietly. Nothing in it forces rework of the
spine, the sync layer, lifecycle, or CR-09's structure. The dangerous path
would be adopting it as a pre-landing rewrite; the natural path is a
post-landing alignment stage plus P1 rails.

## 6. Their rulings mapped to our queue

| Theirs | Disposition here |
|---|---|
| R-01 schema vs surface naming | Ours; recommend: schema keeps both primaries (`to_review`,`to_decide`), surface may label filtered views in team language — matches our schema-name-vs-label precedent (DEC-011) |
| R-02 delegated ownership (one shared item vs two) | P1/SPEC-027 design input — park with the routing architecture; the retention rule (§8) already assumes recipient-owned copies, which leans "two items, linked" |
| R-03 precision excludes To Know | Adopt (trivial), Caleb-courtesy note since attentionPrecision is a shared metric |
| R-04 notifications-as-items | Split into its own analysis before ANY ruling |
| R-05 Meet dual-axis + Discuss batch discharge | Real schema asymmetries; goes in the alignment-stage architecture addendum |
| R-06 two-speed trigger = recipient presence | Confirmable NOW as doctrine (it describes shipped behavior + the P1 lane) |
| R-07 `do` reserved word | Non-issue with string literals (`'to_do'`); a lint note in the alignment stage |
