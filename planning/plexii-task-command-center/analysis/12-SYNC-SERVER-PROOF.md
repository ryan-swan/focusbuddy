# Sync Server Proof — Test A: Unknown-Column Round Trip

**Verdict: PASS.** The signal server stores node bodies opaquely and echoes unknown columns
intact. Run 2026-08-24 23:21 local, by the operator (one-click script,
[sync-proof.sh](sync-proof.sh)); raw log: [sync-proof-run.log](sync-proof-run.log).
Confidence: 0.97 · why_not_higher: single run, personal scope only; unknown-KIND value not
yet directly tested (see residuals).

## Method

Against the live dev app (signed in, syncing to the production signal server), personal
scope only, WAL-consistent backup first:

1. `ALTER TABLE nodes ADD COLUMN wi_probe TEXT` (additive, ensureColumn-style).
2. Insert probe desk (`kind='task'`, org `personal`, `needs_sync=1`,
   `wi_probe='PROBE-COLUMN-1787631707403'`).
3. Engine pushed on its own cycle → **server accepted in ~3s** (`needs_sync→0`,
   `sync_rev=1` assigned).
4. Raw local DELETE (no tombstone) + personal pull cursor rolled back → next pull
   **re-materialized the row from the server with `wi_probe` byte-identical**.
5. Cleanup: proper tombstone (`trashed_at` + `needs_sync=1`) → server deletion confirmed in
   ~18s → local residue removed → probe column dropped live (SQLite DROP COLUMN succeeded
   with the app running). Zero trace; 369MB backup retained
   (`analysis/focusbuddy-preproof-backup.db`, git-excluded).

## What this proves

- **The server does not schema-validate node bodies.** An unknown column travels
  push → store → echo unmodified. `work_item` metadata as node columns (DEC-007/SPEC-002)
  rides the existing sync loop with zero server work.
- Combined with the client-side by-construction evidence (analysis/10 §5: `bodyFromRow`
  copies all non-bookkeeping columns; pull appliers build column lists from local
  `PRAGMA table_info`), **the full split proof is closed**: server passes (live-proven),
  client stamps and preserves (code-proven + live-observed on the echo).

## Incidental findings

- **Rev semantics correction:** per-item `sync_rev` is a small integer counter (`=1` for a
  fresh item), while pull cursors are millisecond timestamps. The script's `REV-1` rollback
  therefore set the cursor to 0 → a full re-pull, which applied idempotently and returned
  the probe within 6s. Harmless here; worth knowing for any future cursor surgery.
- Push latency was ~3s, not the 20s interval — the engine's change-nudge path
  (`registerSyncNudge`) fires ahead of the timer. Good news for SPEC-027's acknowledgment
  latency expectations on the push side (C2-01's observed 7–8s collaboration delay likely
  lives elsewhere in the loop — pull cadence or apply ordering; the reliability assessment
  still owes the answer).
- Unrelated-but-observed: 12 pre-existing rows sat at `needs_sync=1` before the test —
  worth a glance during the reliability assessment (could be normal churn or stuck rows).

## Residuals (unchanged in nature, now precisely bounded)

1. **Unknown-KIND value** — not directly tested: the local CHECK constraint rejects
   `kind='work_item'` before the engine can push it, and testing server-side alone would
   mean hand-wielding the session token (declined). Inference from body opacity is strong
   (kind is just another body field; the server branches on `itemType`, which stays
   `'node'`). Direct confirmation is scheduled for the first Phase 6 schema stage,
   immediately after the migration lands locally — at which point it is risk-free.
2. **GAP-013 unchanged** — the hazard is client-side (un-migrated peers' CHECK + swallowed
   catch), orthogonal to today's server result. Migration-leads ordering stands.

## Register effects

- **A-003 → VALIDATED** (this file is the evidence).
- **DEC-007 ratification evidence complete** — formal ratification remains at G4 per the
  decision text, but the material risk is retired.
- **GAP-008** — only the ACL-semantics writeup remains.
