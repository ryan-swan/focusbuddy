# Intake Verification — Round 2

Verifies the spec-session's three new catches (2026-08-24 night) against the repo, and
captures the operator's Q5 direction (→ DEC-013). Confidence: 0.90 · why_not_higher:
Flow-definition persistence inferred from `PlexiFlowView`'s ACTION_TYPES + the flows module's
existence; the exact storage table read pending (Phase 2 confirms).

## Verdict 1 — `status` column collision at SPEC-002: CONFIRMED, favorable shape

- `nodes.status` is `TEXT NOT NULL DEFAULT 'open'` (`database.ts:36`) — **no CHECK
  constraint**. The DB accepts any string; the collision is at the TypeScript union
  (`TaskStatus`) and consumer level: ~53 renderer sites compare against
  `open|in_progress|done|parked`.
- **Recommendation for SPEC-002 (Phase 4 decides):** work_items keep `status` as a COARSE
  LEGACY PROJECTION — always one of the four desk values, mechanically mapped from the fine
  state — and carry the §1.5 state machine in a new `work_item_state` column.
  Result: all ~53 legacy consumers read a sane value untouched; `TaskStatus` never widens;
  no discriminator overload. The mapping table (fine → coarse) is part of SPEC-002.
- Rejected shapes: widening `TaskStatus` (touches every consumer for zero desk benefit —
  preservation violation); overloading with a discriminator (two meanings in one column is
  the `taskId` mistake again).

## Verdict 2 — `create-task` persisted as data: CONFIRMED, and bigger than a rename+alias

The action vocabulary is a **cross-app protocol, not an AI-layer detail**:
- `PlexiFlowView.tsx:34` — `create-task` is a `FlowActionType` in user-authored Flow
  definitions (persisted automations). Renaming breaks saved Flows.
- Also consumed by `stores/wrapup.ts:125`, `ProposalPreview.tsx:198`, `MessagesView.tsx:1468`
  (pulse → create-task), `MindMapWidget.tsx:2483`, `PlexiMeetView.tsx:26`.
- Persistence surfaces to audit: flow definitions, `agent_invocations`, `agent_outcomes`,
  `wire_runs` (`database.ts:451,771,793`).

**Revised SPEC-044 approach (recommendation):** do NOT rename `create-task`. Extend the
quarantine to the action vocabulary: `create-task` permanently means *create a desk* at the
protocol level. The audit's jobs become: (1) every prompt that mentions `create-task` gains
an explicit definition ("creates a desk — a workspace — never a to-do"); (2) the new action
gets an unmistakably distinct name (`create-work-item`) with its own definition; (3) human-
facing LABELS (ProposalPreview, Flow editor) say "Create desk," fixing the user-visible
mislabeling from BUG-C1-05 without touching the wire format; (4) persisted-data compat is
then a non-issue by construction. Cheaper and safer than rename+alias; per-occurrence audit
still runs in Phase 2.

## Verdict 3 — CR-02 "archived view" dependency: DEFUSED

`dashboard/Dashboard.tsx` (the orphaned portlet engine) contains **zero** `archived`
references — the feared live schema dependency does not exist. The `archived` flag's real
consumers are live surfaces (`DeskGallery`, `CanvasLinearView`, `WorkspaceHeader`,
`CommandCenter` palette, `NewNodeDialog`…). The types comment's phrase "the dashboard's
archived view" appears to reference a live surface or is mildly stale. CR-02's deprecation
recommendation stands un-complicated — and the existing live `archived` consumers further
shrink the lifecycle prerequisite (archive UI partially exists; the work is exposure +
semantics, not creation).

## Endorsed additions from the session's response (no repo check needed)

- **C1-03's "boring" branch is the scary one:** if triage shows a metadata-stamping failure
  on sync arrival, that is precedent for routed work_items landing without routing fields.
  **Phase 2's sync proof formally splits: (a) server passes new columns/kinds opaquely;
  (b) client stamps and preserves them on arrival. They fail independently.**
- **IQ-1 holds the register open** — the register cannot claim completeness over the bug set
  until sections 7/8/13/14/17 are seen or confirmed trimmed.

## Operator's Q5 direction (captured → DEC-013)

Verbatim intent (2026-08-24 night): Michael holds desks shouldn't be deleted (memory value).
Operator: archive is definitely needed for visual cleanup; deletion should offer a choice —
"preserve its information in your memory, or delete all information permanently" — and that
choice may apply to personal desks only; shared desks either require all participants to
approve deletion or cannot be deleted.

Repo alignment (verified): `archived` flag + live consumers exist (archive = expose, not
build); `trashed_at` soft-delete + `nodes:restore` exist (trash ≠ memory purge — the two are
already separable); `PERSONAL_ORG_ID` exists (personal-vs-shared scoping is expressible);
`trashNode` currently has **zero shared-awareness** — the shared-desk guard must be built,
and it also neutralizes the trashNode/CASCADE danger (SPEC-043) for the shared case.
Memory-purge ("delete permanently") is genuinely new machinery in the brain layer
(supersede-not-delete exists; purge does not).
