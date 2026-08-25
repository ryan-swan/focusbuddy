<!-- Intake 2026-08-25 (part 1 of 2): the operator pasted the FULL feature synthesis —
     "AI-Routed Command Center" — the master document the spec session distilled
     SPEC-001+A1's 44 items from. Part 2 (the current-landscape map) arrives next; the
     enriched S5–S7 prompts are authored after both land. This doc is the diff gate:
     synthesis ↔ SPEC-001+A1 ↔ v2.3 architecture ↔ built code (S0–S4 + L-track). -->

# Full Synthesis Intake — Diff vs Scope, Architecture, and Built Code

**Verdict up front:** the synthesis RATIFIES the build. SPEC-001+A1 was a faithful
skeleton of this document; v2.3's core structures match the synthesis at the exact-enum
level in the places that matter most; several of the synthesis's "unresolved" questions
are already RESOLVED by operator DECs (we are ahead of the document, not behind it).
Findings: **12 exact confirmations · 13 detail deltas (enrich S5–S7 prompts) · 9 items
out of our scope (ownership named) · 0 architecture conflicts · 5 synthesis-open
questions already closed by DECs.**

## 1. Exact confirmations (synthesis ↔ shipped/approved, no action)

| Synthesis | Ours | Status |
|---|---|---|
| Intent as the organizing primitive; 8 routes (questions merged into tasks — its own recommendation) | `intent_class`: `action review scheduling fyi acknowledgment discussion loose_thought direct` | **EXACT — shipped S2** |
| Terminal states: acknowledged answered scheduled delivered reviewed completed discussed dismissed reclassified | `work_item_state` terminal set | **EXACT 9/9 — shipped S2** |
| Status vocabulary "small but explicit" | non-terminal set incl. suggested/stale/blocked/waiting/delegated | **Match** (see Δ2 for "archived") |
| Aggregate by reference, never own; dashboard = lens | The entire Attention architecture; queues over `work_item_state`; source_ref click-through | **Foundational identity** |
| Tags/confidence/approval-state on AI items; suggested→accept/dismiss/merge | `confidence`, `approval_state` (auto/approved/suggested/dismissed/merged) from birth | **Shipped S2** |
| One plain-language reason per item, generated FROM the ranking signals | `reason_code` + one-rendered-reason + F006 ranker (deadlines, staleness, explicit-ask first) | **Approved v2.3 → S6** |
| Command center = widgets on home canvas + collapsed top-bar count + assistant entry (F23 "most likely answer") | SPEC-014 seven widgets + SPEC-015 count + palette | **EXACT — v2.3 §6** |
| Widget list: Tasks, Reviews, Calendar, Awaiting Ack, Completed, Stale Desks | Same + System (DEC-016 Q7 resolved the synthesis's open question) | **Superset by DEC** |
| Reclassification is the receiver's RIGHT; sender notified | reclassify verb (S3) + closed-loop notification (S4 rail) | **Shipped** |
| Closed loops via restrained notifications ("needs you"/"done" class) | S4 substrate: durable, deduped, per-queue caps, summary collapse | **Shipped S4** |
| Clarification proportional; one sharp question max | DEC-016 Q1: composer-side, at-most-one, 0.70 constant, recalibrated vs attentionPrecision | **Ruled** |
| Agent execution later; audit/attribution/bounded-retry; tasks before dispatch | Dispatch alignment (analysis/19, DEC-018): actor seam, mission queues reserved, D4 doctrine | **Adopted** |

## 2. Detail deltas — enrich the S5/S6/S7 prompts (no architecture change)

- **Δ1 · source_type enum additions (S5):** synthesis F4 adds `app, sheet, slide, chat`
  to our list (and its `email` = our `mail`). Additive TEXT-enum values; joins A-3's
  reserved `mission`.
- **Δ2 · work_item archival:** synthesis lists "archived" in the status vocabulary; our
  state machine covers it with `dismissed` + trash at v1, full archival = its F27 (V2).
  No v1 change; V2 register entry (archival as flag, not state).
- **Δ3 · loose-thought DECAY (S5):** expire-unless-referenced/promoted; never authoritative
  memory. v1-simple proposal: a sweep transitions stale `loose_thought` items →
  `dismissed` with `reason_code='decayed'` after N days (constant, default 14) unless
  touched; promotion = reclassify (exists). Memory-exclusion is inherent (work_items are
  not brain memory). Needs a one-word operator OK in the S5 pass (it is behavior).
- **Δ4 · acknowledgment one-tap (S6):** the ack card's single-tap
  received/understood/accepted → `acknowledged` + closed-loop notify.
- **Δ5 · scheduling = tentative holds only (S5):** never hard-book; ride the EXISTING
  schedule-event proposal card flow (approval-gated) — no new calendar machinery
  (DEC-009 engine stays). `scheduling` items link the resulting block via source_ref.
- **Δ6 · sender-side details (S5):** cleanup strictly opt-in + preview before send;
  preserve priority phrases ("no rush"); stakeholder suggestion from desk context;
  existing-artifact check before routing (early-V2 per the synthesis's own map — v1
  does the cheap version: search-first prompt discipline, already house pattern).
- **Δ7 · multi-intent inputs (S5):** primary intent routes; secondary intents surface as
  ADDITIONAL suggested cards (the chat proposal-cards pattern already does multi-action)
  — matches the synthesis's "unresolved, keep simple" posture.
- **Δ8 · FYI routing (S5/S6):** fyi items with durable value ALSO offer
  create-knowledge-entry (exists); FYI has no dedicated widget (synthesis: optional;
  DEC-016 set stands) — fyi items live in WorkItemsView lenses.
- **Δ9 · "what do I need to do today?" (S6/S7):** conversational entry — a gated
  work-items context block in chat prompt assembly + the hard rule that answers derive
  from queue DATA, never narration. Small, additive; the S0 vocabulary module carries
  the definitions.
- **Δ10 · suppression learning (S7):** repeated dismissals quiet the SOURCE TYPE, not
  just the item — v1-simple per-source-type dismissal counter gating suggestions.
- **Δ11 · deadline backstop (S7/V2):** quiet pre-deadline check on items with date-like
  language even if filed FYI — v1 covers actionable classes; FYI-backstop → V2 register.
- **Δ12 · scenario runner (S5 verify):** the synthesis's deterministic demo (mixed-intent
  review, opt-in cleanup, unrouted banter, scheduling hold, receiver reclassification,
  voice split) — adopt as S5's six named end-to-end TESTS + a live demo script.
