# Attention Layer — Technical Architecture (v2)

**Status:** DRAFT v2 — repairs all 14 findings of the 2026-08-25 logic audit (G3 REJECT on
v1; both CRITICALs closed below). Pending re-gate: fresh logic audit + **independent second
validation of §2/§3** (PRESERVATION-DOCTRINE law 3 dual validation) + risk war-game
integration + the G4 acid test.
**Phase numbering note (audit F011):** ROADMAP.md's numbering governs. This document serves
ROADMAP Phases 3+4 combined (strategy + technical architecture) — so BOTH G3 and G4
obligations apply to it: logic audit, dual validation of FOUNDATIONAL sections, acid test.
Build stages S0–S7 are ROADMAP Phase 6. DEC-015's phase labels read against this mapping.
**Scope:** P0 foundation + surfaces designed fully; P1 designed to non-foreclosure; P2
designed-around.
**Consumes:** SPEC-001+A1 · gap matrix w/ G2 verdict (02) · 10 · 11 · 12 · 14 · 15 · 16 ·
DEC-007..016 · GAP-011..016 · logic-audit findings F001–F014. Baseline `a92b30cb`.

---

## §1 · Overview and governing constraints

One new entity (`work_item`, a node kind), one new main-process subsystem (notifications),
one new renderer surface family (Attention queues on the Home registry), and a capture
pipeline — riding existing rails: the nodes table and its three-scope sync, the standup AI
pattern, the Home widget registry, the ⌘K palette, the design system.

