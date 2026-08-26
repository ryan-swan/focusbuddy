# Parallel Track — Desk Lifecycle (CR-07 Option B) — Tactical Plan

**Strategic spec:** SPEC-042 (A-07: "ratify and complete, not invent") + DEC-013 (memory
contract shape) + BUG-C1-01/04 fixes · **Status:** PLAN DRAFTED — two design points below
await operator approval; build may start on the approval-free items immediately.
**Gate:** desks have a working, discoverable lifecycle (archive · trash-with-memory-choice ·
restore) honoring DEC-013; shared desks protected; derived `stale` available to Attention.
**Must land before:** Phase 5 (S6 Stale Desks content, S7 stale nudges).
**Closes:** the desk half of GAP-001's lifecycle debt · BUG-C1-01 · feeds SPEC-024/017.

## Diagnosis (2026-08-25, verified)

"Desks cannot be deleted" is a **pure exposure gap** — the machinery is complete and idle:

| Layer | State | Evidence |
|---|---|---|
| Data | ✅ complete | `trashed_at` soft-delete + recursive trash, `restoreNodes`, 7-day `purgeTrashedNodes`, `archived` column, `updateNode` accepts `archived` (`db/nodes.ts`) |
| IPC/store | ✅ complete | `nodes:delete/restore`; store `remove` (with WS01 tombstoning) + `update` |
| UI | ❌ **absent** | The ONLY archive setters in the app: `dashboard/FoldersCard.tsx:278/:281` — inside the **orphaned** portlet dashboard normal navigation never mounts. Only delete caller: `PlexiProjectsView.tsx:943` (plan rows). DesksView / RoomsView / DeskGallery / StageManagerStrip / CanvasBreadcrumb expose **no context menu and no lifecycle action at all** |

Consequence: the fix is ADDITIVE UI + one guard + one dialog — no data-layer rebuild.

## Design points for operator approval (per DEC-013's "returns for design approval")

**D1 — Shared-desk deletion, v1 default.** PROPOSAL: shared desks **cannot be hard-deleted
or trashed unilaterally in v1** — the menu offers *Archive for me* (local `archived` flag;
scope-local, does not sync the desk away from others — verify flag scope in build) and
*Leave share* (existing share machinery); the trash action is disabled with the reason
shown ("Shared with Caleb and Michael — leave or archive instead"). All-participants-approve
deletion = P1 flow rehearsal alongside routing. Rationale: simplest rule that fully closes
the SPEC-043 shared case; zero consent infrastructure needed at v1.

**D2 — "Delete permanently" purge semantics.** PROPOSAL: the DEC-013 choice dialog's purge
option removes, for the trashed desk id: its `fb_memory` rows (via a new
`purgeMemoryForSubject(subjectIds)`), its brain-ingested document derivations, and its
ContextObject/attention artifacts — then hard-deletes the rows immediately (skipping the
7-day window the user just opted out of). "Preserve in memory" (default) = today's exact
behavior, finally stated in UI copy. Purge ships behind a typed confirmation and logs a
summary of what was removed. (Scope note: purge machinery is the one genuinely new piece —
A-05.)

## Build steps (file-by-file; L# = lifecycle stage)

**L1 — Surface the lifecycle (approval-free; starts immediately after G3 bandwidth allows)**
1. `components/NodeLifecycleMenu.tsx` (new) — one shared context/⋯ menu: Archive /
   Unarchive · Move to Trash · Restore · (shared: Archive for me / Leave share) — plexi
   primitives, tokens, four themes. *Test: menu renders per state matrix.*
2. Wire it into `DeskGallery`, `DesksView`, `RoomsView`, `StageManagerStrip` cards and
   `CanvasBreadcrumb`'s current-node menu. *Test: live smoke each surface.*
3. `views/TrashView.tsx` (new, small) — trashed items list + Restore + days-remaining;
   sidebar entry (both rail states). *Test: trash→restore round trip live.*
4. Archived visibility: an "Archived" filter chip on DesksView/RoomsView (flag + filters
   already exist). *Test: archive→hidden→chip→visible.*

**L2 — The DEC-013 dialog + guards**
5. `components/DeleteDeskDialog.tsx` (new) — the memory-choice dialog (Preserve in
   memory [default] / Delete everything permanently / Cancel), copy stating the contract.
   *Test: choice routing.*
6. `db/nodes.ts` — `trashNode` gains the shared-guard (refuse when `shared_root_id` set →
   typed error the menu renders as D1's reason) and the kind-aware **detach** policy
   (ARCHITECTURE v2 §2.5 — work_item children are detached `parent_id=NULL`, never merely
   skipped: the FK cascade on hard delete cannot be kind-filtered) **lands here if S1
   hasn't shipped yet** (single owner: whichever lands first carries it, incl. the
   purge/agentHistory belt-and-braces).
   *Adversarial tests: unilateral shared trash refused; the purge-survival test (trash →
   +7 days → purge → work_item alive and orphan-graceful).*
7. Purge path (D2): `db/memoryPurge.ts` (new) + `nodes:deletePermanent` IPC + immediate
   hard-delete. *Adversarial test: purge removes exactly the subject's memory rows and
   nothing else; preserve-path leaves memory bit-identical.*

**L3 — Derived stale**
8. `main/db/nodeActivity.ts` (new, read-only) — `staleDesks(thresholdDays)`: desks with no
   node/widget/document update and no activity_log rows within N days, not archived, not
   done. Computed, never stored (Attention reads it; desks own the definition).
   *Test: fixture matrix (fresh/stale/archived/done).*

**Sequencing:** L1 has no dependencies and no approvals — pure additive UI on verified
machinery. L2 needs D1+D2 approval. L3 is independent. Track runs interleaved with the
Attention build's S-stages on operator priority; everything here is ADDITIVE or a guard.

## Done when
- [x] All five surfaces expose the menu (L1, S6) · trash/restore/archive round-trips
  verified live (L1) · D1 guard refuses unilateral shared trash (DEC-021: typed
  refusal at deleteNode + purge; menu = Archive-for-me [scope-local] / Leave-share) ·
  DEC-013 dialog ships with stated contract (`lib/deleteDeskFlow.ts`) · purge
  adversarially verified (`tests/unit/deskPurge.test.ts` — exact scope, bystanders
  bit-identical, work_item revive) · `staleDesks()` feeding-ready (L3 → S7 feeders) ·
  suites + typecheck green · ACTIVE-MISSION updated. **TRACK COMPLETE 2026-08-25
  (DEC-021).** Residual: live smoke of the dialog + shared-menu branch on the next
  operator session; the native-fit eyeball rides it.
