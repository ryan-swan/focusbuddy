# Attention Layer — Technical Architecture (Phase 3)

**Status:** DRAFT pending G3 (logic audit + risk war-game + gate).
**Scope:** the P0 foundation and surfaces (SPEC-001–024 core) designed fully; P1
(SPEC-025–033) designed to non-foreclosure; P2 designed-around.
**Consumes:** SPEC-001+A1 (analysis/00+13) · gap matrix w/ G2 verdict (02) · consumer
classification (10) · vocab audit (11) · sync proofs (12, GAP-014) · ACL semantics (14) ·
sync reliability (15) · Q1/Q7 rulings (16, DEC-016) · DEC-007..016 · GAP-011..016.
Baseline `a92b30cb` · branch `ryan-command-center`.

---

## §1 · Overview and governing constraints

One new entity (`work_item`, a node kind), one new main-process subsystem (notifications),
one new renderer surface family (Attention queues on the Home registry), and a capture
pipeline — all riding existing rails: the nodes table and its three-scope sync, the standup
AI pattern, the Home widget registry, the ⌘K palette, the design system.

Non-negotiables inherited into every section: **reference-not-own** (Attention reads;
desks/rooms own) · **the quarantines** (`task`=desk; `create-task`=create-desk on the wire;
`CommandCenter`=palette) · **A-02** (`work_item_state` authoritative; `status` derived) ·
**A-01** (protocol quarantine; new action is `create-work-item`) · **migration leads
sync exposure** (GAP-013) · **no fourth dashboard** · design law per DESIGN-FIDELITY.

## §2 · Data model

### 2.1 The migration — `migrateNodesKindCheckV2`

Reuses the harvested schema-derived rebuild (DDL, columns, indexes from the live schema;
FK off → transaction → rename → FK on) with a **new guard and a wider target**:

```
Guard:   proceed only if nodes DDL does NOT contain 'work_item'
Target:  CHECK (kind IN ('folder','task','task-item','work_item'))
```

- Handles BOTH verified starting states (GAP-014): factory-narrow `('folder','task')` and
  legacy-widened `('folder','task','task-item')`.
- `'task-item'` stays in the CHECK deliberately: at least one real DB holds legacy rows;
  the TS union does NOT include it (CR-05(a): the dead declaration is deleted), so no new
  task-items can be created — existing rows are inert residue.
- Registered in `getDb()` beside `migrateShareKindChecks`; exported behind the same
  minimal `KindCheckDb` interface for `node:sqlite` tests.
- **Test fixtures (pinned):** (1) factory-narrow legacy DB with accreted ensureColumns —
  the harvest's fixture, extended to assert `work_item` admitted; (2) **legacy-widened DB**
  (task-item present, quoted-"nodes" DDL) — asserts the V2 guard fires where the harvest
  guard would return early; both assert data preservation, index recreation, idempotency.
- **Rollout ordering (GAP-013):** the migration is a Phase-6 Stage-1 artifact and must be
  running on a peer before any work_item can REACH that peer. Enforcement: work_item
  creation is capability-gated (`workItems.enabled`) and P0 creation is personal-scope
  (self-routing) — org/shared exposure is a P1 switch flipped only after org peers are
  confirmed on a migrated build. The apply-site's swallowed catch additionally gains an
  explicit unknown-kind branch (log + park, not silent) as a defensive diff — small,
  isolated, and flagged to Caleb since it touches his subsystem.

### 2.2 work_item columns on `nodes` (replicating core — SPEC-002)

All added via `ensureColumn` (nullable TEXT unless noted), riding sync by construction
(analysis/12) once also added to the CRDT allowlists (§3):

