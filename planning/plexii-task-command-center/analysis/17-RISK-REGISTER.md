<!-- G3/G4 risk war-game - complete register from the risk-analyst agent
     (resumed for full delivery 2026-08-25). 18 risks, top-3 ranked, 3-scenario mode.
     Methodology caveat per the agent: no Bash access, so the per-file churn RANKING in
     R001-R004 is corpus-inferred (ownership citations + the hard 159-commits/5-days
     metric), flagged UNVERIFIED_CLAIM. Integration disposition: see ACTIVE-MISSION +
     the v2.1 architecture revision that follows the re-gate verdicts. -->

# Risk Register — PlexiDesk Attention Layer (Phase 3 Architecture War-Game)

Complete register, delivered in one message per the coordinator's request (prior message was truncated mid-table). 18 risks total across 5 categories, then Top-3 ranked, then 3-scenario mode, then confidence/JSON.

**Methodology note (upstream-drift sections):** this subagent has Read/Write/Glob/Grep only — no Bash — so I could not run `git log --stat`/`git diff` against `origin/main` directly. `.git/logs/HEAD` proved to be Ryan's own historical reflog from an unrelated older branch, not a diffable record of Caleb's recent commits. R001–R004 are built from the planning corpus's own **spot-verified** ownership citations (analysis/15's code-cited "Caleb's live subsystem" callouts, A-001's named watch-files, ARCHITECTURE.md's own "flagged to Caleb" note) plus the one hard metric on record: **159 commits to `origin/main` in the 5 days (Aug 20–24) immediately preceding this architecture draft** (analysis/04-LANDSCAPE-AND-PRINCIPLES.md §3). The ownership claims are verified; the relative *ranking* of which file churns most is inference — flagged `UNVERIFIED_CLAIM`.

## 1 — Upstream drift / merge collisions, S0–S7

