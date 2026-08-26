# Attention Layer — Technical Architecture (v2.3 — APPROVED)

**Status:** APPROVED v2.3 — the architecture gate (G3+G4) is **MET, 2026-08-25**, with
both dual-validation signatures: (1) the blind second validator's CONDITIONAL_APPROVE with
all six conditions (A1–A3, C1–C2, D1) landed in v2.2, and (2) the narrow closing
verification of v2.2: **11 of 12 checklist repairs CLOSED, all 8 code-dependent citations
verified exact**, gate-blocked only on §7/§8 propagation slips (NEW-1/NEW-2) whose stated
remedy — three one-line edits — lands in this revision, alongside its non-blocking NEW-3/4/5
(mid-table note relocated below the §2.2 table; §2.5 renumbered 1–10 with all §2.5.x
pointers re-anchored; parent_id writer count corrected to six + `ensureSharedContainer`
named for closure; CI-lock scope pinned to nodes-targeting DELETEs with the migration's own
`DROP TABLE nodes` allowlisted; §2.6 P1 checklist now carries the §2.5.3 prune exclusion).
**Convergence note:** the blind validator's condition C1 and the re-gate's F-C1″ are the
same defect found independently — dual validation working. Audit chain: v1 REJECTED (14) →
v2 (11) → v2.1 (14) → v2.2 (2 propagation slips) → v2.3 (0 open findings), each round
narrower. **Per §7's rule, per-stage build prompts are now authorized.**
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
- **`park-local`** — an existing local work_item is detached by a lifecycle sweep
  (`parent_id → NULL`, local `detached_from_id` set): the row exists and renders in the
  **DETACHED section of WorkItemsView** (§6 — renamed from "Parked" per F-M7″: the legacy
  `status='parked'` projection value is a third sense we cannot rename, so the surface
  moves). **Primary recovery action: MOVE** (pick a new desk/room). *Re-attach* is offered
  only when its predicate holds (F-M8″): `detached_from_id` resolves to a live node whose
  kind is a legal parent AND whose scope the item may enter under §2.6 — which excludes
  both designed populations (purged parent = gone; org-moved parent = scope-blocked while
  OFF), so move is the working affordance and re-attach appears only in the edge cases.
  Park-inbound rows auto-reapply on the next pull after the local schema gains the
  kind/columns (boot-time reapply sweep keyed on the parked set), deduped by item id.

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
  reconstructs **DDL, columns, indexes AND TRIGGERS** from live schema, and **the schema
  harvest reads `sqlite_master` BEFORE any rename** (so a SQLite-rewritten trigger body
  can never be what gets recreated). Rebuild mechanics follow the house pattern verbatim
  (`migrateShareKindChecks`, database.ts:1247+): **`PRAGMA foreign_keys=off` OUTSIDE the
  transaction** (inside a txn the pragma is a silent no-op — empirically catastrophic:
  the rename direction rewrites child FKs to `nodes_old`), create-new → copy → DROP old →
  rename into place.
- **MIGRATION_VERSION bumps to 2 (validator A1):** the pre-migration `VACUUM INTO` backup
  is gated on `user_version < MIGRATION_VERSION` — without the bump it silently never
  fires for exactly the DBs this migration rebuilds.
- **No-match semantics (validator A2):** if no `CHECK (kind IN (…))` clause can be
  extracted from the nodes DDL (unanticipated shape), the migration **skips and surfaces
  loudly** (sync-status + log) — it never fires vacuously and re-adds a CHECK that unknown
  data could violate into a boot-loop.
