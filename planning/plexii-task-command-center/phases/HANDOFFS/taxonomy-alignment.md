# Taxonomy Alignment Stage — close ledger

**2026-08-26 (post-landing round 1) · commit `0ae275bf` on `ryan-command-center`, pushed to
both remotes.** Executes the stage DEC-029a sequenced ("everything else … post-landing per
analysis/22 §5"): the eight primaries, the Respond merge, To Decide, `intent_sub` reserved,
data migration, prompt/test updates, R-03, and the Layer-0 bare manual form. **No new DEC
consumed** — DEC-031+ stays reserved for the CR-09 brainstorm per DEC-030's numbering note.

## What shipped

| Piece | Where |
|---|---|
| Schema values `to_do to_review to_decide to_respond to_meet to_discuss to_remember to_know` (R-01/R-07); labels To Do · Review · Decide · Respond · Meet · Discuss · Remember · Know | `shared/workItems.ts` (one source) → prompts derive their unions from it |
| `acknowledgment` + `direct` → `to_respond`; `to_decide` new, terminal state `'decided'` (projects `done`; old peers coarsen it to `open` — accepted, same as `archived`) | shared + db + queues |
| `LEGACY_INTENT_CLASS_MAP` + `canonicalIntentClass` at EVERY boundary: model output (`normalizeIntentClass` maps forward now), **sync apply** (see incident), renderer reads (`queueOf`), reclassify/updateFields (garbage now REFUSED), badge keys, widget section keys (stored `localStorage` keys map forward) | shared / db / attentionQueues |
| New hard triggers: `decide-verb`, `respond-verb`; **question-mark now files `to_respond`** (analysis/22 §2.6 wart); ACTIONABLE gains to_decide + to_respond (Q1, deadline nudges, ranker thumb) | `intentRules.ts` |
| `migrateIntentTaxonomyV2`: startup value rewrite, pre-imaged per-row in `wi_intent_taxonomy_backup` (reversible across the merge), idempotent, **re-run every boot** (peer-pushed legacy converges); `wi_notifications.queue` remapped; `MIGRATION_VERSION` 2→3 triggers the house VACUUM-INTO restore point | `db/migrateIntentTaxonomy.ts`, `database.ts` |
| `intent_sub` reserved manifest column (emitted + allowlisted + synced + patchable; **no UI writes it** — waits for the question-sets/secondaries era) | manifest → everything derives |
| R-03: `attentionPrecision` denominator excludes `to_know` (+ legacy `fyi` stragglers) | `db/workItems.ts` |
| SQL state predicates now BUILD from shared `ACTIVE_/TERMINAL_WORK_ITEM_STATES` (the five hand-copied IN-lists that drifted per-query are gone) | `db/workItems.ts` |
| `CLASS_CHOICES`/`CLASS_LABEL` centralized in `attentionQueues.ts` — card, console, view import ONE copy (two drifting duplicates removed) | renderer |
| **Layer-0 bare manual form** on the Attention page ("New item"): title + eight-chip picker + optional date/desk (personal, live, unshared desks only) + files through the one `store.create` seam; stays open for serial entry | `AttentionView.tsx` |

## The live pass — including one real incident

Pre-state (operator's real DB): 24 work_items — action 16 / review 3 / loose_thought 3 /
scheduling 1 / discussion 1; 20 class-queued notification rows. Snapshot kept in session
scratchpad; VACUUM backup `pre-migrate-2026-08-26T20-31-18.fbbackup` (512MB) taken by the
version gate.

**Incident (caught live, first boot):** the migration renamed all 24 rows and logged
correctly — then the FIRST sync cycle **reverted every row to legacy**. Mechanism: the
rename push carried a stale `baseRev` → server 409 → the F010 conflict-apply wrote the
server's old-value copy back (values legacy, `needs_sync` cleared, revs advanced; the
device-local notification remap survived, which is what exposed it). The startup migration
alone cannot hold against a mid-session conflict-apply.

**Fix:** `normalizeAppliedWorkItem` (the S2 apply-site normalization every transport
funnels through) now canonicalizes a legacy `intent_class` ON APPLY. The canonicalizing
UPDATE fires the dirty trigger, so the forward value re-pushes next cycle — the fleet
converges FORWARD instead of regressing. Unknown non-legacy values still store verbatim.
Second boot, observed: 24/24 canonical within seconds → **settled clean** (`needs_sync`
0/24, revs 44–51, values held) — the server now carries the canonical vocabulary.

**CDP smoke (port 9223, raw ws client — `puppeteer-core` is NOT installed; the repo's own
`ws` module + Runtime.evaluate works fine and the script pattern lives in the session
scratchpad):** classify('Decide whether…') → `to_decide`/rules · question → `to_respond`/
rules · Attention page renders To Do (8 active) + Discuss with "Discussed", zero legacy
labels · manual form filed "SMOKE-taxonomy bare form" → rendered in the Decide queue →
verified `to_decide`/`human` via IPC → archived (no notification, by design). Screenshot
delivered to the operator. Feature-tour popup ("New: Connected office files") had to be
dismissed first — the documented hazard, still real.

## Gates

`npm run typecheck` 0 errors · `npx vitest run` **2,778 / 274 files** (new baseline; was
2,763/273) — new suites: `migrateIntentTaxonomy.test.ts` (rename, merge, idempotence,
pre-image OR IGNORE, straggler convergence, notifications remap, pre-S2 skip),
apply-site canonicalization in `workItemsProjection`, legacy-map + garbage-refusal in
`workItemsVerbs`, legacy-grouping in `attentionQueues`, `decided` in the projection table.

## Cross-version statement (for the fleet, accepted solo)

An un-updated build receiving `to_*` values stores them verbatim and shows raw keys in its
UI until it updates; its pushes of legacy values now converge forward on updated devices
(the apply-site canonicalization) at the cost of one extra push cycle per straggler row.
An active old-build editor would ping-pong values bounded by its own edit rate — upgrade
both devices together before heavy two-device use. `'decided'`/`'archived'` states coarsen
to `open` on old builds (standing pattern).

## Explicitly NOT in this round (sequenced, not forgotten)

- **R-05** (Meet dual-axis secondaries, Discuss batch-discharge) — schema asymmetries land
  with the `intent_sub` UI / question-sets era (SPEC-027), per analysis/22 §6.
- **Clarification engine + secondaries UI** — SPEC-027 (sender-pays lane).
- **R-04** (notifications-as-items) — own analysis doc before ANY ruling.
- **Layer-0 editing UI + Attention selection mode** — D-I ordering awaits the CR-09
  brainstorm (only the bare form was in this stage's scope per the handoff).
- **DEC-016/019 scoped amendments** (per-class question sets for the recipient lane) —
  must be RULED, P1.

## Housekeeping notes

- The "close the standalone `fix/sync-wake-coalescing` PR" item is **moot**: saasmouth has
  PRs #1–#4, all MERGED, none open (its commit landed inside PR #4; a standalone PR was
  never opened). Nothing to close on the fork either.
- One NEW SMOKE artifact: "SMOKE-taxonomy bare form" sits on the Archived shelf — joins
  the operator's bulk-dismiss pile.
- Pushes: `fork` as ryan-swan, `origin` via `gh auth switch` to ryanswan313 (both landed,
  `gh` restored to ryan-swan).