| Column | Type/values | Notes |
|---|---|---|
| `work_item_state` | the §1.5 machine: non-terminal `open in_progress waiting needs_review needs_approval delegated blocked suggested stale` · terminal `acknowledged answered scheduled delivered reviewed completed discussed dismissed reclassified` | **Single source of truth** (A-02) |
| `status` *(existing)* | derived projection, computed at write | Mapping table §2.3; never independently written for work_items |
| `intent_class` | `action review scheduling fyi acknowledgment discussion loose_thought direct` | §1.4; expansion requires a DEC |
| `originator_id` / `recipient_id` | account ids | **Distinct from `nodes.assignee` by decision (GAP-016):** `assignee` remains Plan-domain (projectPlan reads it); work_items never read or write it. Routing identity is `recipient_id`, full stop. |
| `due_at` | ISO-8601 string | Collision-proof vs numeric desk `due_date` (the legacy branch's own lesson) |
| `wi_urgency` | `high medium low` | Separate from the 1–5 priority axes |
| `source_ref` / `source_type` | id + `desk room doc message mail file selection browser calendar note widget` | Click-through target; resolution failure renders "source no longer exists" (mentionResolver pattern) — orphan-graceful by design |
| `confidence` | 0–1 REAL | AI-created items only |
| `approval_state` | `auto approved suggested dismissed merged` | SPEC-025 substrate, present from birth |
| `reason_code` | machine token behind the one plain-language reason | SPEC-018; the renderer renders reasons from codes+signals, never stores prose |
| `wi_origin` | `human ai system` | DEC-016 Q7: system events tagged, never a new intent class |

`team_id` is set from routing context when originator+recipient share a team (14 §4).

### 2.3 The status projection (published mapping — A-02)

| `work_item_state` | projects to `status` |
|---|---|
| open, suggested, stale, waiting, blocked | `open` |
| in_progress, delegated, needs_review, needs_approval | `in_progress` |
| acknowledged, answered, scheduled, delivered, reviewed, completed, discussed | `done` |
| dismissed, reclassified | `parked` — **never `done`** |

Computed inside `createWorkItem`/`updateWorkItemState` in main (one code path); unit-pinned
including the never-done rule; `status` writes for `kind='work_item'` outside that path are
rejected at the db module.

### 2.4 Satellite local tables (non-replicating — SPEC-003)

`wi_local` (org-scoped: item_id PK, snooze_until, read_at, local_flags) and
`wi_deliveries` (delivery receipts + dedupe keys for §5). Never on the sync whitelist;
never in bodies.

### 2.5 Reference integrity & lifecycle interaction (A-03/SPEC-043 + DEC-013)

- **`trashNode` becomes kind-aware:** the recursive sweep excludes `kind='work_item'`
  children; a work_item survives its desk's trashing with `source_ref` intact and renders
  the orphan-graceful state on resolution failure. (Travel-with-desk was rejected: routed
  items must not vanish on a sender's cleanup — the verified silent-loss chain, 10 §3.1.)
- The 7-day purge and hard-delete paths inherit the same exclusion; `moveNodeToOrg`'s
  sweep carries work_items deliberately (they follow their spatial parent's org).
- **Shared-desk guard (DEC-013, external lifecycle track):** unilateral trash of a
  shared-root desk is blocked ahead of these paths; the guard is the shared-case answer.
- **Plan write guards (G2 find):** `addDependency` endpoints and `patchPlanTask` assert
  `kind='task'` — fb_task_deps can never accrete work_item edges (SPEC-041 read-safety
  becomes read+write-safety).
- Work_items under a desk that becomes ACL-shared **inherit the share** (stamp sweeps
  them — spatial semantics; stated in UI). Personal routing therefore parents to personal
  desks/rooms or floats parentless (top-level work_items are excluded from desk-count
  gating, which keys on kind).

## §3 · Sync & replication contract

- **Allowlists (GAP-015):** every §2.2 column joins `NODE_ATTR_KEYS` and the
  `emitNodeCreate` snapshot. Stage test is adversarial and live: a work_item created on
  device A must arrive on device B **via the CRDT path with routing fields populated**
  (poll disabled during the assertion window to prove the live path alone).
- **Scopes:** P0 = personal (self-routing; second-device tail up to 20s on the poll —
  accepted at P0, noted in UX copy; the live path covers the active device). P1 = org/team
  (scope-carried + client-filtered `recipient_id`) and shared-desk ACL — behind the
  capability switch until GAP-013 rollout clears.
- **Stated contracts:** visibility ("routed within your team — members of the carrying
  scope can see it") and write-permission (view-tier grantees: acknowledgment/reclassify
  writes are the receiver's right — these are receiver-owned columns; the server refuses
  what it refuses; the client never pretends a blocked write succeeded — status surfaced,
  not swallowed).
- **P1 latency precondition** (15 §6): the coalescing re-arm lands (ours or Caleb's)
  before SPEC-029 acceptance; acknowledgment UX budgets ≤ one cycle, not 20s.

## §4 · IPC, preload, store

- **`listNodes` gains the kind exclusion** (the classification's highest-leverage fix):
  desk-shaped consumers never see work_items; `workItems:list` is its own query (filters,
  lenses, counts server…main-side). The remaining must-touch sites from analysis/10 §2.1/2.2
  are dispositioned in the same stage as the migration (SPEC-004 gate condition), each a
  reviewable one-line diff per the classification's minimal-change column.
- **Namespace `workItems:`** — `list(query) get(id) create(draft) updateFields(id,patch)
  setState(id, work_item_state) reclassify(id, intent_class) snooze(id, until)
  markRead(id) counts()`. Preload namespace `api.workItems` with hand-written inline types
  (house style); `export type` flows to the renderer.
- **`useWorkItemStore`** (zustand): mirrors the nodes-store shape; subscribes to sync
  refresh (the shared-refresh widening from 15 §6 #5 joins the P1 stage; P0 personal scope
  refreshes on the existing personal pull path + local writes).
- **Creation seam:** the `fb:command-new-task` event pattern gets a sibling
  `fb:command-new-work-item` (10 §7.3); palette + capture console dispatch it.

## §5 · Notification substrate (SPEC-006, CR-03(a))

- **Table `wi_notifications`** (org-scoped): id, ref (work_item/desk/system), queue, title,
  body, deliver_at, delivered_at, dedupe_key, wi_origin, critical INTEGER.
- **Main-process scheduler:** on app start + every 30s, deliver due undelivered rows
  (dedupe by key); delivery = Electron **native `Notification`** (first production use) +
  renderer event for in-app surfaces. Restart-survival is intrinsic (rows persist);
  the stage's adversarial test schedules → quits → relaunches → asserts single delivery.
- **Re-pointing:** `lib/notify.ts` becomes a thin client of a `notifications:post` IPC;
  the seven existing renderer callers (11 §b list) migrate mechanically; `blockReminders`
  retires in favor of scheduler rows; the decoy module deletes with its spec-conformance
  logic ported into the substrate's tests (PLX-UX-043/044/045 assertions preserved).
- **Badge model:** per-queue counts; headline count per DEC-016 excludes `wi_origin='system'`.

## §6 · Surfaces

- **SPEC-014 widgets** — seven defs in `homeWidgetDefs` (Tasks, Reviews, Calendar,
  Awaiting Ack, Completed, Stale Desks, **System**), composed from the plexi primitive kit
  (RailCard/StatusPill/ListRow), tokens-only, four-theme verified. Stale Desks reads the
  lifecycle track's derived stale (external dependency; renders gracefully-empty until it
  lands).
- **SPEC-015** top-bar count: counts only, system-excluded, `.fb-tabular`.
- **SPEC-017 WorkItemsView** — new view registered through all seams (view union, MainPane,
  Sidebar rail+expanded, segment); saved lenses as named queries over `workItems:list`;
  AllTasksView renamed **"All Desks"** in the same stage (CR-04(b)) with its search/copy
  updated from the 11 §e worklist.
- **SPEC-020 palette actions**: create work_item, triage next, jump-to-source, "what's on
  me" — registered in CommandCenter alongside its Class-B/C guards (same file, same stage).
- **Capture console (SPEC-007–013):** assistant-anchored composer with Routed (default) /
  Unrouted (verbatim) / Expand (existing promotion path); classifier per the standup split —
  pure composer (deterministic parse: @mentions via mentionResolver, date parse, explicit
  class markers) → orchestrator → AI weave (new `AIPurpose: 'intent-classify'`), fallback =
  `direct` unrouted with zero fabrication; **Q1 rule (DEC-016) implemented in the composer,
  not the model** — the two trigger conditions are code, the model only supplies the
  confidence input. SPEC-010 rewrite is propose-and-approve via the existing
  proposal-preview pattern. **The whole capture stage is gated on the SPEC-044 stage**
  (prompt quarantine definitions + `create-work-item` action + label fixes, incl. the two
  G2-found surfaces: Flow executor arm and apiServer).
- **SPEC-018/019:** `reason_code` + signal values → one rendered reason; ranker v1 =
  deadline proximity, staleness, explicit-human-ask, scored against `attentionPrecision()`.

## §7 · Stage decomposition (build order + verify-commands)

Every stage: pre-flight → build → `npm run typecheck` + `npm run test:unit` green →
adversarial tests → rubric (native-fit six-point check) → live HMR verification → close.
RESHAPE/FOUNDATIONAL stages add the regression guard (suites + adjacent-surface smoke).

| Stage | Contents | Key verify |
|---|---|---|
| **S0** | SPEC-044 execution: prompt definitions for `create-task`/`create-todo-list`, reserve `create-work-item` (defined, parsed, gated, labeled), human-label fixes (11 §e worklist + Flow/apiServer arms) | grep-assertions that every catalog mention carries a definition; label snapshot tests; saved-Flow compatibility test (wire name unchanged) |
| **S1** | `migrateNodesKindCheckV2` + ALL 44+2 consumer dispositions (incl. trashNode policy, plan write guards, `listNodes` exclusion, palette/tree/breadcrumb/gallery guards) + CR-05 dead-type deletion | two-fixture migration test; live app smoke w/ seeded work_item across the §3.1 blast-radius surfaces; **post-migration live kind test closes the last A-003 residual formally** |
| **S2** | §2.2 columns + §2.3 projection + §2.4 satellites + **CRDT allowlist additions** | projection unit pins (never-done rule); GAP-015 adversarial live-path arrival test; sync round-trip w/ routing fields |
| **S3** | `workItems:*` IPC + preload + store + creation seam | typecheck; namespace unit tests; palette create smoke |
| **S4** | Notification substrate + re-pointing + decoy retirement | restart-survival adversarial; dedupe adversarial; PLX-UX ports green; native Notification observed |
| **S5** | Capture console + classifier + Q1 rule + self-routing loop closure | Q1 rule table-driven tests; classifier fallback (no-key) tests; end-to-end: capture → item → terminal state → notification |
| **S6** | Surfaces: widgets ×7, count, WorkItemsView + lenses, AllDesks rename, palette actions, reasons+ranker | four-theme live verification; native-fit rubric; `attentionPrecision` wiring asserted |
| **S7** | Intelligence-light (022 feeder, 023 commitments, 024 narrow nudges) + full regression guard + G6 | feeder one-directionality test; nudge restraint fixture ("no activity 7d AND deadline" only); whole-suite + typecheck + e2e-relevant + live pass across reused surfaces |

Cross-stage rules: S1 blocks S2 (gate condition); S0 blocks S5's classifier; S4 blocks
S5's closure + S7's nudges; the lifecycle prerequisite (external track) blocks S6's Stale
Desks *content* and S7's stale signal but not their scaffolds. Per-stage build prompts are
authored at G3 close, one per stage, against this document.

## §8 · Failure modes & mitigations (top set)

| Risk | Mitigation |
|---|---|
| Migration meets an unanticipated third DDL shape | Guard keys on absence-of-work_item (not presence of anything); rebuild derives from live schema; fixture matrix extensible; backup-before-migrate in the stage runbook |
| A missed Class-B/C consumer leaks phantom work_items | S1 ships classification-complete + live blast-radius smoke; adversarial reviewer re-runs the census greps post-S1 expecting zero new sites |
| Allowlist drift (future columns) | S2 adds a unit test asserting parity between the SPEC-002 column manifest and both allowlists — future drift fails CI |
| Notification duplicates / storms | dedupe_key unique index; per-queue rate caps; restraint defaults (S7 fixture) |
| Un-migrated org peer meets a work_item | Capability switch holds org/shared exposure until P1 rollout check; apply-site defensive branch (flagged to Caleb) |
| Two person-fields drift (`assignee` vs `recipient_id`) | Documented non-use + a lint-grep in CI: `assignee` never referenced in workItems modules |
| `status` written directly on a work_item | db-module rejection + unit pin |
