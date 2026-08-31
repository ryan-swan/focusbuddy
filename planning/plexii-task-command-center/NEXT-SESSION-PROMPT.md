# Next Session — Resume Prompt

**Last updated:** 2026-08-31 — through DEC-092 (the planner learns the
calendar: padded slots + an adjustable meeting buffer, affinity-scored
placement with visible "Grouped beside" reasons, discretionary clustering
with due-date barriers, and the RESCHEDULE route — "reschedule my day,
split between tomorrow and wednesday" now moves today's remaining blocks
across the named days, replacing them on accept in one undo batch).
DEC-095 restyled the Attention analytics tiles as house material (gloss,
tone ring, hover lift) and found **GAP-020** — six `--ink-*` steps are
referenced but never defined, so ~68 elements silently inherit their
parent's colour (`--ink-80` alone is 52 uses); locked against growth,
cleanup is its own round. DEC-094 restyled the plan review as Book time's sibling (presentation only —
the operator cut a larger redesign spec back to visuals; the cascade,
pinning, locked rows and capacity line were NOT built and remain open ideas
in that spec). DEC-093 made deadline chips draggable onto the grid;
DEC-091 was Phase 3 (context fidelity), DEC-090 plan-intent honesty + time
comprehension. **GAP-019 remains open** (`bg-[var(--token)]/N` invalid CSS,
~40 sites). analysis/27: Phases 1–3 done; Phase 4 gated on operator go;
Phase 5 rulings/process. DECISIONS-LOG carries DEC-072…092 in full.
**Branch:** `ryan-command-center` (push state: check both remotes before
assuming).
**Suite:** 3,460 tests green. Full typecheck clean.
**Operator action still owed (DEC-082):** grant Camera to the app Plexii is
launched from (System Settings → Privacy & Security → Camera) — until then
Meet tiles show the honest "Camera blocked by macOS" note.
**Gated on the operator's go:** the Fireflies-level transcript UI rebuild.

## <<<PROMPT BEGIN>>>

You are resuming **plexii-task-command-center** — the Attention layer (work_items) plus the
Calendar surface, iterating post-landing in PR-sized rounds under the operator's live QA.
You have no memory of prior sessions; everything lives in the repo's planning docs.

Read in order:
1. [ACTIVE-MISSION.md](ACTIVE-MISSION.md) — live state, newest at top
2. [DECISIONS-LOG.md](DECISIONS-LOG.md) — **DEC-001…095**, append-only. DEC-072…095 carry
   the day of post-landing rounds; DEC-056…061 the platform lessons.
3. [analysis/27-DEMO-FEEDBACK-PLAN.md](analysis/27-DEMO-FEEDBACK-PLAN.md) — the demo
   feedback consolidation and 5-phase plan (Phases 1–2 done; Phase 3 = context fidelity)
4. [GAP-REGISTER.md](GAP-REGISTER.md) — GAP-017 (Respond → Messages), GAP-019
   (invalid var()+modifier utilities, ~40 sites) and GAP-020 (undefined ink
   tokens, ~68 sites) are the live ones

Pre-flight:
```bash
cd ~/focusbuddy-plexi && git fetch origin --prune && git fetch fork --prune && git status --short --branch && npm run typecheck && npx vitest run tests/unit
```

---

## Where we left off

