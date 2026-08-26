# S1 — Migration, Consumer Dispositions, Lifecycle Guards

**Class:** FOUNDATIONAL (regression guard applies) · **Blocks:** everything after it ·
**Risk:** HIGHEST of the build — this touches the nodes table and every consumer of it.

**Mission:** the `nodes` table legally holds `kind='work_item'` on every device state that
exists in the wild; every kind-consumer is dispositioned so a work_item row can NEVER leak
into a desk/plan surface; the closed set of hard-delete sites cannot destroy work_items;
the CI locks that keep all of this true forever are in place.

## Read first
- ARCHITECTURE **§2.1 (migration — follow to the letter), §2.5 (all ten items), §2.6**
- [analysis/10-NODE-CONSUMER-CLASSIFICATION.md](../../analysis/10-NODE-CONSUMER-CLASSIFICATION.md)
  — 223 sites / 44 must-touch, per-site minimal-change disposition column
- GAP-011/013/014 in [GAP-REGISTER.md](../../GAP-REGISTER.md)
- Code anchors: `database.ts` (:12 MIGRATION_VERSION, :32-33 FK+CHECK, :542 foreign_keys,
  :740 `nodes_mark_dirty`, :1247+ `migrateShareKindChecks` house pattern), `nodes.ts`
  (:167-181 updateNode cols, :216-235 deleteNode, :295-303 restoreNodes, :307-318 purge),
  `workspaceSync.ts` (:523/:675/:764 apply arms, :844-851 + :576-579 swallowed catches,
  :882-894 pruneSharedDesk), `agentHistory.ts` :325

## Build items (order matters)
1. **`migrateNodesKindCheckV2`** per §2.1 exactly: quoted-literal-in-CHECK-clause guard
   keyed on ABSENCE of `'work_item'` (GAP-014 — the live DB is already CHECK-widened by
   the legacy migration; the 4-kind target `('folder','task','task-item','work_item')` is
   load-bearing, a 3-kind target bricks residue devices); two-sided registration pinned
   after `db.exec(SCHEMA)` and before the :740 trigger creation; triggers in the rebuild
   artifact list (trigger-death = F-M1); `MIGRATION_VERSION` → 2; no-match ⇒ skip +
   surface; pragma work outside the txn. **SCHEMA constant widened in the same commit.**
2. **Consumer dispositions (44+2):** apply analysis/10's minimal-change column site-by-
   site. `listNodes` kind-exclusion FIRST (highest leverage). Record any site whose
   disposition no longer matches the code (Caleb drift) — surface before improvising.
3. **§2.5 lifecycle set:** purge SELECT excludes `kind='work_item'` + per-id liveness
   re-check (§2.5.2) · detach-and-revive at the THREE sites — `purgeTrashedNodes`,
   `agentHistory.ts:325`, `pruneSharedDesk` (+ its outright kind exclusion) — with
   throw-safe, log+surface detach steps (§2.5.3) · `deleteNode`/`nodes:delete` typed
   refusal of work_item ROOTS (C2, §2.5.2) · leaf invariant at the named parent_id
   writers (§2.5.5) · plan write guards `addDependency`/`patchPlanTask` assert
   `kind='task'` (§2.5.8).
4. **CI locks:** the delete-site grep-lock per §2.5.3's pinned scope — every `DELETE FROM`
   whose target is or could be `nodes` vs. the three-entry allowlist; `DROP TABLE nodes`
   allowlisted ONLY at the migration; fails on `INSERT OR REPLACE INTO nodes` and new
   `REFERENCES nodes(id) ON DELETE CASCADE`. Plus the assignee lint-grep (§2.2: work_item
   code never touches `nodes.assignee`).
5. **§2.6 scope guards (switch OFF):** creation capability-gate wired to the S0 flag ·
   `moveNodeToOrg` park-local refusal (typed IPC return; toast copy lands in S6) ·
   `stampSharedDesk` + `collectDeskSubtree` refusals with the §2.5.9 self-routed
   exemption honored.
6. **§2.1 apply-site branches:** the three sync apply arms get the defensive
   unknown-kind branch — park-inbound + surface, replacing the bare catches (GAP-013).
   `schema_epoch` comparisons arrive with the column in S2; the branch lands now keyed on
   unknown-kind.
7. **Same-device creation guard** (R005/R006): creation refuses until the local migration
   has run (version check).
8. **CR-05 deletion + task-item residue sweep:** the legacy in-app creator paths per the
   ruling; one-time sweep disposition for residual `task-item` rows per §2.1's fixture
   class (values preserved by the 4-kind CHECK — the sweep is UI-exposure only).

## Adversarial / verify
- **Three-fixture migration test** (§2.1's fixture classes): pristine pre-widen DB ·
  legacy-widened DB (the live shape) · already-v2 DB — each: migrate → all 5 assertion
  classes incl. `PRAGMA foreign_key_check`, the 11 inbound-FK checks, the cascade probe,
  **trigger-survival assertions** (`nodes_mark_dirty` fires post-migration; rev bumps).
- **The five §2.5.4 cases (a)–(e)** — verbatim from the architecture, incl. (a)'s
  device-B arm and (e)'s typed refusal.
- **Live blast-radius smoke** (regression guard): desk create/open/move/trash/restore,
  plan board, share flow, palette, standup — all identical pre/post.
- **Post-migration live kind test:** per R010, against a disposable/scope-verified
  account ONLY — never Ryan's live personal scope. If no such account exists yet, this
  single verify defers to a named P1 checklist entry (it is the only deferrable item).

## Close
FULL suite + regression guard green · migration idempotence re-run proof · commit
sequence: migration → dispositions → guards → CI locks (separately revertable) ·
ACTIVE-MISSION + handoff.
