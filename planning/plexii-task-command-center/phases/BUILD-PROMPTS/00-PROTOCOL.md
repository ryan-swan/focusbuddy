# Build-Prompt Protocol — read before executing ANY stage

**Authority:** [ARCHITECTURE.md](../../ARCHITECTURE.md) **v2.3 (APPROVED)** governs every
stage. If a prompt and the architecture disagree, the architecture wins and the conflict is
surfaced to the operator before proceeding. If the CODE and the architecture disagree
(Caleb's main moved under us), stop and surface — do not silently adapt.

## The quarantine card (never violate, any stage)

| Term | Means | Never |
|---|---|---|
| node `kind='task'` | a **Desk** | a to-do |
| node `kind='folder'` | Room (Plan when `isPlan=1`) | — |
| `create-task` (wire) | create-a-desk — **FROZEN** (saved Flows parse it) | repurpose or rename |
| `CommandCenter.tsx` | the ⌘K palette | the new surface |
| `work_item` | the ONLY new kind; the new entity everywhere | "task" in code/copy for the new entity |
| "Attention" | the surface name (DEC-012) | "Signal" / "Inbox" / "Flow" |

## Per-stage loop (§7)

1. **Pre-flight** — clean tree on `ryan-command-center`; prior stage's close-commit
   present; `npm run typecheck` and the unit suite green BEFORE touching anything; read the
   stage's "Read first" list; dev app running (task port 5173) for HMR stages.
2. **Build** — the stage's numbered items, smallest-diff-first. Match surrounding idiom.
3. **Typecheck + unit green** — no stage proceeds past a red suite.
4. **Adversarial tests** — the stage's named cases are WRITTEN AND RUN in-stage, never
   deferred. They are refutation attempts, not demos.
5. **Rubric** — QUALITY-FRAMEWORK dimensions; UI stages add the six-point native-fit check
   (DESIGN-FIDELITY.md; repo `DESIGN_SYSTEM.md` is the law). Score honestly; a failing
   dimension blocks close.
6. **Live HMR verification** — exercise the change in the running app; screenshot or
   log-proof for the close report. Never ask the operator to check manually.
7. **Close** — commit + push to fork (`fork ryan-command-center`); update
   [ACTIVE-MISSION.md](../../ACTIVE-MISSION.md) + a HANDOFFS note; state resolved-vs-known-
   remaining honestly.

**RESHAPE/FOUNDATIONAL stages (S1, S2) add:** the regression guard — before close, run the
FULL existing suite plus a manual pass of the top blast-radius surfaces from analysis/10
(desk create/open/move, plan board, share flow, palette, standup).

## Standing rules

- **Branch:** `ryan-command-center`, pushed to `ryan-swan/focusbuddy` (fork) only. NEVER
  push to `saasmouth` origin. Sync-engine diffs get the Caleb-flag treatment: isolated
  commits, marked for upstreaming, behind `workItems.enabled` where applicable.
- **Never commit** `package-lock.json` (unless deliberately adding a dep), `*.log`, DB
  files (excluded via `.git/info/exclude`).
- **Preservation doctrine** (PRESERVATION-DOCTRINE.md): core Plexii behavior is inviolable;
  anything that changes an existing surface's behavior beyond the approved contents goes
  through the Crossroads Protocol — present options, wait for the operator.
- **Live DB is sacred:** no direct sqlite writes to the running app's DB from the session.
  Migrations run through the app. Proof scripts go through operator-run one-click blocks.
- **Wire protocol frozen:** no changes to existing message names/shapes. New verbs only
  (`create-work-item` etc. per S0).
- **Confidence blocks:** any <0.65 on a critical claim = stop, verify in code, or surface.
- **DEC-015 scope:** autopilot covers executing these stages in order once the operator
  green-lights Phase 6. Stage-to-stage needs no per-gate sign-off; NEW scope does.

## Cross-stage dependency edges (§7 F-m4)

Sequential order is the default. Non-adjacent edges: **S0 → S5** (classifier vocabulary) ·
**S2 → S4** (badge model reads `work_item_state`) · **S3 → S6** (surfaces need
`workItems:*`) · **S4 → S5 + S7** (closure notification; nudges) · **lifecycle track L1–L3
→ only S6's Stale-Desks content** (renders gracefully-empty until then).

## Ruling dependencies still open (do not block S0–S4)

D1 (shared-desk delete default) + D2 (purge semantics) → lifecycle L2 only ·
R008 (work_item delete contract) → §2.5.10's no-hard-delete v1 rule already stands ·
R012 (lifecycle-before-Phase-5 reading) → scheduling only · Q1/Q7 → **already ruled**
(approved 2026-08-24; parameters in analysis/16, folded into §6/DEC-016).
