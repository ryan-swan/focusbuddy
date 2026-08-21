// Tracks which modules you actually visit, so the command palette can float your
// most-used destinations to the top (the UX-panel's "reduce navigation depth"
// fix, done without touching the sidebar tree). Only top-level module views are
// recorded; opening an individual task, document or project is not a "module" and
// is ignored, so the recents stay a short, meaningful list of places.

const KEY = 'plexi.view.recents'
const MAX = 8

// View kinds that are navigable modules (no per-entity id). Kept as a set so an
// entity view like 'task' or 'document' is never promoted as a destination.
const MODULE_KINDS = new Set<string>([
  'home',
  'all-tasks',
  'calendar',
  'vault',
  'messages',
  'inbox',
  'mail',
  'documents',
  'collaborations',
  'insights',
  'files',
  'org',
  'people-map',
  'suite',
  'knowledge',
  'meetings',
  'apps',
  'forms',
  'sign',
  'projects',
  'reports',
  'flows',
  'api',
  'marketplace',
  'plexii'
])

export function recordViewVisit(kind: string): void {
  if (typeof localStorage === 'undefined' || !MODULE_KINDS.has(kind)) return
  try {
    const list = recentModuleKeys().filter((k) => k !== kind)
    list.unshift(kind)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* ignore quota */
  }
}

export function recentModuleKeys(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.filter((k) => MODULE_KINDS.has(k)) : []
  } catch {
    return []
  }
}

// A 0-based recency rank for a module key, or -1 if not recently visited. Lower
// is more recent. Used by the palette to bias ranking.
export function recencyRank(kind: string): number {
  return recentModuleKeys().indexOf(kind)
}
