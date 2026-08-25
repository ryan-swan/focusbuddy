# Attention Layer — Technical Architecture (v2.1)

**Status:** DRAFT v2.1 — v2 repaired all 14 v1 findings (12 verified closed at re-audit);
the re-audit found the two v1-CRITICAL repairs **jointly** unsound (F-C1: `pruneSharedDesk`
is a third hard-delete the stamp-refusal exposes) plus 6 MAJOR / 4 MINOR — all repaired
below, together with the risk war-game's adoptable items (analysis/17). Pending: focused
final re-gate on the changed sections + the independent second validation + G4 acid test.
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

**Vocabulary addition (F-M6):** "park" is two different mechanisms and is never used bare:
- **`park-inbound`** — the receiver declines to materialize an inbound sync row (unknown
  kind / missing columns): no local row exists; surfaced as a sync-status warning with
  retry, and as an `origin='system'` entry in the System queue.
- **`park-local`** — an existing local work_item is detached from a scope-crossing sweep
  (`parent_id → NULL`, `detached_from_id` set): the row exists, renders in the **Parked
  section of WorkItemsView** (§6) with one recovery action — *re-attach* (restores
  `parent_id` from `detached_from_id` when legal) or *move*.

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
- **Registration order, pinned TWO-SIDED (F-M1):** the migration runs in `getDb()`
  **after `db.exec(SCHEMA)` and before the `nodes_mark_dirty` trigger creation
  (`database.ts:740`)** — and before any work_item `ensureColumn` call. The rebuild
  reconstructs **DDL, columns, indexes AND TRIGGERS** from live schema (SQLite drops a
  table's triggers with the table; `nodes_mark_dirty` is the poll fallback every
  main-process lifecycle write depends on — losing it silently kills sync for all
  subsequent edits). All three fixtures assert trigger survival:
  `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='nodes'` returns
  `nodes_mark_dirty` post-migration.
- **The base `SCHEMA` constant is widened in the same stage (F014)** — fresh installs are
  born wide; the migration exists for pre-existing DBs and is a no-op after.
- **Test fixtures (pinned, three):** (1) factory-narrow legacy DB w/ accreted columns;
  (2) legacy-widened DB (task-item present, quoted-"nodes" DDL) — asserts the V2 guard
  fires where the harvest guard returns early; (3) **narrow-CHECK DB that already has
  `work_item_state` columns** — asserts the pinned predicate still fires (F003). All
  assert data preservation, index recreation, idempotency.
