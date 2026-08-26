# Preservation & Rebuild Doctrine

Operator directive, 2026-08-24 (verbatim intent, codified). Governs every phase and every
build stage. Referenced by ROADMAP gates, SPEC-INTAKE classification, and the per-stage
rubric. Logged as DEC-006.

## The three laws

1. **Preservation Principle.** Plexii's current core functionality and UI/UX excellence is
   the platform this project stands on — "we can't ever get rid of core critical
   functionality that makes Plexii great in its current state." Nothing this initiative ships
   may degrade the core experience: desks/rooms/canvas, the widget system, sharing, the AI
   assistant + agent loop, memory, documents, the Home surface's quality bar.

2. **Rebuild License.** Existing features, sub-components, tools, widgets, or surfaces MAY be
   rebuilt, rethought, reinvented, or restructured when the primary objective genuinely needs
   it — the operator has said "sometimes the answer is yes" (named example: the Calendar tab,
   which currently sees ~no use → A-006). The license is real but **never self-granted**: it
   is exercised only through the Crossroads Protocol below.

3. **Foundational-Change Scrutiny.** Changes to how Plexii digests, uses, routes, or stores
   information — the data schema, sync/replication shape, the memory/brain layer, IPC
   contracts other features consume — are FOUNDATIONAL-tier. They carry the strictest rules:
   additive-first migrations, reversibility, dual-agent validation at their gate, and an
   explicit regression guard on existing flows before the stage closes.

## Change-tier classification (every SPEC-NNN and every build stage gets one)

| Tier | Meaning | Governance |
|---|---|---|
| **ADDITIVE** | New capability; existing surfaces untouched or purely extended (new widget def, new table, new IPC namespace) | Normal per-stage gate |
| **RESHAPE** | Modifies an existing feature/surface (restyles, reroutes, restructures a component or flow others use) | Crossroads Protocol → operator decision BEFORE architecture locks it in |
| **FOUNDATIONAL** | Alters information architecture: schema of existing tables, sync semantics, memory/brain behavior, contracts consumed by unrelated features | Crossroads Protocol + dual validation + regression guard + reversibility plan |

## The Crossroads Protocol

Fires whenever a spec item or build decision **conflicts with what currently exists** —
the moment gap analysis marks CONFLICTS, or a phase discovers a collision mid-flight.

The presentation to the operator MUST contain, compactly:

1. **What exists** — the current feature/behavior, with evidence (files, usage signal).
2. **What the objective needs** — which SPEC-NNN(s), and why the current form falls short.
3. **The options**, honestly priced:
   - A. Preserve + extend (work around the existing shape)
   - B. Refactor (reshape internals, keep the experience)
   - C. Rebuild (ground-up replacement of that piece)
   - and where honest, D. Descope (the spec item bends instead)
4. **Recommendation with rationale** — which option best serves the primary objective at
   acceptable risk to the three laws.
5. **The ask:** "worth refactoring/rebuilding what exists?" — then WAIT. The operator decides.
   The decision lands in DECISIONS-LOG as a DEC-NNN and the register updates.

Batched where possible: Phase 2 ends with ALL known crossroads presented together so the
operator rules on them in one sitting; mid-build discoveries fire individually.

## Regression guard (what "preserved" means, verifiably)

Per FOUNDATIONAL or RESHAPE stage, before close:
- Existing unit + e2e suites pass (`npm run test:unit`, targeted e2e where they exist).
- Typecheck green across the tree (`npm run typecheck`).
- Smoke of adjacent surfaces in the live dev app: the touched surface's neighbors (e.g.,
  schema change → desks still load, widgets persist, sharing works, AllTasksView renders).
- Migration reversibility statement: what happens to a database that has run it if the
  feature is later removed (additive columns are benign; rebuilds document their rollback).

## Priority triage (feeds Phase 1/3)

The spec is large and cross-cutting by design. Every SPEC-NNN is triaged against **the
primary objective** (extracted from the spec and operator-confirmed at G1):

| Tier | Meaning |
|---|---|
| **P0 — Core** | The main objective fails without it. Builds first. |
| **P1 — Supporting** | Materially strengthens the objective; ships in this initiative if the roadmap bears it |
| **P2 — Roadmap** | Real but future — logged, designed-around (so P0 doesn't paint over it), not built now |

The P0/P1/P2 cut line is proposed by Phase 3 strategy and **approved by the operator** —
"we can address those when the time is appropriate."

## Related
- [ROADMAP.md](ROADMAP.md) — gates reference this doctrine per phase
- [SPEC-INTAKE.md](SPEC-INTAKE.md) — area taxonomy + tier fields on every SPEC-NNN
- [QUALITY-FRAMEWORK.md](QUALITY-FRAMEWORK.md) — preservation dimension in the code rubric
- [ASSUMPTIONS.md](ASSUMPTIONS.md) — A-006 (calendar usage)
