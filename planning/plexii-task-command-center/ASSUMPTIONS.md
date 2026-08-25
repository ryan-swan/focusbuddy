# Assumption Register

<!-- Agent-OS assumption-tracking adapted to markdown (this initiative doesn't write the
     canonical JSONL). Log assumptions that are load-bearing + falsifiable + not yet registered.
     OPEN -> VALIDATED / INVALIDATED. An INVALIDATED assumption halts dependent work until the
     operator issues go/no-go — no agent continues past it unilaterally. -->

## A-001 — Caleb's `main` stays fast-moving but won't collide with command-center files
**Status:** OPEN · **Confidence at creation:** 0.70 · **Created:** 2026-08-24
**Text:** Origin `main` will keep receiving daily pushes, but Caleb's active areas (A-series
UI/agent work) won't structurally conflict with the new task/notification/dashboard modules
before this initiative's first merge-from-main.
**Dependent work:** every Phase 6 stage; the merge cadence decision.
**Invalidation trigger:** a fetch shows origin/main commits touching `homeWidgetDefs.ts`,
`HomeDashboard.tsx`, `database.ts` SCHEMA, or a native tasks/notifications feature of his own.
**On invalidation:** halt the affected stage; re-run gap analysis on the touched area; operator
go/no-go on rebase-vs-redesign; log DEC-NNN.

## A-002 — This feature may never ship into the app
**Status:** OPEN (by design) · **Confidence:** n/a — this is a planning stance, tracked so no
step assumes permanence. · **Created:** 2026-08-24
**Text:** Whether the work merges to origin depends on testing; the fork branch is the
containment boundary.
**Dependent work:** architecture choices must stay reversible (additive migrations, feature
gating via the existing capability system), and nothing lands on origin.
**Invalidation trigger:** operator decides "this ships" (→ plan the PR/merge path, tighten
migration discipline for other users' databases) or "this dies" (→ archive the branch +
mission-control; harvest learnings).

## A-003 — The existing org/sync layer can carry shared task state
**Status:** **VALIDATED 2026-08-24 23:21** — live round-trip proof: the server stores and
echoes unknown node columns intact (analysis/12-SYNC-SERVER-PROOF.md; operator-run,
personal scope, zero trace). Residual: unknown-kind direct confirmation post-migration
(inference strong; itemType stays 'node'). · **Confidence:** 0.55 → 0.85 → **0.97** ·
**Created:** 2026-08-24
**Text:** "Shared collaboratively" can be built on the app's existing sync substrate without
a new sync engine.
**Evidence found:** server-mediated multi-device sync with CRDT convergence
(`src/main/db/workspaceSync.ts`, `src/shared/crdt.ts`); per-row `sync_rev`/`needs_sync` via
DB triggers; synced-table whitelist **includes `nodes` and `time_blocks`**; org/team/per-desk
ACL scoping; full social layer (messaging, presence, knock, org directory, shares w/ live docs).
**Narrowed residual unknown (updated 2026-08-24 night):** the CLIENT half is now evidenced
from code (analysis/10 §5: `bodyFromRow` copies all non-bookkeeping columns opaquely; pull
appliers build column lists from `PRAGMA table_info` — new columns and kinds ride
by-construction). Remaining: the **server** (does it store/echo unknown kinds + columns
opaquely?) plus one live end-to-end confirmation. New hazard regardless of the answer:
GAP-013 (un-migrated peers silently reject unknown kinds — migration must lead).
**Dependent work:** Ruling 1 ratification (G4), person-to-person routing architecture (P1).
**Invalidation trigger (narrowed):** Phase 2 proves the server schema-validates node bodies
strictly (new columns dropped/rejected on sync).
**On invalidation:** schema fork flips toward new-table + server coordination with Caleb;
collaboration scope gets an explicit operator decision.

## A-004 — Node v25 (vs. required 20–22) doesn't distort dev-loop behavior
**Status:** OPEN · **Confidence at creation:** 0.80 · **Created:** 2026-08-24
**Text:** The engine-version mismatch on this machine affects nothing but the npm warning;
dev, HMR, tests, and builds behave as they would on Node 20–22.
**Dependent work:** trusting local test/verification results at every gate.
**Invalidation trigger:** any unexplained runtime/build anomaly; first response is to retry
under Node 22 (nvm) before debugging the code.

## A-006 — The Calendar tab has ~zero real usage
**Status:** OPEN · **Confidence at creation:** 0.75 (operator-stated for their own use; other
users unverified) · **Created:** 2026-08-24
**Text:** "Nobody currently uses the calendar tab in the left panel menu" (operator,
2026-08-24) — so a ground-up rebuild of the Calendar surface is low-risk to existing users
if the spec needs it.
**Dependent work:** any crossroads ruling that rebuilds/replaces CalendarView; Phase 3
surface strategy.
**Invalidation trigger:** evidence of real calendar usage — Caleb/Michael report using it,
release notes advertise it, or usage telemetry (if any exists) shows activity. PlexiDesk has
real external releases (4.0.16 assets on GitHub), so "nobody" extends beyond this machine —
verify before a destructive rebuild ships beyond the fork.
**On invalidation:** the calendar crossroads ruling gets re-presented with the usage evidence;
rebuild may still win, but with a migration/compat plan instead of a clean replace.

## A-005 — The Command-Center Map remains accurate at the anchor level
**Status:** OPEN · **Confidence at creation:** 0.85 · **Created:** 2026-08-24
**Text:** The map (surveyed @ a92b30cb) correctly describes the architecture; exact line
numbers drift with Caleb's pushes but the structures and traps hold.
**Dependent work:** Phase 2 classification efficiency (map as index).
**Invalidation trigger:** any Phase 2 live-grep contradicting a map claim → correct the map
in place, re-verify neighboring claims, and note it in the phase handoff.
