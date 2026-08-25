# Active Mission

<!-- Single source of truth for live state. Update at every phase boundary, then regenerate
     NEXT-SESSION-PROMPT.md. -->

**Last updated:** 2026-08-25 (S5 SHIPPED — **THE ATTENTION LAYER IS LIVE**) · **State:**
IN_PROGRESS — Phase 6 execution (DEC-017 autopilot. S0 ✔ S1 ✔ S2 ✔ S3 ✔ S4 ✔ L1 ✔ S5 ✔
→ S6 next, after its C-4 main-diff checkpoint)

**S5 CLOSED (2026-08-25, commit 7554ce86):** capture console (Routed/Unrouted/Expand,
composer-owned Q1 question), deterministic-first classifier (Haiku fallback,
loose-thought floor), closed-loop notifications through S4, Δ3 decay tier, flag-ON
prompt activation (chat catalog + meeting wrapup + voice), executor's real apply path.
**workItems.enabled = ON** (personal scope; org exposure stays behind the P1 checklist).
2731/2731 tests; live on fresh PID. Deferred honestly: opt-in cleanup + multi-intent
secondary cards → S6. Ledger: [phases/HANDOFFS/s5-close.md](phases/HANDOFFS/s5-close.md).

**Intake CLOSED (operator, 2026-08-25):** "part 2 landscape map" was an accidental
cross-thread paste — struck; the synthesis (analysis/20) IS the full list. S5/S6/S7
prompts enriched with Δ1–Δ13. Δ3's v1-simple loose-thought decay proceeds as the
standing strongest-recommendation (14-day dismiss, reason 'decayed') — flagged for veto
in the S5 close.

**L1 SHIPPED (2026-08-25, commit 34acf80f):** the desk lifecycle surfaced — Trash view
(roots + days-remaining + lossless subtree restore), sidebar entry both rail states,
Archive/Trash in the All Desks + All Rooms native action menus, archived shelf chips.
Shared desks/rooms hold lifecycle actions pending D1. Deferred to S6: menus on
StageManagerStrip/DeskGallery/CanvasBreadcrumb (no native affordance exists there).
2702/2702 tests. CR-07's before-Phase-5 direction satisfied for the approval-free half;
L2 still needs D1/D2.

**Synthesis intake part 1/2 DONE (analysis/20):** 12 exact confirmations, 13 detail
deltas queued for S5–S7 prompt enrichment, 0 conflicts, 5 synthesis-open questions
already closed by DECs. **Waiting: part 2 (the current-landscape map) → then enrich
S5/S6/S7 prompts → resume autopilot.**

**S5 HOLD (2026-08-25, operator checkpoint):** the operator flagged that SPEC-001+A1 was
the compiled OUTLINE (scope, 44 items) — the FULL comprehensive product features list
lives in the spec-drafting chat session and has never been intaken here. S0–S4 were
foundation stages built to the approved v2.3 architecture (scope-level items sufficed);
S5–S7 are the product-detail stages where the full list matters. Recommendation
delivered: the list is pasted HERE and the prompts are authored/enriched in this session
(against v2.3 + the as-built code); the other session's role is cross-check, not author.
Process on intake: diff vs SPEC-001+A1 (map the 44, extract detail deltas + new items,
check v2.3 conflicts → crossroads for any) → enrich S5/S6/S7 prompts → resume autopilot.
Meanwhile: lifecycle L1 (approval-free) is buildable and satisfies the CR-07
before-Phase-5 direction; D1/D2/R008/R012 grouped rulings re-surfaced (now timely).

**S4 CLOSED (2026-08-25, commit 235a016e):** the notification substrate — durable
wi_notifications store (UNIQUE dedupe), per-queue hourly caps with one-summary collapse,
mark-then-show delivery, block reminders moved to main (restart-proof; SPEC-024/029
deliverable), decoy retired with its PLX-UX assertions ported, notifyExternal re-pointed
by construction (seven callers, zero edits), DEC-018 A-1 actor seam + A-2 mission queues
reserved+test-locked, attentionBadgeCounts ready for S6. 2700/2700 tests; live table
verified on the real DB. Ledger: [phases/HANDOFFS/s4-close.md](phases/HANDOFFS/s4-close.md).

**S3 CLOSED (2026-08-25, commit 00240bda):** the workItems:* namespace (9 verbs, F008
one-code-path), the renderer store as live-path producer (status never emitted; manifest
attrs only), sync-loop refresh, the fb:command-new-work-item creation seam. 2694/2694
tests. Flag stays OFF until S5/S6 (deliberate — the S0 catalog addendum must not
advertise the verb before its surfaces exist). Ledger:
[phases/HANDOFFS/s3-close.md](phases/HANDOFFS/s3-close.md).

