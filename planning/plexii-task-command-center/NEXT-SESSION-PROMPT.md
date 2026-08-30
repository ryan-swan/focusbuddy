# Next Session — Resume Prompt

**Last updated:** 2026-08-30, end of the Attention/Calendar + platform-stability build.
**Branch:** `ryan-command-center` — clean, **71 commits ahead of `origin/main`**, pushed to
BOTH remotes (`fork` = ryan-swan, `origin` = saasmouth) at `4dc603de`.
**Suite:** 3,196 tests / 304 files green. Both typechecks clean.
**Live app:** boots in ~3s (was hanging indefinitely — DEC-060).

## <<<PROMPT BEGIN>>>

You are resuming **plexii-task-command-center** — the Attention layer (work_items) plus the
Calendar surface, iterating post-landing in PR-sized rounds under the operator's live QA.
You have no memory of prior sessions; everything lives in the repo's planning docs.

Read in order:
1. [ACTIVE-MISSION.md](ACTIVE-MISSION.md) — live state, newest at top
2. [DECISIONS-LOG.md](DECISIONS-LOG.md) — **DEC-001…071**, append-only. The last four
   entries (DEC-062…071) carry the most load-bearing lessons of the recent build.
3. [GAP-REGISTER.md](GAP-REGISTER.md) — GAP-017 is the live one (Respond → Messages)

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

2. **Reason text quality (cheap, visible).** DEC-071 surfaced `PlannedProposal.reason` for
   the first time and it reads thin — both blocks in the operator's test came back "Top of
   the queue". The plumbing is done; the strings are generic. Make them say something
   ("nothing else needs Thursday morning", "your momentum is on LakeDash").

3. **SPEC-002 "The Attendant" comparison — analysis delivered, rulings not made.**
   A full side-by-side against the built system was produced this session (in the
   transcript, not yet a doc — **worth writing up**). Summary of that analysis:
   - **Already built:** the 8 categories, reference-don't-own, propose-never-apply,
     a rate-capped notification substrate (`QUEUE_HOURLY_CAP = 5`, overflow collapses
     to one summary banner), `EscalationLayer = ambient|inbox|interruptive`, the S7
     "one proactive trigger" restraint doctrine, human-in-loop completion,
     `attentionPrecision()`, quiet-wins analytics.
   - **Two spec claims are WRONG and should be corrected before any ruling:** §3.7 says
     PlexiDesk already tracks estimate accuracy / velocity — it does not (the raw material
     exists in `estimate_minutes` + `focus_sessions.planned_seconds`; nothing computes it),
     and it is used as the stated differentiator vs Motion. §3.10 says engaged-time-vs-plan
     is measured — it is recorded, not measured.
   - **Recommended take:** export (non-negotiable, cheap on SQLite, absent today);
     single-key verbs; the four-test interrupt gate (cheap — the substrate already has
     caps and layers); desk staging (the thing no calendar-first competitor can copy);
     P3's mute-agent shadow log.
   - **Recommended refuse:** M5/M6 act-silently (contradicts the operator's own DEC-052
     ruling that the human stays in the loop); the mandate grid as specified (the spec
     lists "needs managing" as a bad-EA failure mode and then specs one);
     send-on-behalf; two-way calendar write.
   - **Open structural question:** the spec's Inbox↔Today wall does not exist in Plexi.

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