- **Fixture assertions, full set (F-M4″/A3/F-m3″):** all three fixtures assert
  (a) data preservation, index recreation, idempotency; (b) trigger survival — fixture 3
  **pre-creates** `nodes_mark_dirty` so the assertion tests preservation on the
  legacy-upgrade path, where it is meaningful (on fresh installs the `IF NOT EXISTS`
  creation at :740 makes it vacuous); (c) **`PRAGMA foreign_key_check` returns empty**;
  (d) every one of the **eleven inbound `REFERENCES nodes(id)` declarations** still names
  `nodes` (not `nodes_old`) in `sqlite_master`; (e) a live cascade probe — insert desk +
  widget child, delete desk, assert the widget cascades.
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
- **`schema_epoch` — a FORWARD-COMPATIBILITY RECEIVER GUARD, not peer confirmation
  (F-M5″ reframing):** the column stamps the WRITER's schema version, letting a device at
  epoch N detect and park-inbound a row stamped N+1 instead of mis-applying it. It cannot
  confirm a peer is migrated (an un-migrated peer never authors a work_item to observe) —
  **P1's migrated-peer confirmation is the org presence/version surface where available,
  else operator attestation**, stated as such in §8's un-migrated-peer row. Same-device guard
  (R006): local work_item creation checks the local DDL for `'work_item'` (zero network)
  so an un-migrated same-account device can never author one.
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
| `schema_epoch` (R005/F-M5″) | INTEGER | Writer's schema version — forward-compat receiver guard (park-inbound rows from a newer epoch). Replicated-but-not-renderer-emitted: written by main-process lifecycle code, excluded from the emit-fires assertion (F-m2″) |

| `confidence` | 0–1 REAL | AI-created items |
| `approval_state` | `auto approved suggested dismissed merged` | SPEC-025 substrate from birth |
| `reason_code` | machine token behind the one rendered reason | SPEC-018 |
| `wi_origin` | `human ai system` | DEC-016 Q7 |

**`detached_from_id` lives in `wi_local`, NOT here (F-M6″):** it names a row hard-deleted
*on the purging device* — a device-local fact. Replicating it would show peers (whose copy
of the parent may still be alive) a Detached entry pointing at a living desk with an
un-honorable re-attach. §2.4's satellite split exists for exactly this; it moves there.

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
- **Amendment (DEC-018 A-1, 2026-08-25):** the three write cores (`createWorkItemCore`,
  `setWorkItemStateCore`, `updateWorkItemFieldsCore`) accept an optional
  `actor?: { kind: 'human'|'agent'|'system'; agentRef?; missionRef? }` — the per-change
  attribution seam Dispatch D4 names ("a person or an agent acting on their behalf").
  v1 threads it through IPC and logs it; persistent storage (columns vs event log) is a
  D4-time DEC. Reserved now because F008 makes these the only write path: the parameter
  costs minutes today and a caller sweep later.

### 2.4 Satellite local tables (SPEC-003)

`wi_local` (item_id PK, snooze_until, read_at, local_flags, **`detached_from_id`** —
the device-local record of a lifecycle detach, per F-M6″) and `wi_deliveries` (receipts +
dedupe). Org-scoped; never synced; never in bodies.

### 2.5 Reference integrity & lifecycle interaction (v2.1: revive-at-purge, F-M2 option a)

The FK is `parent_id … ON DELETE CASCADE`; hard deletes of parent rows let SQLite remove
children, and **a cascade cannot be kind-filtered**. v2's detach-at-trash silently spent
the lossless-undo contract (`deleteNode` returns trashed ids; `restoreNodes` restores
exactly those). v2.1 adopts the third option:

1. **Trash sweeps normally (undo stays lossless — DEVICE-SCOPED, F-M9″).** `deleteNode`
   trashes work_item children with their desk exactly as today; undo restores
   bit-identically **on the device that trashed**. Cross-device: a purge on device A
   propagates the revive upsert; if device B then restores its still-trashed desk,
   `restoreNodes` does not re-attach — the item stays detached on B. Accepted and named
   in §8; adversarial case (a) gains a device-B arm asserting exactly this outcome.
