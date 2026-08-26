# Next Session — Resume Prompt (post-landing handoff)

**Last updated:** 2026-08-26, end of the landing session. **The Attention layer
is LANDED on `saasmouth/focusbuddy` main** (PR #4, main @ `c0e32a0c`, main CI
green, 91 commits / 172 files / 2,763 tests). It ships **default-OFF**
(`workItems.enabled` — Settings → AI → Attention layer); the operator's device
has it ON. **DEC-030:** "declare ready" was a misunderstanding, the operator
ruled LEAVE IT LANDED; iteration continues in PR-sized rounds. He still owes
Michael + Caleb the WIP framing note ("off by default, don't toggle yet").

## <<<PROMPT BEGIN>>>

You are resuming **plexii-task-command-center** — the initiative that built and
LANDED the Attention layer (work_items) in Plexii/PlexiDesk. You have no memory
of prior sessions; everything lives in the repo's planning docs. Read in order:
[ACTIVE-MISSION.md](ACTIVE-MISSION.md) (source of truth, newest at top) →
[DECISIONS-LOG.md](DECISIONS-LOG.md) (DEC-001…030, append-only) →
[UPSTREAM-PR-PACKAGE.md](UPSTREAM-PR-PACKAGE.md) (the landing record + findings
F-1…F-9 for Caleb). For the two open analysis threads read
[analysis/21-CR09-CONTEXTUAL-ATTENTION.md](analysis/21-CR09-CONTEXTUAL-ATTENTION.md)
and [analysis/22-CATEGORY-MODEL-REVIEW.md](analysis/22-CATEGORY-MODEL-REVIEW.md).

Pre-flight:
```bash
cd ~/focusbuddy-plexi && git fetch origin fork --prune && git status --short --branch && git rev-list --left-right --count ryan-command-center...origin/main && npm run typecheck
```
(Branch content == main at landing; any right-side count is new team commits —
log it, merge only by decision.)

### Where we left off → what is next (priority order)

1. **The operator's own detailed pass through the layer.** His stated focus.
   Live QA notes come in → reproduce → fix in-stage → gates → commit. The
   standing loop that built the whole layer.
2. **CR-09 brainstorm → DEC-031+.** Decision list **D-A…D-K** in analysis/21
   (Part I: object-marking presets, widget scoping desk/room/all, the plan
   boundary "items point · scopes group · plans are CHOSEN", context-menu IA;
   Part II: the two-layer LAW — manual complete, AI only pre-fills/proposes —
   pull-not-push, the ProposalTray, Living-Doc + Meetings observers). NOTHING
   from CR-09 gets built until the operator rules.
3. **Category alignment stage** (analysis/22 §5): rename to the eight
   primaries (To Do / Review / **Decide** / Respond / Meet / Discuss /
   Remember / Know; acknowledgment+direct merge into Respond), reserve
   `intent_sub`, data migration + prompt/test updates, R-03 precision fix,
   and the Layer-0 bare manual form. The five taxonomy tests + anti-collision
   are already LAW (DEC-029a); the clarification engine + secondaries UI wait
   for SPEC-027; **R-04 (notifications-as-items) needs its own analysis first.**
4. **Layer-0 gaps** (analysis/21 Part II §12): post-creation item **editing
   UI** (db `updateFields` exists, no surface) · Attention-page **selection
   mode** (index engine's bulk pattern is reusable) · the **bare manual form**.
5. **Observers:** Living Doc first (extract → `approval_state='suggested'` →
   ProposalTray), Meetings second (vocabulary + `meeting_end` purpose already
   shipped; owner/due extraction missing).
6. **Outstanding hand-smokes:** chat @attention → Tab → type → Enter →
   inline card (the F-9 keyboard fix landed; end-to-end feel unverified) ·
   the shared-desk menu branch (Archive-for-me / Leave-share) next time a
   desk is actually shared.
7. **Housekeeping:** close the now-redundant standalone `fix/sync-wake-coalescing`
   PR (its commit landed inside PR #4) · the operator may bulk-dismiss the
   SMOKE-prefixed test artifacts on his Attention page · hand Caleb
   UPSTREAM-PR-PACKAGE.md §4 (F-1 initial-pull truncation matters most).
8. **SPEC-027 / P1 era (later):** recipient routing, the clarification lane,
   delegation ownership (R-02), the migrated-peer attestation gate (built,
   waiting), the frozen retention rule.

### Environment + protocols (the operational contract)

- **Repo:** `~/focusbuddy-plexi`, branch `ryan-command-center`. Remotes:
  `origin` = saasmouth/focusbuddy (shared, main ships to users), `fork` =
  ryan-swan/focusbuddy. Commit to the branch and push to BOTH remotes'
  same-named branch. **Landing on main = branch push + PR + `gh pr merge` as
  `ryanswan313`** — raw `git push origin …:main` is classifier-blocked for the
  assistant (operator-run only). Never commit `package-lock.json`, logs, or DB
  files.
- **Accounts:** `gh` holds `ryan-swan` (fork owner, HAS `workflow` scope,
  usually active) and `ryanswan313` (saasmouth WRITE, NO `workflow` scope —
  workflow-file changes ship from the fork or the browser). Browser GitHub
  sessions default to ryan-swan; device-code auth lands scopes on the
  BROWSER's account. Memory: `plexii-repo-ownership-and-push-rules`.
- **Live app:** dev app runs on the operator's REAL DB
  (`~/Library/Application Support/focusbuddy/focusbuddy.db`) — SACRED: reads
  only via `sqlite3 "file:...?mode=ro"`, writes only through the app.
  Restart: `kill $(lsof -t "$DB")` → `npm run dev` (background) → wait for
  "start electron app". **CDP smoke driving:** relaunch with
  `env -u ELECTRON_RUN_AS_NODE npx electron-vite dev -- --remote-debugging-port=9223`
  + puppeteer-core; beware the feature-tour popup and sync churn.
- **Gates on every change:** `npm run typecheck` (0 errors) · `npx vitest run`
  (baseline **2,763 / 273 files**) · live app verification · commit. Tests
  touching node:sqlite need `// @vitest-environment node` as line 1.
- **Worktree for fix-splits:** `~/focusbuddy-groundwork` (branch
  `groundwork-fixes`).

Close discipline: end every session by updating ACTIVE-MISSION.md,
regenerating this file, and dropping a handoff note in `phases/HANDOFFS/`.

Locked decisions (don't relitigate — full text in DECISIONS-LOG): DEC-007
work items are nodes · **DEC-011 the entity is `work_item`; "task" means DESK
in all AI vocabulary** · DEC-012 the surface is "Attention" · DEC-016 F008
one-code-path (all work_item writes via `db/workItems.ts`; CI grep-locks the
four sanctioned delete sites) · DEC-021/022 delete contract (direct
Move-to-Trash; permanent delete only on the Trash page, typed confirm, items
revive; shared desks never unilaterally trashed) · DEC-024 quiet archive ·
DEC-028 AttentionConfirmCard is THE one confirm stop · DEC-029a taxonomy
tests T-1…T-5 + anti-collision are LAW; R-06 confirmed · **DEC-030 leave it
landed; restate big irreversible actions concretely + get fresh confirmation
before executing — never act on a codeword alone.**

Absolute constraints: the live DB is read-only outside the app · ambiguity
becomes a logged question, never a guess · every "verified" claim carries its
verify-command · PRESERVATION-DOCTRINE governs: core Plexii functionality is
inviolable, rebuild-vs-preserve crossroads go to the operator.

## <<<PROMPT END>>>