| ID | Description | Prob | Impact | Priority | Early Warning | Mitigation | Fallback |
|---|---|---|---|---|---|---|---|
| R001 | `workspaceSync.ts`/`crdtSync.ts` ("Caleb's live subsystem") touched by **4 stages**: S1 (`collectDeskSubtree`/`subtreeNodeIds` kind-filtering), S2 (CRDT allowlist adds, `crdtSync.ts:57-75`/`:404-416`), S3/S4 (shared-refresh widening), the optional coalescing re-arm fix. A Caleb rewrite here mid-build silently reintroduces GAP-015. | H | H | **CRITICAL** | Diff on these files/functions at every S1–S4 pre-flight, not just a generic fetch | Stage-specific grep on `NODE_ATTR_KEYS`, `emitNodeCreate`, `collectPendingShared`, running-guard block; any hit halts stage → A-001 playbook | Hand-cherry-pick only relevant hunks (DEC-005 precedent), never a full rebase onto days of unrelated churn |
| R002 | `database.ts` SCHEMA (A-001's named watch-file): two independent schema changes could race — S1/S2's work vs. a Caleb migration (GAP-016's `nodes.assignee` proves he already extends this exact table) | M | H | HIGH | Fresh SCHEMA-block + `getDb()` migration-list read immediately before S1 | Manual diff required before S1, independent of generic pre-flight; don't trust doc line anchors | Migration already derives DDL from live schema — extend that defensiveness beyond GAP-014's 2 known shapes to N shapes |
| R003 | `CommandCenter.tsx` touched by **4** internal stages (S0/S1/S3/S6) *and* is Caleb's general palette — highest self-collision-by-touch-count file in the plan | M–H | M | HIGH | Planned post-S1 "zero new sites" census failing here | Re-run the adversarial census after S3 and S6 too, not just once after S1 | Re-derive the guard from scratch on conflict (`if (n.kind==='work_item') continue`) rather than hand-resolving hunks |
| R004 | `homeWidgetDefs.ts`/`HomeDashboard.tsx` — A-001's own named trigger files — get 7 new widgets + switch cases at S6, on the most actively-evolved surface in the app | M | M | MEDIUM | A-001's trigger firing any time before S6 | Re-check A-001 status at S6's own pre-flight, not just at initiative start | Bump to whatever layout-version constant is current if `v3` has moved |

## 2 — Blind spots not in ARCHITECTURE.md §8

§8 covers: unanticipated DDL shape, missed Class-B/C consumer, allowlist drift, notification storms, un-migrated org peer, assignee/recipient drift, direct `status` writes. Missing:

| ID | Description | Prob | Impact | Priority | Early Warning | Mitigation | Fallback |
|---|---|---|---|---|---|---|---|
| R005 | **No version-gate/handshake mechanism exists anywhere in the sync stack.** §8's own precondition for flipping the P1 capability switch ("org peers confirmed on migrated build") and analysis/15 §6 item 3 ("version-gate the receiver") are both currently unbuildable — nothing lets a sender know a receiver has migrated | M | H | HIGH | P1 planning reaches "flip the switch" and finds no telemetry/handshake exists | Add a version-stamp column now — unknown columns already round-trip opaquely (analysis/12) | Gate P1 org/shared exposure on manual operator attestation only, until a real mechanism exists |
| R006 | **Personal-scope self-routing is NOT protected by the capability switch.** §8 row 5 gates org/shared only. A user's own 2nd device (same account, P0-enabled by default, not yet migrated) hits the identical swallowed-catch GAP-013 failure — silently, forever | M | H | HIGH | A work_item created on device A never appears on device B | Same-device migration guard (local DDL check for `'work_item'`, zero network round-trip) before any local creation | Document the 20s-poll self-correction ceiling explicitly in S1's test plan if the guard isn't ready |
| R007 | First production use of Electron's native `Notification` API (§5) — no permission-denied test or user-facing affordance named anywhere | M | M | MEDIUM | S4's test suite lacks a permission-denied case | Add a permission-denied adversarial test to S4; surface permission state in Settings | Ship without detection but log it as a named limitation, not a silent gap |
| R008 | **`work_item` hard-delete/lifecycle UX is unspecified.** DEC-013's memory-preservation choice contract is scoped to *desks* only ("the choice applies to personal desks") — nothing states what happens on an actual work_item delete, only state-transitions (dismiss/reclassify) | M | H | HIGH | S1/SPEC-013 implementation discovers no delete flow is defined | Extend DEC-013's contract (or an explicit descope ruling) to work_items before S1 closes trashNode policy | Block hard-delete at the db layer (dismiss/reclassify only) until the memory-contract question is answered |
| R009 | Trashing a work_item with a desk nested under it can cascade-delete that desk — §2.5 protects work_items *as children*, not the inverse; nesting is structurally permitted per the gap matrix's own flagged side effect (analysis/02 §4) | L–M | H | HIGH | None today — surfaces only via real usage | Symmetric trashNode kind-awareness: a sweep starting *at* a work_item stops at the first non-work_item child (or requires explicit confirmation) | Disallow nesting non-work_item nodes under a work_item at creation, until resolved |
| R010 | **S1's kind-value test is the first real `kind='work_item'` row sent to the production signal server** (analysis/12: "scheduled for the first Phase 6 schema stage"). Uncontained if the test account retains any residual org/shared/2nd-device scope | M | M–H | HIGH | None automated — requires a manual pre-test scope check | Re-verify the test account's scope is empty (no orgs/shared desks/2nd device) immediately before the test, WAL backup first, mirroring the column-probe discipline | Use a disposable test account, not the operator's daily-driver account |
| R011 | SPEC-008 intent-classification adds a new per-capture AI call (`AIPurpose:'intent-classify'`), no latency budget named — risks the explicit "instant self-loop" P0 goal | M | L–M | MEDIUM | S5's e2e test shows capture materially slower than the standup baseline | Add an explicit latency target to S5's verify-commands, not just correctness tests | Widen the deterministic composer's rule coverage (Q1 pattern) so more captures skip the model entirely |

## 3 — Schedule/coupling risks, S0–S7 ordering + external lifecycle track

| ID | Description | Prob | Impact | Priority | Early Warning | Mitigation | Fallback |
|---|---|---|---|---|---|---|---|
| R012 | **Ambiguous gating language.** DEC-014/CR-07(B) rules the lifecycle track must land "before Phase 5"; ARCHITECTURE §7's cross-stage rule says it only blocks S6/S7 *content*, not scaffolds. Two live, unreconciled readings — strict reading stalls all of S0–S7 pending an unscoped external track; loose reading quietly relaxes an operator-approved gate with no fresh DEC entry | H | M–H | HIGH | Reaching the G5 roadmap gate with the lifecycle track undone — ambiguous whether G5 can be granted at all | Resolve explicitly as a new DEC-NNN **before** the Phase 5 gate; operator picks a reading | If forced to default without a ruling, take the stricter reading: don't start S6 until lifecycle stale-derivation + memory contract are confirmed landed |
| R013 | **Same-builder, same-branch resource contention.** The lifecycle track and S0–S7 are "parallel" only in the dependency graph — both are the same solo builder's wall-clock time | H | M | HIGH | Any week both workstreams show "in progress" in ACTIVE-MISSION.md without one explicitly paused | Treat as sequential in the actual Phase 5 timeline (not just the dependency graph), so operator expectations are calibrated correctly | Descope the lifecycle track to the minimum needed for S6's Stale Desks content only, defer the rest (P0/P1/P2 triage) |
| R014 | Lifecycle track and S1 both edit trashNode/archive/purge code paths — same-author self-collision risk even with zero git conflict (built against stale assumptions from an earlier session) | M | M | MEDIUM | S1's regression guard fails specifically on trash/archive/purge flows | Sequence: land the lifecycle track's trash-adjacent changes before S1 builds kind-awareness on top of them | If interleaved anyway, re-run S1's regression guard after every subsequent lifecycle-track touch to these paths |
| R015 | Shared-desk delete v1 default (DEC-013) is still awaited from the operator at time of writing; S1's shared-desk guard and S2/S6's share-inheritance behavior are built against a stated-provisional shape | M | M | MEDIUM | Operator ruling doesn't land before S1 needs to finalize the guard | Add to the G5 checklist as an explicit blocker rather than assuming a default | Build the guard as a configurable policy/flag, not hard-coded logic, so the eventual ruling is a config change, not a rebuild |

## 4 — GAP-013 rollout risk with real production users, if this ever merges

| ID | Description | Prob | Impact | Priority | Early Warning | Mitigation | Fallback |
|---|---|---|---|---|---|---|---|
| R016 | `applyRemoteShared`'s bare catch (`workspaceSync.ts:844-851`) silently and permanently drops unknown-`kind` INSERTs — zero log, zero error, zero user signal. Un-migrated peers exist by definition during any auto-update rollout window (updater friction is evidenced in the repo's own commit history). §8's mitigations don't fully close this: the capability switch only gates the *sender's* willingness (see R005 — no way to verify receiver status), and the defensive log-and-park branch's landing depends on **Caleb** accepting a patch on **his** timeline, entirely outside this initiative's control. If merged, any shared/org scope spanning a migrated and un-migrated peer reproduces this in production: permanent, silent, per-item sync death, indistinguishable from generic "sync is broken" support tickets with zero diagnostic trail | M | H | **HIGH** *(scores #1 overall — see Top 3)* | None exists today by design; earliest realistic signal is a deliberate structured, greppable log line on the defensive branch, verified firing in a mixed migrated/un-migrated dogfood test | (1) Don't treat the capability switch as merge-sufficient — require the log-and-park branch verified **landed and observed firing** pre-merge. (2) Treat "Caleb has shipped the defensive branch upstream" as a named, explicit merge-readiness precondition, not an assumed side effect. (3) Build the real version-gate (R005) before any merge conversation happens | If merge is time-pressured and the upstream fix hasn't landed: ship with `workItems.enabled` OFF by default for all *existing* accounts (opt-in only), capping the un-migrated-peer collision surface at zero and growing only with adoption |

## 5 — Data-loss scenarios surviving §2.5 mitigations

(R008/R009 above already cover the two most concrete gaps — delete-semantics and nested-cascade. Two more:)

| ID | Description | Prob | Impact | Priority | Early Warning | Mitigation | Fallback |
|---|---|---|---|---|---|---|---|
| R017 | Satellite tables (`wi_local`, `wi_deliveries`, `wi_notifications`) have no stated FK/CASCADE relationship to `nodes` — orphaned rows possible, or a scheduler still trying to deliver notifications for an already-purged work_item | M | L–M | MEDIUM | A create→purge→re-create test cycle leaves stale satellite rows behind | State and test whether satellite tables CASCADE on `nodes.id`, or whether the scheduler's due-row query joins against `nodes` and skips orphans | Periodic reconciliation pass pruning orphaned satellite rows, folded into S4's restart-survival adversarial test |
| R018 | Migration running concurrently with in-flight sync writes at app startup — no stated ordering guarantee *(speculative — lower confidence than other rows; flagged, not confirmed)* | L | M–H | MEDIUM (low-confidence) | Unexplained missing/duplicate rows correlated with app-relaunch timing | Add an explicit ordering check: migration completes before the sync engine's first cycle runs | If ever observed, add a migration-complete flag gate checked before sync-engine startup |

---

## Top 3 failure modes overall (probability × impact × detection difficulty)

**#1 — R016 (GAP-013 at fleet scale, post-merge).** Detection difficulty is the highest in the entire register — the current swallowed catch produces zero log trace by design. Impact is high: this directly undermines the "shared collaboratively" objective and generates untraceable support incidents. Probability is contingent (depends on merge happening — A-002 says that's undecided) but every precondition that makes it likely (real auto-update friction, real external users, no version-gate) is independently verified, not speculative.
*Early warning:* none exists today — must be manufactured (structured log line on the defensive branch, observed firing in a mixed-version dogfood test).
*Contingency:* gate merge-readiness explicitly on the defensive branch being landed **and observed firing** upstream; if forced to merge before that, ship `workItems.enabled` OFF by default (opt-in only).

**#2 — R001 (sync-engine collision with Caleb's live subsystem).** Highest *documented* probability in the register (159 commits/5 days concentrated in his active areas, touching 4 of this initiative's stages). High impact: silently reintroduces GAP-015 even after S2 nominally "closes" it. High detection difficulty because S2's adversarial test is a point-in-time proof — nothing re-runs it after a later `origin/main` pull.
*Early warning:* stage-specific diff on `NODE_ATTR_KEYS`/`emitNodeCreate`/collect functions at **every** S1–S4 pre-flight, not just once.
*Contingency:* A-001's halt-and-reassess playbook; hand-cherry-pick over full rebase.

**#3 — R008 (work_item delete/lifecycle semantics undefined).** The purest blind spot in the set — zero existing mitigation anywhere in §8 or elsewhere in the architecture. Worst-category outcome (permanent loss of real user data). High detection difficulty: only surfaces via real post-ship usage, at which point it's a trust incident, not a caught bug.
*Early warning:* none today — must be manufactured by explicitly designing the delete flow before S1 closes trashNode policy.
*Contingency:* block hard-delete of work_items at the db layer (dismiss/reclassify only) until DEC-013's contract is explicitly extended to cover them.

---

## 3-scenario mode — S0–S7 build

**Best case — p=0.20:** Execution tracks the stage plan closely; upstream drift stays out of the must-touch files during the exact windows S1/S2/S6 need them; R012's gating ambiguity gets a fast operator ruling; R015's shared-desk default lands in time; R010's production kind-test passes clean on a verified-empty-scope account; G3/G4 surface no FOUNDATIONAL-tier surprises.
*Timeline:* on schedule per the Phase 5 roadmap. *Quality:* meets/exceeds expectations — rubric ≥4 across dimensions with at most one revision cycle per stage.

**Base case — p=0.50:** 2–3 risks materialize mildly: one upstream collision (R002 or R003) costs a rework day at the affected stage; R012 requires a mid-flight DEC-NNN that reorders S6; R015 lands just-in-time, forcing a late change to S1's guard shape. No actual data is lost — the defensive designs mostly hold — but 1–2 stages need a revision cycle, and S7 (already the heaviest stage: feeder+commitments+nudges+full regression+G6) absorbs most of the accumulated slip.
*Timeline:* minor-to-moderate delay, concentrated at S6/S7. *Quality:* meets expectations after the named revision cycles, not first-pass clean.

**Worst case — p=0.30:** Multiple HIGH risks compound — R001 materializes mid-S2 (a real upstream sync-engine rewrite invalidates the CRDT allowlist work, forcing a redesign); simultaneously R012 is discovered late (at the G5 gate itself, not before), forcing a full stop and a fresh operator ruling that materially reorders the roadmap; R008 or R009 is discovered only after real dogfooding use has already created affected data, requiring a backup-restore recovery exercise; an assumption's invalidation trigger (A-001 or A-003) fires for real, halting dependent Phase-6 stages pending re-analysis.
*Timeline:* significant delay — a full extra analysis-and-ruling cycle (days to over a week) plus at least one stage redesign. *Quality:* below initial expectations for the affected stage(s), recoverable, but the "arguably one of the best features within Plexii" bar (ROADMAP success criterion 5) is at risk of slipping to a later release.

*Probabilities: 0.20 + 0.50 + 0.30 = 1.00.*

---

## TASK_COMPLETE summary

```json
{
  "register_location": "N/A — output inline",
  "total_risks": 18,
  "priority_distribution": { "CRITICAL": 1, "HIGH": 10, "MEDIUM": 7, "LOW": 0 },
  "top_3_mission_critical": [
    {
      "risk_id": "R016",
      "description": "GAP-013's silent, permanent, unlogged sync failure for un-migrated peers, at fleet scale if this branch ever merges to origin/main and ships to real external users.",
      "source": "ARCHITECTURE.md §2.1/§8; GAP-013; analysis/10 §3.6/§5; analysis/15 §6",
      "probability": "M",
      "impact": "H",
      "mitigation_summary": "Gate merge-readiness on the log-and-park defensive branch being landed AND observed firing upstream (Caleb-owned); build a real version-gate; opt-in-only rollout if forced to ship before the upstream fix lands."
    },
    {
      "risk_id": "R001",
      "description": "Sync-engine files (workspaceSync.ts/crdtSync.ts, Caleb's live subsystem) are touched by 4 separate stages (S1-S4); his ~32 commits/day pace risks silently reintroducing GAP-015 mid-build.",
      "source": "ARCHITECTURE.md §2.1/§3/§7; analysis/04 §3; analysis/15; A-001",
      "probability": "H",
      "impact": "H",
      "mitigation_summary": "Stage-specific diff on the exact allowlist/collect functions at every S1-S4 pre-flight, not a generic fetch; halt-and-reassess per A-001 on any hit; hand-cherry-pick over full rebase."
    },
    {
      "risk_id": "R008",
      "description": "work_item hard-delete/lifecycle UX is unspecified — DEC-013's memory-preservation contract is scoped to desks only, leaving zero named protection against permanent loss of a routed item.",
      "source": "ARCHITECTURE.md §2.5; DECISIONS-LOG DEC-013",
      "probability": "M",
      "impact": "H",
      "mitigation_summary": "Extend DEC-013's choice contract to work_items before S1 closes trashNode policy; block hard-delete at the db layer until resolved."
    }
  ],
  "risks_without_adequate_mitigation": [],
  "confidence": {
    "confidence": 0.76,
    "why_not_higher": "This subagent has no Bash/git-log access, so the R001-R004 'which files Caleb churns most' ranking is inferred from the planning corpus's spot-verified ownership citations plus one hard metric (159 commits/5 days) rather than a git-diff run directly against origin/main — a direct diff could reorder that ranking. Additionally R012 and R015 are contingent on operator decisions still open at time of writing, and the architecture itself is an unratified DRAFT pending its own G3/G4 gates.",
    "assumptions": [
      "Caleb's Aug 20-24 commit velocity/pattern (159 commits, sync-engine + broad UI) is representative of the pace during the actual S0-S7 build window, not an anomalous spike.",
      "'If this ever merges' (R016) is treated per A-002 as genuinely undecided, not a certainty — probability estimates are conditioned on that uncertainty.",
      "The ARCHITECTURE.md content read at the start of this task is the current draft; no changes have landed to it or the cited analysis docs since."
    ],
    "flags": ["UNVERIFIED_CLAIM", "HUMAN_REVIEW_REQUIRED"]
  },
  "entity_refs": {
    "agents": ["architecture-designer", "logic-auditor", "risk-analyst"],
    "departments": ["strategy"],
    "phases": ["Phase 3", "Phase 4", "Phase 5", "Phase 6"],
    "gates": ["G3", "G4", "G5"],
    "related_ids": ["GAP-011", "GAP-013", "GAP-014", "GAP-015", "GAP-016", "DEC-001", "DEC-013", "DEC-014", "A-001", "A-002", "A-003"],
    "tags": ["upstream-drift", "sync-reliability", "data-loss", "GAP-013", "scheduling", "production-users"]
  }
}
```

**Files read for this analysis** (all under `/Users/ryanmcquillan/focusbuddy-plexi/`): `planning/plexii-task-command-center/ARCHITECTURE.md`, `GAP-REGISTER.md`, `DECISIONS-LOG.md`, `ASSUMPTIONS.md`, `ROADMAP.md`, `QUALITY-FRAMEWORK.md`, `PRESERVATION-DOCTRINE.md`, `00-CONTEXT.md`, `ACTIVE-MISSION.md`, `NEXT-SESSION-PROMPT.md`, `analysis/02-GAP-MATRIX.md`, `analysis/04-LANDSCAPE-AND-PRINCIPLES.md`, `analysis/10-NODE-CONSUMER-CLASSIFICATION.md`, `analysis/12-SYNC-SERVER-PROOF.md`, `analysis/14-ACL-SEMANTICS.md`, `analysis/15-SYNC-RELIABILITY.md`, `phases/HANDOFFS/2026-08-25-phase-2-close.md`, `.claude/COMMAND-CENTER-MAP.md`, `.git/logs/HEAD` (inconclusive — see methodology note), `.git/packed-refs`.