**S2 CLOSED (2026-08-25, commit 2c133165):** the sync contract. Column manifest (one
source, 13 cols) + status projection (never-done pinned) + satellites with orphan sweep +
detach-hook wiring + the ARRIVAL ROUTER (live-path work_item events route to the one db
code path; deletes soft-trash, never tombstone) + allowlist/emit parity by spread + poll-
arm recompute ×3 + the 409 baseRev fix [PLEXI-UPSTREAM]. 2686/2686 tests. **Live:**
schema landed on the real DB (13 cols + wi_local/wi_deliveries, 112/112 rows, FK clean);
**the 409 fix cured the perma-dirty demo rows live** (settle window observed; revs
advance). New P1 lead: a local periodic writer re-touches those demo rows each cycle
(pre-existing). Full ledger: [phases/HANDOFFS/s2-close.md](phases/HANDOFFS/s2-close.md).

**S1 CLOSED (2026-08-25, commits ae0f071e/63b0fc0b/bfaf00ba):** the FOUNDATIONAL stage.
`migrateNodesKindCheckV2` **fired on the live DB and passed every assertion** (112/112
rows, 4-kind CHECK, trigger+indexes survived, FK-check clean, dual restore points);
`nodeLifecycle.ts` owns the closed three-site hard-delete enumeration with
detach-and-revive; C2 + leaf-invariant typed refusals; listNodes exclusion; park-inbound
replaces the sync swallow (GAP-013) [PLEXI-UPSTREAM]; CI delete-site lock armed; NodeKind
union swapped (CR-05a). 2649/2649 tests. Full ledger:
[phases/HANDOFFS/s1-close.md](phases/HANDOFFS/s1-close.md). Deferred per R010: the
sync-side kind round-trip (disposable account, P1 checklist).

**S0 CLOSED (2026-08-25, commit 09e129d9):** vocabulary quarantine executed — shared
vocabulary module + workItems.enabled flag (default OFF, voiceProviderPref pattern);
create-task defined as desk at every model-visible site incl. the meeting-wrapup rule;
`create-work-item` reserved end-to-end (union type, five parser arms, creation gate,
labels, honest executor no-op); gated catalog addendum injected flag-checked at both
consumers; label worklist landed (desk language in action cards, toasts, refusals, Flow
editor); Flow engine honest-default arm. 18 new grep-lock tests; suite 2628 green,
typecheck clean. Renderer half live via HMR; main-process prompt half compiled+tested,
takes effect on next app launch (dev server runs without --watch — normal). Deferred to
S6 per CR-04(b): AllTasksView/segments/Pulse/MakeTaskDialog surface renames. Orphaned
dashboard portlet strings skipped (unreachable UI).

