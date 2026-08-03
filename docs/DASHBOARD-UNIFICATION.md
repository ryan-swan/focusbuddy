# Dashboard unification

PlexiDesk has three dashboard systems today, and this is the plan to collapse them
into one personalisable engine used on every surface (Home and every module). The
work is staged so each phase ships and is verified on its own; a half-done Home is
never left in a release.

## Why

- `components/dashboard/Dashboard.tsx` + `stores/dashboardLayouts.ts` is a real
  personalisable portlet engine (drag-reorder, add/remove, 1-3 columns, per-card
  S/M/L sizes, SQLite-persisted, org-scoped, keyed per surface). It is only wired
  to the (largely orphaned) per-project dashboard today.
- `components/ModuleDashboard.tsx` is a second, declarative system (metric tiles,
  a chart, a breakdown, an activity list, a recent grid) used by five module views
  (Reports, Flows, Meet, Forms, Build). Its only personalisation is section
  show/hide in localStorage — no reorder, columns or sizes.
- `components/views/HomeDashboard.tsx` is a third, bespoke, non-personalisable
  hand-built screen.

One engine everywhere means every surface gets the same real personalisation, and
we stop maintaining three code paths.

## The unified model (design authority sign-off 2026-07-08)

Parameterised generic cards, not per-module concrete kinds. Six card kinds cover
both the old domain cards and the declarative primitives:

- `metric-row` — supersedes StatsCard and ModuleDashboard `stats[]`.
- `chart` — supersedes the ModuleDashboard timeline (bar/sparkline).
- `breakdown` — supersedes the ModuleDashboard breakdown.
- `list` — supersedes TodayTasksCard, FoldersCard, RecentNotesCard and
  ModuleDashboard `recentItems`.
- `activity` — supersedes RecentActivityCard and ModuleDashboard `activity`.
- `custom` — the escape hatch for genuinely interactive/stateful cards
  (daily-brief, quick-start, focus-session, ai-assistant, workspace-health, and
  the bespoke Home header/quick-actions). A `customKind` string keys into a
  component registry, generalising today's `CardBody` switch so any module can
  register its own one-off cards, not just Home.

A card instance carries config, never raw data. Each module computes its own card
config from its real stores at render time and hands it to the engine; the engine
only lays out and chromes cards, it never fetches data. That keeps no-fakery intact
per module while the grid stays generic.

```ts
type PlexiCardKind = 'metric-row' | 'chart' | 'breakdown' | 'list' | 'activity' | 'custom'

interface PlexiCardInstance {
  id: string            // `${moduleKey}.${slug}`, stable per placement
  kind: PlexiCardKind
  moduleKey: string     // which module resolves this card's config
  customKind?: string   // required when kind === 'custom'
  size?: DashboardCardSize
  config?: Record<string, unknown> // kind-specific, built live per render
}
```

Config shapes reuse the existing ModuleDashboard types verbatim: `metric-row` =
`{ metrics: DashboardStat[] }`, `chart` = `DashboardTimeline`, `breakdown` =
`DashboardBreakdown`, `list` = `{ label?, items: ModuleItem[], emptyHint, onCreate?,
createLabel? }`, `activity` = `{ items: DashboardActivityItem[], onViewAll? }`.

## Per-module default registry

A new shared file `src/shared/dashboardRegistry.ts` declares defaults only — id,
kind, size, column count — never data. Once a user personalises a surface, their
persisted `DashboardConfig` is the source of truth; the registry is the fallback
when no layout exists yet (replacing the single global `DEFAULT_LAYOUT`).

```ts
interface DashboardCardDefault { id: string; kind: PlexiCardKind; customKind?: string; size?: DashboardCardSize }
interface ModuleDashboardDefaults { moduleKey: string; defaultCards: DashboardCardDefault[]; defaultColumns: DashboardColumns }
const DASHBOARD_REGISTRY: Record<string, ModuleDashboardDefaults>
```

`dashboardKeyOf` generalises from `'home' | projectId` to
`'home' | moduleKey | projectId`. The engine takes a persistence `dashboardKey`
plus a `moduleKey` (which selects the registry entry and which module resolves
configs) so a project-scoped and a module-scoped dashboard never collide.

## Home migration — wrap, do not rebuild

Home is polished and well-liked; a visible regression is a blocker, not a note.
The bespoke, non-reusable pieces stay bespoke as `custom` cards; everything already
data-shaped becomes a generic card with no visual cost, gaining drag/resize/hide
for free.

- `home-greeting` (custom) — greeting + focus toggle + ask-brain trigger.
- `home-quick-actions` (custom) — the four QuickAction tiles.
- `home-insights` → `metric-row` (already `{icon,label,value,tone}[]`).
- `home-continue` → `list` (recent docs; add an optional `icon`/`iconTint` to
  `ModuleItem` so the per-doc-type tint survives).
- `home-desks` → `list` with `onCreate` (or keep custom if the node-kind icon
  chrome must survive unchanged).
- `home-agenda` → `list` (today's events).
- `home-activity` → `activity`.

## Migration sequence (checkpoint after each)

1. Engine extension — generalise `Dashboard.tsx` to a `moduleKey` + card-instance
   resolver instead of the hardcoded `CARD_META`/`CardBody` switch; add the new
   types alongside the existing `DashboardCardKind` (keep the old type as a
   migration alias for one release); add the registry; loosen
   `main/db/dashboardLayouts.ts` validation from a closed enum to `${moduleKey}.`
   scoped ids. Checkpoint: existing Home + project dashboards render identically;
   typecheck + tester equivalence pass.
2. Home migration per the wrap plan. Checkpoint: reorder/resize/hide/reset all work
   on Home; visual parity with the pre-migration screenshot (blocker on any
   regression).
3. Pilot one module off ModuleDashboard (Reports — cleanest 1:1). Checkpoint:
   customize/reset/persisted-order tested green.
4. Migrate the remaining four consumers (Flows, Meet, Forms, Build) one at a time,
   typecheck + tester per module.
5. New surfaces (Rooms, People, Documents landing) are born on the registry.
6. Retire `ModuleDashboard.tsx`, the legacy `DashboardCardKind` union and
   `DEFAULT_LAYOUT` once no import references them.

## Status

- Design authority sign-off: done (2026-07-08).
- Phase 1 (engine extension): in progress.
- Phases 2-6: queued.