2. **The purge NEVER targets work_items (F-C1″ — the target-vs-victim fix, found
   independently by both final auditors):** `purgeTrashedNodes`' SELECT gains
   **`AND kind != 'work_item'`** — a trashed work_item is never a direct purge target,
   only ever reachable through its parent's deletion, which the detach step intercepts.
   The delete loop additionally **re-checks liveness per id** (skips rows whose
   `trashed_at` became NULL mid-loop) so ordering within the snapshotted set can never
   matter. With this filter, §2.5.10's "no hard-delete at v1" becomes true — and its
   **enforcement site (validator C2)** is `deleteNode`/`nodes:delete` refusing
   `kind='work_item'` ROOTS with a typed error (items are dismissed/reclassified, never
   trashed directly).
3. **Detach-and-revive at the CLOSED enumeration (F-C1), LOCKED by an
   INVERSE call-site allowlist (F-M2″):** the sites issuing unguarded `DELETE`s against
   `nodes` are exactly four *(widened three→four at DEC-021: `purgeDeskPermanently`,
   the operator's D2 purge, joined with its own detach-and-revive + marker)* —
   originally `src/main/db/nodes.ts` :314 (`purgeTrashedNodes`),
   **`src/main/ai/agentHistory.ts` :325** (full path per F-m1″), and
   `src/main/db/workspaceSync.ts` :888 (`pruneSharedDesk`, templated). Each detaches
   work_item children (`parent_id = NULL`, revive, `wi_local.detached_from_id` set)
   before deleting its targets; **at `pruneSharedDesk` the DELETE additionally excludes
   `kind='work_item'` rows outright** — at P1 routed items are STAMPED and match the
   `shared_root_id` predicate directly, where child-detach is inert (F-M1″); the
   exclusion covers both exposure states and joins the P1 switch checklist. The CI lock
   matches every `DELETE FROM` **whose target table is or could be `nodes`** — the
   literal `nodes` plus any templated `${…}` table variable that can resolve to it —
   under `src/main/**` against the three-entry file:symbol allowlist (unrelated-table
   DELETEs are out of scope by construction, keeping the allowlist three entries, not
   fifty), and additionally fails on `DROP TABLE nodes` outside its single sanctioned
   site (`migrateNodesKindCheckV2`'s table rebuild, §2.1 — its own allowlist entry),
   any `INSERT OR REPLACE INTO nodes`, and any NEW table declaring
   `REFERENCES nodes(id) ON DELETE CASCADE`. Detach steps are throw-safe and
   log+surface (F-m3).
4. **The S1 adversarial tests (five cases):** (a) trash desk+work_item → undo →
   bit-identical incl. parent, **plus the device-B arm** (purge on A → restore on B →
   item detached on B, surfaced in Detached); (b) trash → +7 days → purge →
   **work_item alive, revived, never selected as a target** (the F-C1″ case); (c) shared
   desk + un-stamped work_item child → `pruneSharedDesk` → alive (F-C1);
   (d) STAMPED work_item + `pruneSharedDesk` → alive (the F-M1″ P1 case);
   (e) direct `nodes:delete(workItemRoot)` → typed refusal (C2).
5. **Work_items are LEAF nodes at v1 (R009; F-M3″ — enforced at ALL parent_id write
   points, not two):** the writers of `nodes.parent_id` are six — `createNode`,
   `moveNode`, **`updateNode`'s `parentId` patch column** (nodes.ts:174), and the three
   sync apply arms (parent_id rides the body) *(a seventh, `ensureSharedContainer`,
   always writes `parent_id=NULL` — no target parent, trivially safe; named for
   enumeration closure)*. The first three assert the target parent's
   kind ≠ `work_item` in the db module; replicated rows are validated by the
   **work_item arrival router (§3 D1)** and, belt-and-braces, S1's blast-radius smoke
   asserts no child under a work_item after a sync cycle. Sub-items are a designed-around
   P2 (the invariant lifts by widening these named points, no schema change).
6. `moveNodeToOrg` carries work_items with their desk — **guarded by §2.6**.
7. **Shared-desk guard (DEC-013, lifecycle track):** unilateral trash of a shared-root
   desk refused ahead of all of this. *(P1 note: routed items on non-shared org desks —
   sender-side trash propagates deletes to the recipient via sync; the recipient-side
   retention rule is now RULED — see the §8 row: soft-trash only, recipient's purge
   clock, restore-detaches, one withdrawal notification.)*
8. **Plan write guards (G2):** `addDependency` / `patchPlanTask` assert `kind='task'`.
9. **Retroactive share exposure (F005 + F-M5 stage-qualified):** self-routed work_items
   (`recipient_id = originator_id`) are permanently exempt from the stamp sweep.
   **P0 (switch OFF):** the share flow states "N work items on this desk stay personal
   and will not be shared" — matching §2.6's refusal. **P1 (switch ON):** routed items
   follow their desk; the flow surfaces "N work items on this desk will be shared" for
   confirmation.
10. **Work_item deletion (R008 — RATIFIED as the standing contract, DEC-021):**
   work_items have **no hard-delete** — `dismissed`/`reclassified` are the lifecycle,
   and even D2's permanent desk purge detaches-and-revives them (dialog copy states
   it). A work item's bytes die only when the operator individually dismisses it and
   its row later falls to the standard decay/retention machinery. Re-opener: a
   privacy-erasure requirement (see `privacy/erasure.ts` interaction note).

### 2.6 The scope invariant (F002 repair — replaces v1's creation-only gate)

**Invariant: a `work_item` row may not ENTER a sync scope whose peers are not confirmed
migrated.** Enforced at every scope-crossing site, not at creation:

| Crossing | Guard while the P1 exposure switch is OFF |
|---|---|
| Creation | capability-gated (`workItems.enabled`), personal scope only |
| `moveNodeToOrg` sweep | **refuses to carry `kind='work_item'`** — **park-local**: detach + `wi_local.detached_from_id` + a typed IPC return the move toast renders ("N work items stayed personal — see Detached"), desk moves without it |
| `stampSharedDesk` + propagation | same refusal (self-routed items additionally exempt forever, §2.5.9) |
| `collectDeskSubtree` (shared push) | kind-guard per its Class-C disposition — cannot collect work_items while OFF |
| **Own second device** | the apply-site defensive branches (§2.1) turn the un-migrated-peer failure from silent swallow into **park-inbound**-with-warning; the P0 release notes state both devices must update. Detection + containment — full prevention requires server work we cannot do from the fork; accepted residual in §8 |

The P1 switch flips per-org only after a migrated-peer confirmation step (P1 rollout
checklist: all org members' app versions ≥ the migration release — verified via the org
presence/version surface if available, else operator attestation for the two-person org —
**plus §2.5.3's `pruneSharedDesk` work_item exclusion verified in place**, the
stamped-item safety net that must precede any routed item matching the
`shared_root_id` predicate).

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
- **The ARRIVAL ROUTER (validator D1 — the live path's receive side):** the CRDT apply
  plumbing today would DESTROY inbound work_item events — `tryCreateNode` inserts a fixed
  column list and hard-forces `status='open'`, `applyNodeAttr` drops non-allowlisted
  columns, and both refresh `useNodeStore`, which excludes work_items. S2/S3 therefore add
  a kind branch at the CRDT apply layer: `kind==='work_item'` events route to the S2
  db-module functions (full column set, projection recomputed) and refresh
  `useWorkItemStore`. Same branch at the poll apply arms validates the leaf invariant
  (F-M3″). P1 note: `nodeSharedRoot` resolves partitions from `useNodeStore` — shared
  work_item emits would misroute to the personal partition; owed at the P1 pass,
  non-foreclosing.
- **The column manifest is a single exported const** (`WORK_ITEM_COLUMNS`, S2): consumed
  by the ensureColumns, both allowlists, the arrival router, and the CI parity test —
  one source, drift impossible (guess-list #9).
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
- **SPEC-017 WorkItemsView** + saved lenses + **the DETACHED section (F-M6/F-M7″/F-M8″)**:
  park-local items render here with `wi_local.detached_from_id` context; **primary action
  MOVE**, re-attach only when its §1 predicate holds; park-inbound events surface in the
  System queue per their `origin`. Registered
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
| **S1** | `migrateNodesKindCheckV2` (+ trigger preservation) + **SCHEMA constant widened** + ALL consumer dispositions (44+2) + **revive-at-purge at the THREE hard-delete sites incl. `pruneSharedDesk`** + the CI delete-site grep-lock + leaf invariant + plan write guards + `listNodes` exclusion + §2.6 scope guards + same-device creation guard + CR-05 deletion **with the task-item residue sweep** + §2.1 apply-site branches | three-fixture migration test **+ trigger-survival assertions**; **the five §2.5.4 adversarial cases (a)–(e)**; live blast-radius smoke; post-migration live kind test **(disposable/scope-verified account per R010)** |
| **S2** | §2.2 columns (incl. `schema_epoch`) + §2.3 projection **(db-module functions live here)** + §2.4 satellites **(incl. `detached_from_id` in `wi_local` — NEW-1; + orphan reconciliation, R017)** + CRDT allowlists + **emitters** + **the arrival router (§3 D1)** + **409 baseRev fix** | projection pins (never-done; apply-recompute **on all three apply sites**); GAP-015 emit+arrival adversarial + **main-process-detach-reaches-device-B poll test**; allowlist-parity CI test |
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
| **Un-migrated peer meets a work_item** | §2.6 scope invariant at every crossing; apply-site **park-inbound**+surface branches; **residual accepted at P0: the user's own second device between updates — detected and contained (park-inbound+warned), not preventable without server work; release note states both devices must update.** P1 migrated-peer confirmation = presence/version surface else operator attestation (F-M5″) |
| Cross-device undo divergence (F-M9″) | Accepted + surfaced: purge-on-A then restore-on-B leaves the item detached on B (Detached section); case (a)'s device-B arm pins it |
| Revived-clutter accumulation (F-m4″) | Accepted + named: desk-trashed items revive at day 7 into their queues (dismiss = one tap; disclosed in trash-toast copy). S1 pre-flight checks `src/main/privacy/erasure.ts` node handling for interaction |
| Work_item lost via desk deletion | **Revive-at-purge at the CLOSED four-site enumeration (purge, agentHistory, pruneSharedDesk, DEC-021 operator purge) + CI delete-site grep-lock + the five §2.5.4 adversarial cases (a)–(e)** |
| Fourth hard-delete site added later | The CI grep-assertion fails on any new literal/templated `DELETE` against `nodes` outside the sanctioned three |
| P1 routed-item trash propagation (sender trash → recipient delete via sync) | **RULED at the P1 checkpoint (2026-08-25) — the recipient-retention rule:** a sender's trash arrives at the recipient as SOFT-TRASH ONLY (the apply arms already map remote deletes to `trashed_at`, never tombstone — enforced, not incidental). The recipient's copy sits in THEIR Trash on the standard purge clock, restorable like any trashed item; a restore DETACHES it from the withdrawn route (`detached_from_id` preserved, Detached-shelf semantics) so restoring never re-projects into the sender's scope. Recipient-owned satellite state (acknowledgment history, `wi_local`) survives until purge. Withdrawal surfaces ONE system-queue notification ("Withdrawn: <title>", deduped per item) through the substrate. Implementation rides SPEC-027; the rule is frozen now so SPEC-027 designs against it |
| Merge to origin with un-migrated fleet (R016) | Named merge-readiness preconditions: defensive branches landed upstream AND observed firing; `schema_epoch` version gate live; else `workItems.enabled` ships opt-in-only |
| Permanent-409 unroutability | **Adopted: S2 baseRev-advance fix** (15 §6 #4) |
| Retroactive share exposure | Self-routed exemption + share-time count confirmation (F005) |
| Two person-fields drift | assignee non-use + CI lint-grep |
| `status` written directly / drifts cross-version | db-module rejection + apply-path recompute (F012) |
| Cross-version projection drift | same apply-path recompute |
