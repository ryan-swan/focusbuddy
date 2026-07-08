// Per-surface dashboard defaults for the unified dashboard engine (see
// docs/DASHBOARD-UNIFICATION.md). This declares the DEFAULT portlet set + column
// count for each surface (Home and every module). It carries no data and no live
// config — only which cards appear, in what order, at what size, by default. Once
// a user personalises a surface, their persisted DashboardConfig becomes the
// source of truth and this is only the fallback for a never-touched dashboard,
// replacing the single global DEFAULT_LAYOUT with a per-surface lookup.
//
// Phase 1 of the migration: this registry is the substrate the generalised engine
// (phase 1 continued) and the Home + module migrations (phases 2-4) build on. It
// is intentionally data-free so it can live in shared/ and be read by the main
// process, the renderer, and any future layout export alike.

import type { PlexiCardKind, DashboardCardSize, DashboardColumns } from './types'

export interface DashboardCardDefault {
  // Stable per-placement id, conventionally `${moduleKey}.${slug}`. The module
  // resolves this id to a live config at render time.
  id: string
  kind: PlexiCardKind
  // Required when kind === 'custom': keys into the module's custom-card registry.
  customKind?: string
  // Per-card default size; omitted means 'medium'.
  size?: DashboardCardSize
}

export interface ModuleDashboardDefaults {
  moduleKey: string
  // Render order = array order.
  defaultCards: DashboardCardDefault[]
  defaultColumns: DashboardColumns
}

// The surfaces that have (or will have) a personalisable dashboard. New surfaces
// are added here rather than given a bespoke screen.
export const DASHBOARD_REGISTRY: Record<string, ModuleDashboardDefaults> = {
  home: {
    moduleKey: 'home',
    defaultColumns: 2,
    defaultCards: [
      { id: 'home.greeting', kind: 'custom', customKind: 'home-greeting', size: 'large' },
      { id: 'home.quick-actions', kind: 'custom', customKind: 'home-quick-actions', size: 'large' },
      { id: 'home.insights', kind: 'metric-row', size: 'large' },
      { id: 'home.continue', kind: 'list', size: 'medium' },
      { id: 'home.desks', kind: 'custom', customKind: 'home-desks', size: 'medium' },
      { id: 'home.agenda', kind: 'list', size: 'small' },
      { id: 'home.activity', kind: 'activity', size: 'small' }
    ]
  },
  reports: {
    moduleKey: 'reports',
    defaultColumns: 3,
    defaultCards: [
      { id: 'reports.metrics', kind: 'metric-row', size: 'large' },
      { id: 'reports.trend', kind: 'chart', size: 'medium' },
      { id: 'reports.by-schedule', kind: 'breakdown', size: 'small' },
      { id: 'reports.recent', kind: 'list', size: 'medium' }
    ]
  },
  flows: {
    moduleKey: 'flows',
    defaultColumns: 3,
    defaultCards: [
      { id: 'flows.metrics', kind: 'metric-row', size: 'large' },
      { id: 'flows.trend', kind: 'chart', size: 'medium' },
      { id: 'flows.recent', kind: 'list', size: 'medium' },
      { id: 'flows.activity', kind: 'activity', size: 'small' }
    ]
  },
  meet: {
    moduleKey: 'meet',
    defaultColumns: 3,
    defaultCards: [
      { id: 'meet.metrics', kind: 'metric-row', size: 'large' },
      { id: 'meet.upcoming', kind: 'list', size: 'medium' },
      { id: 'meet.recent', kind: 'list', size: 'medium' }
    ]
  },
  forms: {
    moduleKey: 'forms',
    defaultColumns: 3,
    defaultCards: [
      { id: 'forms.metrics', kind: 'metric-row', size: 'large' },
      { id: 'forms.responses', kind: 'chart', size: 'medium' },
      { id: 'forms.recent', kind: 'list', size: 'medium' }
    ]
  },
  build: {
    moduleKey: 'build',
    defaultColumns: 3,
    defaultCards: [
      { id: 'build.metrics', kind: 'metric-row', size: 'large' },
      { id: 'build.recent', kind: 'list', size: 'medium' },
      { id: 'build.activity', kind: 'activity', size: 'small' }
    ]
  }
}

// The default dashboard for a surface, or null if the surface is not registered.
export function defaultsForModule(moduleKey: string): ModuleDashboardDefaults | null {
  return DASHBOARD_REGISTRY[moduleKey] ?? null
}
