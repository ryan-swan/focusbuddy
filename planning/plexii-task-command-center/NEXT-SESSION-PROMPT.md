# Next Session — Resume Prompt (post-alignment handoff)

**Last updated:** 2026-08-26, end of the taxonomy-alignment session. **The Attention
layer is LANDED on `saasmouth/focusbuddy` main** (PR #4, main @ `c0e32a0c`, CI green,
default-OFF via `workItems.enabled`; the operator's device has it ON). **Post-landing
round 1 is DONE on the branch:** the category alignment stage (eight primaries, migration,
manual form) shipped as `0ae275bf` — branch only, both remotes; **not yet PR'd to main**
(the operator chooses when a round lands, DEC-030). He still owes Michael + Caleb the WIP
framing note ("off by default, don't toggle yet").

## <<<PROMPT BEGIN>>>

You are resuming **plexii-task-command-center** — the initiative that built and LANDED
the Attention layer (work_items) in Plexii/PlexiDesk, now iterating post-landing in
PR-sized rounds. You have no memory of prior sessions; everything lives in the repo's
planning docs. Read in order: [ACTIVE-MISSION.md](ACTIVE-MISSION.md) (source of truth,
newest at top) → [DECISIONS-LOG.md](DECISIONS-LOG.md) (DEC-001…030, append-only) →
[phases/HANDOFFS/taxonomy-alignment.md](phases/HANDOFFS/taxonomy-alignment.md) (the
just-executed round: eight primaries, the sync-revert incident + convergence rule, new
baseline). For the open analysis threads read
[analysis/21-CR09-CONTEXTUAL-ATTENTION.md](analysis/21-CR09-CONTEXTUAL-ATTENTION.md) and
[analysis/22-CATEGORY-MODEL-REVIEW.md](analysis/22-CATEGORY-MODEL-REVIEW.md).

Pre-flight:
```bash
cd ~/focusbuddy-plexi && git fetch origin --prune && git fetch fork --prune && git status --short --branch && git rev-list --left-right --count ryan-command-center...origin/main && npm run typecheck
```
(Left side = our unmerged round(s) + planning commits; right side = team commits on main —
log any, merge only by decision.)

### Where we left off → what is next (priority order)

1. **The operator's own detailed pass through the layer.** His stated focus — now
   INCLUDING the renamed queues (To Do / Review / Decide / Respond / Meet / Discuss /
   Remember / Know) and the new bare manual form. Live QA notes come in → reproduce →
   fix in-stage → gates → commit. The standing loop.
2. **CR-09 brainstorm → DEC-031+.** Decision list **D-A…D-K** in analysis/21 (Part I:
   object-marking presets — note the preset table's classes now read in the NEW
   vocabulary (slack→to_respond/follow-up, doc→to_review, sticky→to_remember…) —
   widget scoping desk/room/all, the plan boundary "items point · scopes group · plans
   are CHOSEN", context-menu IA; Part II: the two-layer LAW, pull-not-push, the
   ProposalTray, Living-Doc + Meetings observers, the D-I Layer-0 gap ORDER). NOTHING
   from CR-09 gets built until the operator rules.
3. **Landing round decision (operator's call):** PR the alignment round (`0ae275bf` +
   planning) to main when he wants it live for the team — branch push + PR +
   `gh pr merge` as `ryanswan313` is the proven pattern. Until then main still speaks
   the OLD schema values; that is fine (flag-OFF for the team, and the branch's
   apply-site canonicalization converges anything they might someday push).
4. **Layer-0 gaps remaining** (analysis/21 Part II §12): post-creation item **editing
   UI** (db `updateFields` exists — now also validates classes; no surface) ·
   Attention-page **selection mode** (index engine's bulk pattern is reusable). The
   bare manual form SHIPPED with the alignment. D-I asks the operator to confirm this
   order.
5. **Observers:** Living Doc first (extract → `approval_state='suggested'` →
   ProposalTray), Meetings second (vocabulary + `meeting_end` purpose shipped;
   owner/due extraction missing). Blocked on the CR-09 rulings (D-G/D-H).
6. **R-04 (notifications-as-items) needs its own analysis doc** before any ruling;
   **R-05** (Meet dual-axis, Discuss batch discharge) lands with the `intent_sub`
   UI / SPEC-027 era.
7. **Outstanding hand-smokes:** chat @attention → Tab → type → Enter → inline card
   (end-to-end feel) · the shared-desk menu branch next time a desk is shared · a
   capture wearing the NEW classes end-to-end with the AI key (model fallback path —
   rules paths are CDP-verified).
8. **Housekeeping:** the operator may bulk-dismiss the SMOKE-prefixed artifacts (one
   NEW one sits on the Archived shelf: "SMOKE-taxonomy bare form") · hand Caleb
   UPSTREAM-PR-PACKAGE.md §4 (F-1 initial-pull truncation matters most) · the WIP
   framing note to Michael + Caleb (drafted, unsent) · the sync-wake PR item is MOOT
   (PRs #1–4 all merged, none open).
9. **SPEC-027 / P1 era (later):** recipient routing, the clarification lane +
   per-class question sets (needs scoped DEC-016/019 amendments RULED), delegation
   ownership (R-02), the migrated-peer attestation gate (built, waiting), the frozen
   retention rule.

### Environment + protocols (the operational contract)

- **Repo:** `~/focusbuddy-plexi`, branch `ryan-command-center`. Remotes: `origin` =
  saasmouth/focusbuddy (shared, main ships to users), `fork` = ryan-swan/focusbuddy.
  Commit to the branch and push to BOTH remotes' same-named branch. **Landing on main =
  branch push + PR + `gh pr merge` as `ryanswan313`** — raw `git push origin …:main` is
  classifier-blocked for the assistant (operator-run only). Never commit
  `package-lock.json`, logs, or DB files.
- **Accounts:** `gh` holds `ryan-swan` (fork owner, HAS `workflow` scope, usually
  active) and `ryanswan313` (saasmouth WRITE, NO `workflow` scope). `gh auth switch
  --user ryanswan313` for saasmouth pushes; switch back after. Browser GitHub sessions
  default to ryan-swan. Memory: `plexii-repo-ownership-and-push-rules`.
- **Live app:** dev app runs on the operator's REAL DB
  (`~/Library/Application Support/focusbuddy/focusbuddy.db`) — SACRED: reads only via
  `sqlite3 "file:...?mode=ro"`, writes only through the app. Restart:
  `kill $(lsof -t "$DB")` → relaunch. **CDP smoke driving:**
  `env -u ELECTRON_RUN_AS_NODE npx electron-vite dev -- --remote-debugging-port=9223`;
  `puppeteer-core` is NOT installed — a raw client on the repo's own `ws` module +
  `Runtime.evaluate` works (pattern in the taxonomy-alignment ledger); beware the
  feature-tour popup and sync churn.
- **Gates on every change:** `npm run typecheck` (0 errors) · `npx vitest run`
  (baseline **2,778 / 274 files**) · live app verification · commit. Tests touching
  node:sqlite need `// @vitest-environment node` as line 1.
- **Worktree for fix-splits:** `~/focusbuddy-groundwork` (branch `groundwork-fixes`).

Close discipline: end every session by updating ACTIVE-MISSION.md, regenerating this
file, and dropping a handoff note in `phases/HANDOFFS/`.

Locked decisions (don't relitigate — full text in DECISIONS-LOG): DEC-007 work items
are nodes · **DEC-011 the entity is `work_item`; "task" means DESK in all AI
vocabulary** · DEC-012 the surface is "Attention" · DEC-016 F008 one-code-path (all
work_item writes via `db/workItems.ts`; CI grep-locks the four sanctioned delete
sites) · DEC-021/022 delete contract · DEC-024 quiet archive · DEC-028
AttentionConfirmCard is THE one confirm stop · **DEC-029a taxonomy tests T-1…T-5 +
anti-collision are LAW; the alignment stage they sequenced is now EXECUTED — schema
classes are `to_do/to_review/to_decide/to_respond/to_meet/to_discuss/to_remember/
to_know`, legacy values map forward via `LEGACY_INTENT_CLASS_MAP`, and
`normalizeAppliedWorkItem` canonicalizes ON APPLY (the anti-revert convergence rule —
do not remove it; a 409 conflict-apply regressed the rename live without it)** ·
**DEC-030 leave it landed; iteration in PR-sized rounds; restate big irreversible
actions concretely + get fresh confirmation — never act on a codeword alone; DEC-031+
reserved for the CR-09 brainstorm.**

Absolute constraints: the live DB is read-only outside the app · ambiguity becomes a
logged question, never a guess · every "verified" claim carries its verify-command ·
PRESERVATION-DOCTRINE governs: core Plexii functionality is inviolable,
rebuild-vs-preserve crossroads go to the operator.

## <<<PROMPT END>>>