- **Receiver defensiveness (adopting analysis/15 blocker #3; F002 repair; F-m2 scoping):**
  **all three apply sites** (`applyRemote`, `applyRemoteOrg`, `applyRemoteShared`) gain TWO
  explicit branches replacing silence: an **unknown-kind** branch (CHECK rejection →
  **park-inbound** + sync-status warning, no infinite silent retry) and an
  **unknown-column** branch (body carries `work_item_state` but local table lacks it →
  park-inbound + surface). P0-required on `applyRemote` (personal); P1-required on the
  other two before the exposure switch flips. Small isolated diffs in Caleb's subsystem —
  own commit, flagged to him like the wake fix.
- **Version stamp + same-device guard (R005/R006):** a `schema_epoch` column (unknown
  columns round-trip opaquely — proven) stamps every pushed work_item row, giving P1's
  "peers confirmed migrated" a real mechanism instead of attestation-only; and local
  work_item creation checks the local DDL for `'work_item'` (the migration's own guard
  condition, zero network) so an un-migrated same-account device can never author one.
- **CR-05(a) residue reconciliation (F-m1):** S1 sweeps the remaining live legacy
  `task-item` rows (5 after the 2026-08-25 cleanup; JSON-backup first, same discipline) so
  deleting `'task-item'` from the TS union leaves the union HONEST about runtime data —
  no live row outside the declared union flows through `rowToNode`.

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
| `source_ref` / `source_type` | id + `desk room doc message mail file selection browser calendar note widget` | click-through target ONLY (capture provenance); resolution failure renders orphan-graceful ("source no longer exists") |
| `detached_from_id` (F-M3) | node id, nullable | Set when a lifecycle sweep detaches the item (park-local / revive-at-purge); read by the Parked surface and the re-attach action. Never overloads `source_ref` |
| `schema_epoch` (R005) | INTEGER | Version stamp for the P1 migrated-peer check |
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

### 2.5 Reference integrity & lifecycle interaction (v2.1: revive-at-purge, F-M2 option a)

The FK is `parent_id … ON DELETE CASCADE`; hard deletes of parent rows let SQLite remove
children, and **a cascade cannot be kind-filtered**. v2's detach-at-trash silently spent
the lossless-undo contract (`deleteNode` returns trashed ids; `restoreNodes` restores
exactly those). v2.1 adopts the third option:

1. **Trash sweeps normally (undo stays lossless).** `deleteNode` trashes work_item
   children with their desk exactly as today — the undo set is complete, restore
   round-trips bit-identically. UX copy on the trash toast notes work items travel with
   the desk and revive if it purges.
2. **Detach-and-revive at every hard-delete — a CLOSED, DERIVED, LOCKED enumeration
   (F-C1).** The sites issuing unguarded `DELETE`s against `nodes` — established by
   grepping BOTH literal and template-interpolated forms — are exactly three:
   `purgeTrashedNodes` (nodes.ts:307), `agentHistory`'s ref-parse delete (:325), and
   **`pruneSharedDesk` (workspaceSync.ts:882 — templated `DELETE FROM ${table}`, the one
   both prior passes missed)**. Each detaches work_item children first
   (`parent_id = NULL`, `trashed_at = NULL` to revive, `detached_from_id` set) before
   deleting the target. **A CI grep-assertion fails the build on any new `DELETE`
   targeting `nodes` (literal or templated) outside these three sites** — the enumeration
   is mechanically locked, not memory-dependent. `pruneSharedDesk`'s line-880 comment
   ("can never delete personal content") is updated — it becomes false under §2.6's
   stamp-refusal, which is precisely how F-C1 arose. The detach step is written
   throw-safe and logs+surfaces its own failures (F-m3 — the purge's production caller
   swallows exceptions).
3. **The S1 adversarial tests (mandatory, three cases):** (a) trash desk+work_item →
   undo → **bit-identical restore incl. parent**; (b) trash → +7 days →
   `purgeTrashedNodes` → **work_item alive, revived, orphan-graceful, `detached_from_id`
   set**; (c) shared desk + un-stamped work_item child → `pruneSharedDesk(root)` →
   **work_item alive** (the F-C1 case).
4. **Work_items are LEAF nodes at v1 (R009):** `createNode`/`moveNode` reject a parent of
   `kind='work_item'` — nothing can nest under one, so no sweep starting AT a work_item
   can cascade anything. Sub-items are a designed-around P2.
5. `moveNodeToOrg` carries work_items with their desk — **guarded by §2.6**.
6. **Shared-desk guard (DEC-013, lifecycle track):** unilateral trash of a shared-root
   desk refused ahead of all of this. *(P1 note: routed items on non-shared org desks —
   sender-side trash propagates deletes to the recipient via sync; the P1 architecture
   pass owes the recipient-side retention rule. Registered in §8.)*
7. **Plan write guards (G2):** `addDependency` / `patchPlanTask` assert `kind='task'`.
8. **Retroactive share exposure (F005 + F-M5 stage-qualified):** self-routed work_items
   (`recipient_id = originator_id`) are permanently exempt from the stamp sweep.
   **P0 (switch OFF):** the share flow states "N work items on this desk stay personal
   and will not be shared" — matching §2.6's refusal. **P1 (switch ON):** routed items
   follow their desk; the flow surfaces "N work items on this desk will be shared" for
   confirmation.
9. **Work_item deletion (R008, v1 rule):** work_items have **no hard-delete at v1** —
   `dismissed`/`reclassified` are the lifecycle; DEC-013's memory contract extends to
   work_items before any delete flow ships (queued in the operator ruling set).

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

- **Allowlists + EMITTERS (GAP-015 + F004; F-M4 scoped):** every §2.2 column joins
  `NODE_ATTR_KEYS` and the `emitNodeCreate` snapshot, and `useWorkItemStore` is the
  producer for **renderer-originated** writes (`create` → `crdtEmitNodeCreate`;
  `updateFields`/`setState`/`reclassify` → attr events) — by construction there, since
  work_items never pass through `useNodeStore`. **Main-process lifecycle writes (detach/
  revive at the three hard-delete sites, park-local at `moveNodeToOrg`) emit NO CRDT
  events** — `parentId` isn't even in `NODE_ATTR_KEYS` — and converge via
  `nodes_mark_dirty` → `needs_sync` → the poll (≤20s tail): this is exactly why F-M1's
  trigger-survival pin is load-bearing. S2's adversarial tests assert (a) the renderer
  emit fires and a live-path arrival carries routing fields (poll disabled during the
  window), and (b) a main-process detach reaches the second device via the poll.
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
- **SPEC-017 WorkItemsView** + saved lenses + **the Parked section (F-M6)**: park-local
  items render here with `detached_from_id` context and one recovery action (re-attach /
  move); park-inbound events surface in the System queue per their `origin`. Registered
  through all seams. **CR-04(b) in full (F007): AllTasksView → "All Desks" AND the Pulse
  card's labels → "open desks / due today"** (HomeDashboard insights copy) — GAP-006 owned
  and closed by S6.
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
| **S1** | `migrateNodesKindCheckV2` (+ trigger preservation) + **SCHEMA constant widened** + ALL consumer dispositions (44+2) + **revive-at-purge at the THREE hard-delete sites incl. `pruneSharedDesk`** + the CI delete-site grep-lock + leaf invariant + plan write guards + `listNodes` exclusion + §2.6 scope guards + same-device creation guard + CR-05 deletion **with the task-item residue sweep** + §2.1 apply-site branches | three-fixture migration test **+ trigger-survival assertions**; **the three §2.5.3 adversarial cases (undo-lossless, purge-revive, prune-revive)**; live blast-radius smoke; post-migration live kind test **(disposable/scope-verified account per R010)** |
| **S2** | §2.2 columns (incl. `detached_from_id`, `schema_epoch`) + §2.3 projection **(db-module functions live here)** + §2.4 satellites **(+ orphan reconciliation, R017)** + CRDT allowlists + **emitters** + **409 baseRev fix** | projection pins (never-done; apply-recompute **on all three apply sites**); GAP-015 emit+arrival adversarial + **main-process-detach-reaches-device-B poll test**; allowlist-parity CI test |
| **S3** | `workItems:*` IPC + preload + store (wrapping S2's functions) + creation seam | typecheck; namespace tests; palette create smoke |
| **S4** | Notification substrate + **rate caps** + re-pointing + decoy retirement | restart-survival; dedupe; **backlog-cap adversarial**; PLX-UX ports green |
| **S5** | Capture console + classifier + Q1 rule + self-routing closure | Q1 table-driven tests; fallback tests; end-to-end capture→item→terminal→notification |
| **S6** | Surfaces ×7 + count + WorkItemsView + **AllDesks AND Pulse renames (GAP-006 closes)** + palette actions + reasons/ranker | four-theme live; native-fit rubric; attentionPrecision wiring |
| **S7** | Intelligence-light (022/023/024) + regression guard + G6 | feeder one-directionality; nudge restraint fixture; whole-suite + live pass |

**Cross-stage rules (F-m4):** sequential order is the default dependency; the rules below
name only the NON-adjacent edges — S0 blocks S5's classifier · S2 blocks S4's badge model
(reads `work_item_state`) · S3 blocks S6 (surfaces need `workItems:*`) · S4 blocks S5's
closure + S7's nudges · the external lifecycle track blocks **only** S6's Stale-Desks
*content* (nothing in the ranker or S5 — F006). S5's e2e verify carries an explicit
capture-latency target (R011: classified-capture ≤ standup-baseline + 1s; hard triggers
resolve deterministically without the model). Per-stage build prompts are authored only
after this document passes the final re-gate + dual validation.

## §8 · Failure modes & mitigations (updated per audit)

| Risk | Mitigation / acceptance |
|---|---|
| Migration meets an unanticipated DDL shape | Pinned CHECK-clause predicate; three fixtures; schema-derived rebuild; backup-before-migrate |
| Missed Class-B/C consumer leaks phantoms | S1 classification-complete + live smoke + post-S1 census re-grep expecting zero |
| Allowlist/emitter drift | S2 CI parity test (column manifest ↔ allowlists) + emit-fires assertion |
| Notification duplicates / storms | `UNIQUE(dedupe_key)` + S4 per-queue rate caps + backlog-collapse (all S4) |
| **Un-migrated peer meets a work_item** | §2.6 scope invariant at every crossing; apply-site park+surface branches; **residual accepted at P0: the user's own second device between updates — detected and contained (parked+warned), not preventable without server work; release note states both devices must update** |
| Work_item lost via desk deletion | **Revive-at-purge at the CLOSED three-site enumeration (purge, agentHistory, pruneSharedDesk) + CI delete-site grep-lock + the three adversarial cases (F001/F-C1/F-M2)** |
| Fourth hard-delete site added later | The CI grep-assertion fails on any new literal/templated `DELETE` against `nodes` outside the sanctioned three |
| P1 routed-item trash propagation (sender trash → recipient delete via sync) | Named P1 architecture item: recipient-side retention rule owed before SPEC-027 freezes (§2.5.6 note) |
| Merge to origin with un-migrated fleet (R016) | Named merge-readiness preconditions: defensive branches landed upstream AND observed firing; `schema_epoch` version gate live; else `workItems.enabled` ships opt-in-only |
| Permanent-409 unroutability | **Adopted: S2 baseRev-advance fix** (15 §6 #4) |
| Retroactive share exposure | Self-routed exemption + share-time count confirmation (F005) |
| Two person-fields drift | assignee non-use + CI lint-grep |
| `status` written directly / drifts cross-version | db-module rejection + apply-path recompute (F012) |
| Cross-version projection drift | same apply-path recompute |