Non-negotiables inherited into every section: **reference-not-own** · the **quarantines**
(`task`=desk; `create-task`=create-desk on the wire; `CommandCenter`=palette) · **A-02**
(`work_item_state` authoritative; `status` derived) · **A-01** (new action =
`create-work-item`) · **the scope invariant** (§2.6 — replaces v1's creation-only gate) ·
**no fourth dashboard** · design law per DESIGN-FIDELITY.

**Vocabulary addition (F006):** "stale" is three different things and is never used bare:
- `work_item_state='stale'` — **item-level**, derived from the work_item's own inactivity
  (`updated_at`), no external dependency.
- the ranker's **staleness signal** — the same item-level inactivity. No external dependency.
- **`desk_stale`** — desk-level, derived by the lifecycle track (SPEC-042, external). Only
  the Stale Desks widget's *content* consumes it.

## §2 · Data model

### 2.1 The migration — `migrateNodesKindCheckV2` (F003/F014/F002 repairs applied)

Schema-derived rebuild (DDL, columns, indexes from live schema; FK off → txn → rename →
FK on), with:

- **Guard predicate, pinned exactly:** proceed only if the **quoted literal `'work_item'`
  is absent from the `CHECK (kind IN (…))` clause** of the nodes DDL — matched within the
  extracted CHECK clause, never by whole-DDL substring (the `work_item_state` column name
  would otherwise poison a naive substring test once S2 lands).
- **Target:** `CHECK (kind IN ('folder','task','task-item','work_item'))` — handles both
  verified starting states (GAP-014); `'task-item'` tolerated for legacy rows; the TS union
  carries only `work_item` (CR-05(a)).
- **Registration order, pinned:** the migration runs in `getDb()` **before** any work_item
  `ensureColumn` call (constraint stated here so the S2 prompt cannot reorder it).
- **The base `SCHEMA` constant is widened in the same stage (F014)** — fresh installs are
  born wide; the migration exists for pre-existing DBs and is a no-op after.
- **Test fixtures (pinned, three):** (1) factory-narrow legacy DB w/ accreted columns;
  (2) legacy-widened DB (task-item present, quoted-"nodes" DDL) — asserts the V2 guard
  fires where the harvest guard returns early; (3) **narrow-CHECK DB that already has
  `work_item_state` columns** — asserts the pinned predicate still fires (F003). All
  assert data preservation, index recreation, idempotency.
- **Receiver defensiveness (adopting analysis/15 blocker #3; F002 repair):** the sync
  apply site gains TWO explicit branches replacing silence: an **unknown-kind** branch
  (CHECK rejection → park the item + surface a sync-status warning, no infinite silent
  retry) and an **unknown-column** branch (item body carries `work_item_state` but the
  local table lacks the column → park + surface, instead of silently blanking routing
  fields). Small isolated diffs in Caleb's subsystem — built as their own commit and
  flagged to him like the wake fix.

### 2.2 work_item columns on `nodes` (replicating core — SPEC-002)

All via `ensureColumn` (nullable TEXT unless noted); replicate by construction (12) once
added to the CRDT allowlists AND emitted (§3):

| Column | Type/values | Notes |
|---|---|---|
| `work_item_state` | non-terminal `open in_progress waiting needs_review needs_approval delegated blocked suggested stale` · terminal `acknowledged answered scheduled delivered reviewed completed discussed dismissed reclassified` | **Single source of truth** (A-02). `stale` here = item-level (§1 vocabulary) |
| `status` *(existing)* | derived projection, computed at write **and recomputed at sync apply** (F012) | Mapping §2.3 |
| `intent_class` | `action review scheduling fyi acknowledgment discussion loose_thought direct` | §1.4; expansion requires a DEC |
| `originator_id` / `recipient_id` | account ids | Distinct from `nodes.assignee` (GAP-016): `assignee` stays Plan-domain; work_items never read/write it (CI lint-grep enforces) |
| `due_at` | ISO-8601 string | collision-proof vs numeric desk `due_date` |
| `wi_urgency` | `high medium low` | separate from 1–5 priority axes |
| `source_ref` / `source_type` | id + `desk room doc message mail file selection browser calendar note widget` | click-through target; **also preserves the former parent desk after an F001 detach**; resolution failure renders orphan-graceful ("source no longer exists") |
| `confidence` | 0–1 REAL | AI-created items |
| `approval_state` | `auto approved suggested dismissed merged` | SPEC-025 substrate from birth |
| `reason_code` | machine token behind the one rendered reason | SPEC-018 |
| `wi_origin` | `human ai system` | DEC-016 Q7 |

`team_id` set from routing context when originator+recipient share a team (14 §4).

### 2.3 The status projection (published mapping — A-02; F008/F012/F013 repairs)

| `work_item_state` | → `status` |
|---|---|
| open, suggested, stale, waiting, blocked | `open` |
| in_progress, delegated, needs_review, needs_approval | `in_progress` |
| acknowledged, answered, scheduled, delivered, reviewed, completed, discussed | `done` |
| dismissed, reclassified | `parked` — **never `done`** |

- **Code home (F008):** `createWorkItem` / `updateWorkItemState` are **S2 db-module
  artifacts** (main, one code path); S3's IPC wraps them. `status` writes for
  `kind='work_item'` outside that path are rejected at the db module.
- **Sync apply recomputes (F012):** for applied rows with `kind='work_item'`, `status` is
  recomputed locally from `work_item_state` — cross-version mapping drift cannot produce
  divergent projections.
- **Semantics annotation (F013):** the coarse `open` bucket is a **legacy-compatibility
  value only, never a "needs me" signal** — waiting/blocked project there but do not need
  the person; every Attention count and badge derives from `work_item_state` exclusively.

### 2.4 Satellite local tables (SPEC-003)

`wi_local` (item_id PK, snooze_until, read_at, local_flags) and `wi_deliveries` (receipts +
dedupe). Org-scoped; never synced; never in bodies.

### 2.5 Reference integrity & lifecycle interaction (F001 repair — detach, don't just skip)

The FK is `parent_id … ON DELETE CASCADE` and `purgeTrashedNodes` deletes parent rows
directly — SQLite performs child removal, and **a cascade cannot be kind-filtered**. A
skip-only exclusion would therefore hide the work_item from trash/undo and still lose it at
day 7. The repair severs the link at exclusion time:

1. **`deleteNode` (trash path):** on encountering a `work_item` child, do NOT sweep it —
   **detach it**: `parent_id = NULL` (the former desk survives in `source_ref`, which the
   orphan-graceful rendering already consumes). The item lives, visibly, in its queues.
2. **Belt-and-braces at every hard-delete:** `purgeTrashedNodes` and `agentHistory`'s
   ref-parse delete run the same detach for any `work_item` children of the target row
   before deleting it — no path reaches the cascade with attached work_items.
3. **The S1 adversarial test (mandatory):** desk + work_item child → trash desk → clock
   past 7 days → `purgeTrashedNodes` → **work_item still exists, orphan-graceful, in its
   queues**. (The two migration fixtures cannot catch this; this test is separate.)
4. `moveNodeToOrg` still carries work_items with their spatial parent — now **guarded by
   the scope invariant (§2.6)**.
5. **Shared-desk guard (DEC-013, lifecycle track):** unilateral trash of a shared-root desk
   refused ahead of all of this.
6. **Plan write guards (G2):** `addDependency` endpoints and `patchPlanTask` assert
   `kind='task'`.
7. **Retroactive share exposure (F005):** when a desk becomes ACL-shared, **self-routed
   work_items (`recipient_id = originator_id`) are exempted from the stamp sweep** — a
   personal reminder never fans out because its desk got shared; and the share flow
   **surfaces the count** of work_items about to be swept ("3 work items on this desk will
   be shared") for confirmation. Routed items (recipient ≠ originator) follow their desk —
   spatial semantics, stated in UI.

### 2.6 The scope invariant (F002 repair — replaces v1's creation-only gate)

**Invariant: a `work_item` row may not ENTER a sync scope whose peers are not confirmed
migrated.** Enforced at every scope-crossing site, not at creation:

| Crossing | Guard while the P1 exposure switch is OFF |
|---|---|
| Creation | capability-gated (`workItems.enabled`), personal scope only |
| `moveNodeToOrg` sweep | **refuses to carry `kind='work_item'`** — parks the item (detach + log + user-visible note), desk moves without it |
| `stampSharedDesk` + propagation | same refusal (self-routed items additionally exempt forever, §2.5.7) |
| `collectDeskSubtree` (shared push) | kind-guard per its Class-C disposition — cannot collect work_items while OFF |
| **Own second device** | the apply-site defensive branches (§2.1) turn the un-migrated-peer failure from silent swallow into parked-with-warning; the P0 release notes state both devices must update. This is detection + containment — full prevention requires the server-side version gate we cannot build from the fork, explicitly accepted as residual risk in §8 |

The P1 switch flips per-org only after a migrated-peer confirmation step (P1 rollout
checklist: all org members' app versions ≥ the migration release — verified via the org
presence/version surface if available, else operator attestation for the two-person org).

## §3 · Sync & replication contract (F004/F010 repairs)

- **Allowlists + EMITTERS (GAP-015 + F004):** every §2.2 column joins `NODE_ATTR_KEYS` and
  the `emitNodeCreate` snapshot — **and `useWorkItemStore` is specified as the producer**:
  `create` calls `crdtEmitNodeCreate`; `updateFields`/`setState`/`reclassify` emit the
  corresponding attr events (work_items never pass through `useNodeStore`, which excludes
  them, so the emit lives in the work-item store by construction). S2's adversarial test
  asserts BOTH that the emit fires and that a live-path arrival carries routing fields
  (poll disabled during the assertion window).
- **The 409-loop fix is adopted as an S2 precondition (analysis/15 blocker #4; F010):** on
  conflict-apply-no-op, force `sync_rev = serverRev` so baseRev advances — without it a
  routed item that 409s is permanently unroutable with no signal **at P0** (personal
  two-device). Small isolated diff; same Caleb-flag treatment as §2.1's branches.
- **Scopes:** P0 personal (self-routing; second-device tail ≤20s on the poll — accepted,
  stated in UX copy); P1 org/team + shared behind the §2.6 switch.
- **Stated contracts:** visibility ("routed within your team — scope members can see it")
  and write-permission (receiver-owned columns: acknowledgment/reclassify are the
  receiver's right; server refusals surface, never swallowed).
- **Latency precondition (one of five — the others are §2.1 branches, §3 allowlists+409,
  §4 refresh, S1 consumer sites):** the wake-coalescing fix (SHIPPED 2026-08-25:
  `fix/sync-wake-coalescing`, cherry-picked at `4470e2cd`) — SPEC-029 acceptance budgets
  ≤ one cycle.

## §4 · IPC, preload, store

- **`listNodes` gains the kind exclusion** (highest-leverage single fix); `workItems:list`
  is its own query. Remaining must-touch sites dispositioned in S1 per the classification's
  minimal-change column (gate condition).
- **Namespace `workItems:`** — `list(query) get(id) create(draft) updateFields(id,patch)
  setState(id,state) reclassify(id,intentClass) snooze(id,until) markRead(id) counts()`;
  preload `api.workItems` typed inline; S3 wraps the S2 db-module functions (F008).
- **`useWorkItemStore`** — creation/update/emit responsibilities per §3; subscribes to sync
  refresh; the shared-refresh widening (15 §6 #5) joins the P1 stage.
- **Creation seam:** `fb:command-new-work-item` event, sibling to `fb:command-new-task`.

## §5 · Notification substrate (SPEC-006, CR-03(a); F009 repairs)

- **Table `wi_notifications`** (org-scoped): id, ref, queue, title, body, deliver_at,
  delivered_at, **dedupe_key TEXT UNIQUE**, wi_origin, critical INTEGER.
- **Main-process scheduler:** app-start + 30s sweep of due undelivered rows; delivery =
  native Electron `Notification` + renderer event. **Per-queue rate caps ship in S4 with
  the substrate** (not S7): max N OS notifications per queue per hour, overflow collapses
  to one summary notification; adversarial test = schedule many overdue rows → relaunch →
  caps hold, exactly one summary (the several-days-offline backlog case). Restart-survival
  test as before. S7 keeps only the *content* restraint defaults (nudge narrowness).
- **Re-pointing:** `lib/notify.ts` → thin client of `notifications:post`; seven existing
  callers migrate; `blockReminders` retires; decoy deletes with its PLX-UX assertions
  ported into the substrate's tests.
- **Badge model:** per-queue counts from `work_item_state` (never `status`, §2.3);
  headline count excludes `wi_origin='system'` (DEC-016).

## §6 · Surfaces (F006/F007 repairs applied)

- **SPEC-014 widgets** — seven defs (Tasks, Reviews, Calendar, Awaiting Ack, Completed,
  Stale Desks, System) on the registry, primitive-kit composed, four-theme verified.
  **Stale Desks is the only surface consuming external `desk_stale`** — renders
  gracefully-empty until the lifecycle track lands.
- **SPEC-015** top-bar count: counts only, system-excluded, `.fb-tabular`.
- **SPEC-017 WorkItemsView** + saved lenses; registered through all seams. **CR-04(b) in
  full (F007): AllTasksView → "All Desks" AND the Pulse card's labels → "open desks / due
  today"** (HomeDashboard insights copy) — GAP-006 is owned and closed by S6.
- **SPEC-020 palette actions** + the palette's own B/C guards, same stage.
- **Capture console (SPEC-007–013):** Routed/Unrouted/Expand; classifier per the standup
  split with `AIPurpose:'intent-classify'`; **Q1 rule in the composer, not the model**
  (DEC-016); rewrite = propose-and-approve; the whole stage gated on S0 (SPEC-044
  execution incl. Flow-executor and apiServer arms).
- **SPEC-018/019:** `reason_code` + signals → one rendered reason; **ranker v1 inputs are
  all item-level** (deadline proximity, item-inactivity staleness, explicit-human-ask) —
  no external-track dependency (F006); scored against `attentionPrecision()`.

## §7 · Stage decomposition (F008 ordering repair)

Per-stage: pre-flight → build → typecheck + unit green → adversarial tests → rubric →
live HMR verification → close; RESHAPE/FOUNDATIONAL add the regression guard.

| Stage | Contents | Key verify |
|---|---|---|
| **S0** | SPEC-044 execution (prompt definitions, `create-work-item` reserved+defined+parsed+gated+labeled, label worklist incl. Flow/apiServer arms) | grep-assertions; label snapshots; saved-Flow compat (wire unchanged) |
| **S1** | `migrateNodesKindCheckV2` + **SCHEMA constant widened** + ALL consumer dispositions (44+2: incl. trashNode **detach** policy, purge/agentHistory belt-and-braces, plan write guards, `listNodes` exclusion, §2.6 scope guards, palette/tree/breadcrumb/gallery) + CR-05 deletion + §2.1 apply-site branches | **three**-fixture migration test; **the F001 purge-survival adversarial test**; live blast-radius smoke; post-migration live kind test |
| **S2** | §2.2 columns + §2.3 projection **(db-module functions live here)** + §2.4 satellites + CRDT allowlists + **emitters** + **409 baseRev fix** | projection pins (never-done; apply-recompute); GAP-015 emit+arrival adversarial; allowlist-parity CI test |
| **S3** | `workItems:*` IPC + preload + store (wrapping S2's functions) + creation seam | typecheck; namespace tests; palette create smoke |
| **S4** | Notification substrate + **rate caps** + re-pointing + decoy retirement | restart-survival; dedupe; **backlog-cap adversarial**; PLX-UX ports green |
| **S5** | Capture console + classifier + Q1 rule + self-routing closure | Q1 table-driven tests; fallback tests; end-to-end capture→item→terminal→notification |
| **S6** | Surfaces ×7 + count + WorkItemsView + **AllDesks AND Pulse renames (GAP-006 closes)** + palette actions + reasons/ranker | four-theme live; native-fit rubric; attentionPrecision wiring |
| **S7** | Intelligence-light (022/023/024) + regression guard + G6 | feeder one-directionality; nudge restraint fixture; whole-suite + live pass |

**Cross-stage rules:** S1 blocks S2 · **S2 blocks S3** · S0 blocks S5's classifier · S4
blocks S5's closure + S7's nudges · the external lifecycle track blocks **only** S6's
Stale-Desks *content* (nothing in the ranker or S5 — F006). Per-stage build prompts are
authored only after this document passes re-gate + dual validation.

## §8 · Failure modes & mitigations (updated per audit)

| Risk | Mitigation / acceptance |
|---|---|
| Migration meets an unanticipated DDL shape | Pinned CHECK-clause predicate; three fixtures; schema-derived rebuild; backup-before-migrate |
| Missed Class-B/C consumer leaks phantoms | S1 classification-complete + live smoke + post-S1 census re-grep expecting zero |
| Allowlist/emitter drift | S2 CI parity test (column manifest ↔ allowlists) + emit-fires assertion |
| Notification duplicates / storms | `UNIQUE(dedupe_key)` + S4 per-queue rate caps + backlog-collapse (all S4) |
| **Un-migrated peer meets a work_item** | §2.6 scope invariant at every crossing; apply-site park+surface branches; **residual accepted at P0: the user's own second device between updates — detected and contained (parked+warned), not preventable without server work; release note states both devices must update** |
| Work_item lost via desk deletion | **Detach at trash + belt-and-braces at every hard-delete + the purge-survival adversarial test (F001)** |
| Permanent-409 unroutability | **Adopted: S2 baseRev-advance fix** (15 §6 #4) |
| Retroactive share exposure | Self-routed exemption + share-time count confirmation (F005) |
| Two person-fields drift | assignee non-use + CI lint-grep |
| `status` written directly / drifts cross-version | db-module rejection + apply-path recompute (F012) |
| Cross-version projection drift | same apply-path recompute |
