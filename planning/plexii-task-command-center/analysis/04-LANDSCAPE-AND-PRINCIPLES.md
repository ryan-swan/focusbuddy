# Plexii Landscape & Principles — Consolidated Synthesis

Pre-spec baseline, 2026-08-24 · PlexiDesk v4.1.0 @ `a92b30cb` · branch `ryan-command-center`.
Orientation snapshot (live state stays in ACTIVE-MISSION.md). Styled version:
https://claude.ai/code/artifact/ (see 00-CONTEXT index). Sources: Command-Center Map,
legacy harvest (03-LEGACY-TASK-BRANCH.md), mission-control registers.

## 1 · The landscape — three strata

### A. The excellent core (inviolable — preserve; Doctrine law 1)
- **Spatial workspace**: Rooms → Desks (canvases) → Widgets; large widget catalog; layout,
  pinning, sharing. Work has a place.
- **The brain**: ~70 AI functions, purpose-based model routing, credit proxy + BYOK, cost
  metering. Memory core `fact/preference/commitment`, org privacy, supersede-not-delete.
- **Agent loop** (A6): consent gate w/ per-host grants, kill switch, visible run ledger,
  browser actions, cost surfaced.
- **Standup pattern**: pure composer → orchestrator → AI weave w/ deterministic fallback;
  never fabricates. The house recipe for "intelligent."
- **Home**: standup, agenda, Pulse, rooms/desks grid; real widget registry
  (`homeWidgetDefs`) with sizes/rails/multi-instance/persisted layouts.
- **⌘K palette** (`CommandCenter.tsx` — naming collision, keep distinct).
- **Platform discipline**: org-scoped SQLite, typed preload namespaces, capability gating,
  app variants, auto-update with real external releases.

### B. The weak substrate (rebuild-license territory — Crossroads Protocol; law 2)
- **"Tasks"**: `task` kind = Desk; `taskId` = desk id everywhere; Pulse counts desks;
  `task-item` declared but dead — SQLite CHECK rejects it.
- **Calendar**: local `time_blocks` only (real recurrence engine), outbound .ics only,
  no external calendar; tab ~unused (A-006) — named rebuild candidate.
- **Dashboards**: three systems (live Home registry / orphaned portlet engine /
  ModuleDashboard) + dead unification scaffold. Pick one surface, disposition the rest.
- **Notifications**: scattered renderer Web-Notification calls; reminder engine is a
  renderer setInterval that dies with the app; main-process module is a decoy.

### C. The voids (greenfield)
- No task entity (GAP-001) · no notification substrate — table/IPC/inbox/scheduler/OS
  notifications (GAP-002/003) · no external calendar (GAP-007) · no task intelligence ·
  no collaboration model for tasks — sync substrate unmapped (GAP-008 / A-003 @ 0.55,
  riskiest assumption).

## 2 · Substrate verdicts

| Area | Today | Verdict |
|---|---|---|
| Tasks | Desks masquerading; entity dead | Build real entity; schema fork = THE Phase 4 decision |
| Notifications | Ephemeral, die with app | Greenfield: persistence + main scheduler + OS notif + inbox |
| Dashboard | Home registry live & good | Extend it — never a fourth system |
| Calendar | Local blocks, unused tab | Rebuild candidate — crossroads ruling awaited |
| AI/brain | World-class, never aimed at tasks | Reuse standup pattern, memory commitments, consent gate |
| Collaboration | Org+sharing exist, sync unmapped | Phase 2 investigates BEFORE design (A-003) |
| ⌘K palette | Extensible | Register new actions here |

## 3 · Assets banked
- **Legacy harvest** (`fd12cc2f`, reference-only DEC-005): 7-way work-type taxonomy,
  urgency ≠ priority, collision-proof ISO taskDueDate; production-grade CHECK-widening
  migration + pinning test; 3 polished components (task row, creation modal w/ room→desk
  cascade, on-canvas checklist w/ desk/room scoping). Port surface: 10 files, ≤210-line
  drift, zero new deps, zero IPC changes.
- **Command-Center Map**: file/line anchors + wiring conventions (DB→IPC→preload→routing→gating).
- **Live isolated environment**: fork branch current (Caleb moved 159 commits Aug 20–24 —
  merges are logged decisions), dev app running, HMR proven.
- **Mission-control**: 12 governed docs — roadmap w/ gates G1–G6, rubrics, registers,
  intake protocol, preservation doctrine.

## 4 · Principles

1. **Preserve the core; earn every rebuild.** Crossroads ruling: options priced, operator
   decides. Never self-granted, never silent.
2. **The spec is the authority; analysis before build.** No code until G1→G5 pass.
   Ambiguity → logged question. Extra ideas proposed + priced, never smuggled.
3. **Triage against the primary objective.** P0-core / P1-supporting / P2-roadmap-later;
   P2 designed-around, not built; operator owns the cut line.
4. **Native, not bolted on.** House patterns, wiring order, org scoping, capability gating,
   design tokens. Bar: feels like Plexii always had it.
5. **One canonical store, many surfaces.** Tasks are entities — never widget content;
   same item on desk, dashboard, global view, palette; survives layout changes.
6. **Tasks live where the work lives.** Spatial scoping (this desk / this room) is a
   first-class dimension — the differentiated idea, proven in the legacy branch.
7. **Intelligence with honesty; humans decide what matters.** Standup standard (fallback,
   never fabricate) + consent-gate standard. AI drafts/triages/notices/nudges; human decides.
   Memory commitments feed intelligent tasks.
8. **Foundational changes are additive-first + reversible.** Strictest tier: additive
   migrations, documented rollback, dual validation, regression guard (suites pass +
   adjacent surfaces smoke-checked live).
9. **Gate everything; pressure-test every stage; verify live.** Confidence blocks
   (<0.65 critical = blocked); builders never grade their own work; rubric ≥4 all
   dimensions; every claim carries a verify-command; renderer changes observed in the app.
10. **Isolated until proven; naming discipline forever.** Fork branch until testing earns
    the merge; new entities never reuse `taskId`.

## 5 · State
Complete: baseline isolated · codebase mapped · legacy harvested · mission-control armed ·
doctrine codified. Trigger: the product spec → SPEC-INTAKE.md runs.