**The platform is healthy and that was not free.** Six defects (DEC-056…061) were found
by *measuring the live database*, not by reading code — the suite was green the whole
time. Headlines: an unbounded sync loop costing 10 server writes/minute forever; ~2,500
Events per boot in a store that PLX-EVT-030 forbids ever pruning; a Keychain call on the
boot path that hung the app behind an invisible OS prompt. All fixed, all measured before
and after. **These shipped separately to `main` as [PR #5](https://github.com/saasmouth/focusbuddy/pull/5) — still OPEN and MERGEABLE**, deliberately carrying no
Attention/Calendar work so Caleb and Michael can inherit the fixes without the feature branch.

**The queue's hierarchy was re-baselined (DEC-070).** Four rounds of per-row connector
segments (DEC-062…069) each fixed a seam and produced another. The operator called a
reset and supplied an inspiration component. A subtree is now ONE animated group with ONE
dashed connector — seams are impossible by construction rather than by care. **The tests
now pin the ABSENCE of the old segment machinery. Do not reintroduce per-row line
segments.**

**Meet items point at a meeting (DEC-063/064/068)** — operator ruled option 2. Six manifest
columns, invite-shaped rows, capture flow in the editor, and a link to a real calendar block.

**The day plan is reviewable (DEC-071)** — a centre-peek pane showing which items, when,
and *why*, before anything is booked.

---

## What is next (priority order)

1. **The operator's live QA pass.** This has been the highest-yield loop all build —
   DEC-053, 055, 062, 065, 066, 067, 069, 070 and 071 all came from him looking at the
   screen. Notes come in → reproduce → fix in-stage → gates → commit.

2. ~~Reason text quality~~ **DONE 2026-08-30 (DEC-072).** `reasonFor` is now a
   strongest-checkable-fact ladder (overdue day counts, weekday dues, chosen
   urgency, momentum, already-started, days waited, mode-aware fallbacks incl.
   "Nothing else needs today"); the start strip got the same honesty pass.
   Live-verified over CDP on real data: 7 proposals, 6 distinct reasons, zero
   generic strings. 15 new pins; suite 3,211.

3. **SPEC-002 "The Attendant" — written up 2026-08-30; rulings not made.**
   The spec is preserved verbatim in
   [analysis/25](analysis/25-SPEC-002-ATTENDANT-RAW.md); the comparison was
   rebuilt against the code (not transcribed) in
   [analysis/26](analysis/26-SPEC-002-ATTENDANT-COMPARISON.md) — a REVIEW
   BACKLOG: potential items to adopt gradually, nothing authorized. Headlines:
   THREE spec corrections now (§3.7 velocity refined, §3.10 refined, §4.3
   trashNode claim stale — already fixed), the spec's self-assigned DEC/CR
   numbers all collide with the live log, ranked adoption candidates
   (export first), six recommended refusals each anchored to a standing DEC,
   and the Inbox↔Today wall question framed for a ruling (analysis/26 §7).

4. **GAP-017 — Respond → Messages.** Operator explicitly deferred: investigate the
   messaging surface FIRST. Do not rename a taxonomy primary; it is a schema and
   migration event, not a label edit.

5. **Still open from DEC-052:** Track C (external calendar sync — foundation laid, build
   deferred by ruling) and Track D tiers 3a/3b (email completion signals over the existing
   IMAP, then Slack behind an OAuth layer that does not exist yet — audit confirmed).

6. **Landing decision (operator's call):** 71 commits sit unmerged to `main`, flag-OFF for
   the team. PR #5 already carries the platform fixes, so nothing is blocked on this.

---

## Working rules that earned their place this build

- **Measure the live DB before believing the code.** Every platform defect was invisible to
  a green suite. `sqlite3 "file:$DB?mode=ro"` — always read-only, always back up first.
- **Verify by measurement, not screenshots.** The queue re-renders and scrolls between
  positioning and capture; clipped screenshots repeatedly landed on the wrong rows and
  twice produced a *confidently wrong* conclusion. `getBoundingClientRect` /
  `getComputedStyle` over CDP is the reliable evidence. Full-viewport shots don't drift; clips do.
- **A pin that a legitimate change breaks should be rewritten to the superseding truth,
  never deleted.** Several were, and each carries its history in the comment.
- **Main-process edits need an Electron restart**, not HMR. Renderer edits hot-reload.
- **Dual-remote push:** `git push fork …` as ryan-swan, then `gh auth switch -u ryanswan313`
  → `git push origin …` → switch back.
- **Disclose live-data changes.** Test values were written to real items three times this
  build and cleared each time; the record is in the transcript and the commits.

## <<<PROMPT END>>>
