import type { ConnectedApp } from '@shared/types'

const FAVOURITES_TARGET = 6
const DAY_MS = 86_400_000

/**
 * Score an app for ranking against its peers. Higher = more likely a favourite.
 *
 * `pinned` apps always sit above un-pinned ones (handled by the sort split, not the
 * raw score). Among un-pinned apps:
 *  - `useCount` is the dominant signal (log-scaled to avoid one heavy app crowding out
 *    everything else),
 *  - `lastUsedAt` adds a recency decay — an app touched yesterday outranks one last
 *    used a month ago at the same use count.
 */
function score(app: ConnectedApp, now: number): number {
  // (1 + log1p(uses)) gives a baseline of 1 for never-used apps so a freshly
  // opened app can still climb. Multiplying by the recency factor (instead of
  // adding it) means staleness is a true penalty — a heavily-used-but-cold app
  // can't bulldoze a moderately-used recent one. Without this the sort drifts
  // toward "apps the user touched once six months ago" and Favourites stops
  // reflecting current behaviour.
  const uses = 1 + Math.log1p(app.useCount)
  const ageDays = app.lastUsedAt
    ? Math.max(0, (now - app.lastUsedAt) / DAY_MS)
    : 30 // never used → treat as a month stale
  const recency = 1 / (1 + ageDays / 7) // half-life ≈ 1 week
  return uses * recency
}

export interface AppSplit {
  favourites: ConnectedApp[]
  more: ConnectedApp[]
}

/**
 * Split a Connected Apps list into the always-visible Favourites strip and the
 * collapsible "More apps" tail. Rules:
 *  - All `pinned` apps go to Favourites, in stable sort order.
 *  - Among un-pinned apps, the top N (by recency × frequency score) backfill Favourites
 *    up to the target count.
 *  - The remainder go to More apps, sorted by the same score so the user can scroll
 *    by relevance.
 *
 * The split is deterministic given the same inputs.
 */
export function splitFavourites(apps: ConnectedApp[], now = Date.now()): AppSplit {
  const pinned = apps.filter((a) => a.pinned)
  const rest = apps
    .filter((a) => !a.pinned)
    .map((a) => ({ app: a, s: score(a, now) }))
    .sort((a, b) => b.s - a.s)

  const slotsLeft = Math.max(0, FAVOURITES_TARGET - pinned.length)
  const promoted = rest.slice(0, slotsLeft).map((e) => e.app)
  const more = rest.slice(slotsLeft).map((e) => e.app)
  return { favourites: [...pinned, ...promoted], more }
}