**G2 MET — Phase 2 complete, all seven items:** matrix adversarially verified (12
CONFIRMED / 4 PARTIALLY / 0 REFUTED; two class disputes upheld + corrected; six misses
integrated → GAP-016; verdict in analysis/02). Evidence library: 02, 10, 11, 12, 13, 14,
15, 16 + registers. Per DEC-015's clean-validation condition: **autopilot proceeds into
Phase 3 — strategy + logic-audited architecture** (the real build plan: schema DDL incl.
dual-start migration, SPEC-002 columns + mapping table + assignee reconciliation +
allowlist additions, IPC/preload signatures, notification substrate design, component
decomposition, stage breakdown with verify-commands, then per-stage build prompts).
**Phase 3/4 CLOSED (2026-08-25): ARCHITECTURE.md v2.3 APPROVED — G3+G4 MET with dual
signatures.** Chain: v1 REJECTED (14 findings) → v2 (11) → v2.1 (14, incl. blind
validator's 6 conditions; C1≡F-C1″ found independently = dual validation working) → v2.2
(narrow verify: 11/12 CLOSED, 8/8 code citations exact, 2 propagation slips) → **v2.3
(0 open findings)**. Per §7's rule, per-stage build prompts (S0–S7) are now authorized —
that authoring is the live task.
Risk war-game COMPLETE → analysis/17 (18 risks; top-3: R016 GAP-013-at-fleet-scale if
merged, R001 sync-engine collision with Caleb's churn, R008 work_item delete semantics
undefined). **v2.1 revision after re-gate verdicts** folds in the adoptable risk repairs:
work_items as LEAF nodes at v1 (kills R009), no-hard-delete-at-v1 pending a DEC (R008
fallback), version-stamp column + same-device migration guard (R005/R006), satellite
orphan reconciliation (R017), S5 latency target (R011), config-flag shared-desk guard
(R015), merge-readiness preconditions (R016). Lifecycle track PLAN drafted
(phases/TRACK-LIFECYCLE; deletion bug = pure UI-exposure gap).
**Awaiting operator (grouped for one pass):** D1 shared-desk delete v1 default · D2 purge
semantics · R008 work_item delete contract (or accept the v1 no-hard-delete fallback) ·
R012 the "lifecycle before Phase 5" reading (strict vs. content-only). Sync-fix branch
shipped + cherry-picked; PR command handed to operator.

**G1 MET (DEC-014):** spec captured + inventoried (44 items + SPEC-042/043/044); primary
objective confirmed as drafted; all crossroads ruled (CR-01..07 = standing recommendations;
CR-07 = Option B parallel prerequisite); Q5 shaped (DEC-013); IQ-1 resolved (deliberate
trim); ambiguities Q1–Q4, Q6–Q8 scheduled for Phase 2/3 proposals returned for approval.

**Phase 2 scope + state (updated after the agent returns, 2026-08-24 night):**
1. ~~SPEC-004 classification~~ ✔ **DONE** → analysis/10 (spot-verified 6/6): 223 true
   sites, 44 must-touch, no TS safety net, blast-radius top-8, `listNodes` = highest-leverage
   fix, GAP-013 discovered (cross-version sync swallow).
2. ~~SPEC-044 vocabulary audit~~ ✔ **DONE** → analysis/11 (spot-verified 6/6): 62
   model-visible occurrences, 3 files already correct, riskiest-5 ranked, persistence map,
   label worklist.
3. ~~C1-03 triage~~ ✔ **DIAGNOSED** → analysis/10 §6: enumeration/two-source bug, metadata
   intact; fix shape = product call → G2 docket.
4. ~~Sync proof~~ ✔ **PASSED (2026-08-24 23:21)** — operator-run live round trip:
   server stores + echoes unknown node columns intact → analysis/12. **A-003 VALIDATED
   (0.97); DEC-007's ratification evidence complete.** Kind-value direct confirmation
   scheduled post-migration (Phase 6 stage 1).
5. ~~ACL semantics~~ ✔ **DONE** → analysis/14: three scopes, server-side membership,
   per-person addressing absent → v1 routing = scope-carried + client-filtered with a
   stated visibility contract; four G4 consequences named.
6. ~~Sync reliability~~ ✔ **DONE** (spot-verified 4/4) → analysis/15: THREE transports
   (CRDT-WS live + HTTP poll + Yjs docs, dual-write); **7–8s root-caused** — the
   running-guard silently drops receiver wakes, cycles lengthened by serial PUTs (~6-line
   coalescing-re-arm fix; ownership note: Caleb's subsystem); slide decks non-replicating
   by construction in three places; **GAP-015** — CRDT field allowlists would silently
   drop SPEC-002's routing columns on the live path; 409-loop + version-gate + shared
   refresh named as ranked P1 preconditions. Plus GAP-014 (own DB inspection): live DB
   already CHECK-widened; kind acceptance proven; A-003 → 0.99.
7. Gap matrix DRAFTED → analysis/02 (all 44 + amendments classified with evidence);
   **adversarial verifier agent in flight** (refute-mode, all E/CR claims + ≥30% sample).
   G2 closes when 6+7 return clean. Also delivered: **Q1/Q7 concrete proposals →
   analysis/16, awaiting operator ruling** (due before Phase 5, not blocking Phase 3/4
   foundation). Operative scope baseline: SPEC-001 + A1 (analysis/13; DEC-015).

## Right now

**ARCHITECTURE.md v2.3 is APPROVED (2026-08-25) — the single source of design truth for
the build.** Live task: author the per-stage build prompts (S0–S7 per §7's stage table)
into `phases/BUILD-PROMPTS/`, each self-contained against v2.3 with pre-flight, contents,
key-verify commands, and rubric hooks. Then execute S0 (SPEC-044 vocabulary quarantine)
under DEC-015 autopilot. The lifecycle track's L1 (approval-free additive UI) interleaves
on bandwidth; L2 still needs D1/D2. **Operator ruling set still open (non-blocking):
D1 · D2 · R008 (v1 no-hard-delete fallback already baked in §2.5.10 pending the DEC) ·
R012.** PR for `fix/sync-wake-coalescing` awaits operator's click.

## Execution order

1. ~~Phase 0 — Foundation~~ ✔
2. ~~Phase 1 — Spec intake & decomposition~~ ✔ (G1 MET, DEC-014)
3. ~~Phase 2 — Current-state verification & gap analysis~~ ✔ (G2 MET, dual-validated)
4. ~~Phase 3 — Product strategy & experience design~~ ✔ (merged into ARCHITECTURE per F011)
5. ~~Phase 4 — Technical architecture~~ ✔ (**v2.3 APPROVED — G3+G4 MET, dual signatures**)
6. Phase 5 — Staged build roadmap → per-stage prompts (S0–S7) ← **NOW**
7. Phase 6..N — Execute per-stage loop (DEC-015 autopilot; lifecycle track interleaved)
8. Phase F — Integrate & close

## Recently completed (audit trail — most recent first)

- **2026-08-25 — ARCHITECTURE GATE MET (G3+G4, dual signatures) → v2.3 APPROVED.**
  Four audit rounds + one narrow closing verification; final pass: 11/12 repairs CLOSED,
  8/8 code citations exact, remaining 2 propagation slips + 3 nits fixed in v2.3
  (§7-S1/S2 rows re-anchored to §2.5.4's five cases and §2.4's `detached_from_id`;
  §2.5 renumbered 1–10; writer count six + `ensureSharedContainer`; CI-lock scope pinned
  to nodes-targeting DELETEs + migration's own `DROP TABLE` allowlisted; §2.6 P1 checklist
  carries the prune exclusion). Build-prompt authoring authorized per §7.
- **2026-08-24 (latest) — Vocabulary complete + consumer census.** DEC-012: the surface is
  **"Attention"** (verified convergence with Caleb's existing `AttentionItem`/`ContextObject`
  + `attentionPrecision()`; "Signal" eliminated — the sync transport is the signal server).
  GAP-011 registered with measured census: **305 kind-branching call sites / 99 files** to
  classify in Phase 2 (negations + unfiltered child enumerations = the risk classes).
  All spec-blocking rulings now closed — the spec-drafting session has its green light.
- **2026-08-24 (late) — Five pre-spec rulings approved + Design Fidelity Standard.**
  Operator approved analysis/05-PRE-SPEC-RULINGS.md in full → DEC-007 (schema: widen CHECK,
  work items are nodes), DEC-008 (routing: spec both, self-first), DEC-009 (calendar:
  engine stays, surface licensed, external P2), DEC-010 (plans untouched v1), DEC-011
  (vocabulary: `work_item`, forever). Sync substrate verified (CRDT, server-mediated,
  `nodes` + `time_blocks` on the whitelist) — A-003 0.55→0.85, GAP-008 IN_PROGRESS.
  Design directive codified → [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md).
- **2026-08-24 — Preservation & Rebuild Doctrine codified (Phase 0 addendum, DEC-006).**
  Operator's pre-spec directive locked in: core Plexii is inviolable; rebuilds of existing
  surfaces go through the Crossroads Protocol (operator decides); foundational
  schema/routing changes get the strictest tier; every spec item triaged P0/P1/P2 against
  the operator-confirmed primary objective → [PRESERVATION-DOCTRINE.md](PRESERVATION-DOCTRINE.md).
  Threaded through intake, roadmap gates, rubrics; A-006 (calendar usage) registered.
- **2026-08-24 — Legacy task-branch harvest (Phase 0 addendum).** `ryan-task-system-port`
  (`fd12cc2f`) excavated: data model, production-grade CHECK-widening migration + pinning
  test, 3 polished UI components, measured port costs (small: 10 files, ≤210-line target
  drift, zero new deps). Reference-only per DEC-005 →
  [analysis/03-LEGACY-TASK-BRANCH.md](analysis/03-LEGACY-TASK-BRANCH.md).
- **2026-08-24 — Phase 0 shipped.** Mission-control scaffolded from the agent-os template
  (9 docs, zero raw placeholders); gates G1–G6 adapted; registers seeded (7 gaps + 2 open
  questions, 5 assumptions, 4 decisions); Phase 1 PLAN written; baseline pre-flight PASS.
- **2026-08-24 (earlier today) — Foundation prerequisites.** Branch `ryan-command-center` cut
  @ a92b30cb and pushed to fork; codebase map produced and delivered
  (`.claude/COMMAND-CENTER-MAP.md` + artifact); dev app launched, HMR round-trip verified.

## Open items

See [GAP-REGISTER.md](GAP-REGISTER.md). Non-blocking niceties: Caleb/Michael re-adding
`ryan-swan` as collaborator on origin would allow moving the branch off the fork (DEC-001).

## How this file gets used

Read at session start. Update "Right now" + "Recently completed" at each phase boundary;
regenerate [NEXT-SESSION-PROMPT.md](NEXT-SESSION-PROMPT.md). If "Right now" says X and the
operator asks for Y, surface the conflict before doing Y.
