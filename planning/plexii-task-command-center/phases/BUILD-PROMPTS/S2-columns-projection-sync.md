# S2 — Columns, Projection, Satellites, Sync Contract

**Class:** FOUNDATIONAL (regression guard applies) · **Blocks:** S3, S4's badge model ·
**Risk:** HIGH — this is where replication correctness is won or lost (GAP-015).

**Mission:** the full work_item column set exists and REPLICATES on both transports; the
status projection is computed at write and recomputed at every apply site; the satellites
hold device-local state; inbound work_item events survive the CRDT apply layer instead of
being destroyed by it; the 409 unroutability hole is closed.

## Read first
- ARCHITECTURE **§2.2 (column table + F-M6″ note), §2.3, §2.4, §3 (every bullet)**
- [analysis/15-SYNC-RELIABILITY.md](../../analysis/15-SYNC-RELIABILITY.md) §6 (the five
  latency preconditions; #4 = the 409 fix) ·
  [analysis/12-SYNC-SERVER-PROOF.md](../../analysis/12-SYNC-SERVER-PROOF.md) (why
  opaque-echo lets us add columns without server work)
- Code anchors: `crdtSync.ts` (:57-75 `NODE_ATTR_KEYS`, :400-420 `emitNodeCreate`,
  :954-981 apply handlers, :224-226 `nodeSharedRoot`), `workspaceSync.ts` (:98 SYNC_COLS,
  :105-109 bodyFromRow, apply arms)

## Build items
1. **`WORK_ITEM_COLUMNS` manifest** — ONE exported const (§3): consumed by ensureColumns,
   both allowlists, the arrival router, and the CI parity test. Build it first.
2. **§2.2 columns** via `ensureColumn`: `work_item_state`, `intent_class`,
   `originator_id`/`recipient_id`, `due_at` (ISO), `wi_urgency`, `source_ref`/
   `source_type`, `confidence`, `approval_state`, `reason_code`, `wi_origin`,
   `schema_epoch`. NOT `detached_from_id` — that is `wi_local` (F-M6″). `team_id`
   stamped from routing context at push.
3. **§2.3 projection:** `createWorkItem`/`updateWorkItemState` as db-module functions
   (main, ONE code path — F008); `status` computed per the mapping table
   (dismissed/reclassified → `parked`, NEVER `done`); db module rejects direct `status`
   writes for work_items; **recompute at all three poll apply arms** (F012).
4. **§2.4 satellites:** `wi_local` (item_id PK, snooze_until, read_at, local_flags,
   `detached_from_id`) + `wi_deliveries`. Org-scoped, never synced, never in bodies.
   **Orphan reconciliation (R017):** startup sweep deletes satellite rows whose item is
   gone.
5. **Allowlists + emitters (§3):** every §2.2 column joins `NODE_ATTR_KEYS` +
   `emitNodeCreate` snapshot; `useWorkItemStore` (skeleton here, full store S3) is the
   renderer-originated producer; main-process lifecycle writes emit NO CRDT events and
   converge via the poll (trigger-survival is why — F-M1 pin).
6. **The ARRIVAL ROUTER (§3 D1):** kind branch at the CRDT apply layer —
   `kind==='work_item'` create/attr events route to the S2 db-module functions (full
   column set, projection recomputed, `useWorkItemStore` refresh), NEVER through
   `tryCreateNode`'s fixed column list / `status='open'` force. Same branch at the poll
   arms validates the leaf invariant. `schema_epoch` guard: rows from a newer epoch
   park-inbound + surface (wires into S1's defensive branch).
7. **409 baseRev fix (F010):** on conflict-apply-no-op, `sync_rev = serverRev` so baseRev
   advances. Isolated commit, Caleb-flag treatment (it also janitors the 6 zombie demo
   rows analysis/15 predicted).

## Adversarial / verify
- **Projection pins:** table-driven every-state test incl. the never-done pin;
  apply-recompute asserted on ALL THREE arms (inject a body with a stale/hostile
  `status`; local projection wins).
- **GAP-015 emit+arrival:** (a) renderer create on device A → live-path arrival on B
  carries ALL routing fields **with the poll disabled during the window** (proves the
  CRDT path alone); (b) main-process detach on A reaches B **via the poll** (proves the
  no-emit design converges).
- **Allowlist-parity CI test:** manifest ↔ `NODE_ATTR_KEYS` ↔ emit snapshot ↔ ensureColumns
  — one drift = red.
- **409 fix:** unit — conflicted row advances baseRev, next push clean; live — the
  Client Work / Northwind dirty rows (revs were climbing at 4706) finally settle to
  `needs_sync=0`.
- **Regression guard** (FOUNDATIONAL): full suite + blast-radius smoke as S1.

## Close
Commits: columns+manifest → projection → satellites → allowlists+emitters → arrival
router → 409 fix (each separately revertable; sync-file diffs marked for upstreaming) ·
ACTIVE-MISSION + handoff.