- **Δ13 · voice capture (S5):** voice notes route through the classifier — the S0 parser
  arm already reserves this; S5 wires the classifier into the voice pipeline.

## 3. Out of our build's scope — ownership named (register, don't build)

| Item | Ownership / where it lands |
|---|---|
| F20 creation engines; engine gallery | Parallel product layer (synthesis's own words) — Caleb/product |
| F21 MCP connectors | V2 platform work. ONE contract line joins the A-6/D4 doctrine: **external MCP writes must route through the workItems module** — never a bypass |
| F22 in-app browser + agent browsing | A6 — built by Caleb; Dispatch alignment covers the rest |
| F24 guided discovery + live rendering | Caleb's discoveryMode is its seed; V2 |
| F25 people/org/trust readiness (the multi-country-org deal) | Caleb + paperwork. **Risk note:** the aggressive timeline pressures the fleet-migration preconditions (R015/R016, §2.6 P1 checklist) — an org rollout must not flip the exposure switch before every member's app carries the S1 migration. Registered |
| F11 living project table; F8 invisible tasks (full); F10 desk meta-brain; F19 anomaly detection | V2 per the synthesis's own Keep/defer map — our S7 intelligence-light is deliberately the MVP-light subset |
| Local inference economics; Plexi Box; spatial surfaces | Think-tank / platform — the 2.7 mental-model constraint is already satisfied (few queues, honest counts, one "what's on me") |
| Org knowledge center | Caleb / retrieval platform |
| Native mail ingestion | V3 |

## 4. Synthesis-open questions ALREADY RESOLVED here (we are ahead)

1. **"Are desks tasks / do plans need to exist / schema upstream question"** → resolved
   by DEC-007 (work_item = separate node kind, CHECK widened — proven live in S1),
   DEC-010 (plans untouched v1), DEC-011 (vocabulary forever). The synthesis's "AI-
   generated views over desks" option is exactly what Attention lenses are.
2. **System-notification placement** → DEC-016 Q7: System queue inside Attention,
   own widget, origin-tagged, excluded from headline count.
3. **Dashboard placement** → its own F23 narrowing = our shipped/approved answer.
4. **Clarification threshold** → DEC-016 Q1, parameters locked.
5. **Archive/delete four-option question** → DEC-013's memory-choice contract + the
   lifecycle track (L1 building now; D1/D2 rulings still open for L2).

## 5. Conflicts

**None found against v2.3 or built code.** The nearest candidates dissolve on inspection:
the "questions" route (synthesis itself merges into tasks), FYI/ack queues (synthesis
marks optional; DEC-016 stands), work_item "archived" status (Δ2, V2), and the data-model
ambiguity (§4.1 — resolved by DEC, in the direction the synthesis's own best-synthesis
suggested).

## 6. Process note

The prompts for S5–S7 are authored HERE, in-session, against v2.3 + this intake + the
as-built code — per the operator's ruling last turn. A separate "master prompt" is the
wrong tool for this session: the gates exist so no prompt ever invents architecture.
**Waiting on: part 2 (the current-landscape map). On its arrival: cross-check drift
(C-4), then enrich S5/S6/S7 prompts and resume the autopilot.**
