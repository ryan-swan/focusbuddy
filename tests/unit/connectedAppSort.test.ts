import { describe, it, expect } from 'vitest'
import { splitFavourites } from '../../src/renderer/src/lib/connectedAppSort'
import type { ConnectedApp } from '../../src/shared/types'

function makeApp(overrides: Partial<ConnectedApp>): ConnectedApp {
  return {
    id: overrides.id ?? 'a',
    title: overrides.title ?? 'A',
    url: overrides.url ?? 'https://a.example',
    icon: 'apps',
    color: null,
    sortOrder: 0,
    pinned: false,
    useCount: 0,
    lastUsedAt: null,
    vaultEntryId: null,
    autofillEnabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

const NOW = 1_700_000_000_000
const DAY = 86_400_000

describe('splitFavourites', () => {
  it('returns empty splits for an empty list', () => {
    const { favourites, more } = splitFavourites([], NOW)
    expect(favourites).toEqual([])
    expect(more).toEqual([])
  })

  it('puts pinned apps in favourites regardless of use count', () => {
    const apps = [
      makeApp({ id: 'cold-pin', pinned: true, useCount: 0, lastUsedAt: null }),
      makeApp({ id: 'hot-unpinned', useCount: 50, lastUsedAt: NOW - DAY })
    ]
    const { favourites } = splitFavourites(apps, NOW)
    expect(favourites[0].id).toBe('cold-pin')
  })

  it('promotes high-use, recent apps over low-use, stale ones', () => {
    const apps = [
      makeApp({ id: 'stale', useCount: 100, lastUsedAt: NOW - 60 * DAY }),
      makeApp({ id: 'recent-hot', useCount: 40, lastUsedAt: NOW - DAY })
    ]
    const { favourites } = splitFavourites(apps, NOW)
    expect(favourites.map((a) => a.id)).toEqual(['recent-hot', 'stale'])
  })

  it('caps favourites at 6 and pushes the rest to more apps', () => {
    const apps = Array.from({ length: 10 }, (_, i) =>
      makeApp({
        id: `app-${i}`,
        useCount: 10 - i,
        lastUsedAt: NOW - i * DAY
      })
    )
    const { favourites, more } = splitFavourites(apps, NOW)
    expect(favourites).toHaveLength(6)
    expect(more).toHaveLength(4)
    // Most-used apps should land in favourites
    expect(favourites.map((a) => a.id)).toEqual([
      'app-0',
      'app-1',
      'app-2',
      'app-3',
      'app-4',
      'app-5'
    ])
  })

  it('uses pinned apps first and backfills remaining slots by score', () => {
    const apps = [
      makeApp({ id: 'pin-a', pinned: true, useCount: 1 }),
      makeApp({ id: 'pin-b', pinned: true, useCount: 1 }),
      makeApp({ id: 'hot-1', useCount: 50, lastUsedAt: NOW }),
      makeApp({ id: 'hot-2', useCount: 40, lastUsedAt: NOW }),
      makeApp({ id: 'hot-3', useCount: 30, lastUsedAt: NOW }),
      makeApp({ id: 'hot-4', useCount: 20, lastUsedAt: NOW }),
      makeApp({ id: 'hot-5', useCount: 10, lastUsedAt: NOW }),
      makeApp({ id: 'cold', useCount: 1, lastUsedAt: NOW - 30 * DAY })
    ]
    const { favourites, more } = splitFavourites(apps, NOW)
    expect(favourites.slice(0, 2).map((a) => a.id)).toEqual(['pin-a', 'pin-b'])
    expect(favourites).toHaveLength(6)
    expect(more.map((a) => a.id)).toEqual(['hot-5', 'cold'])
  })

  it('treats never-used apps as 30-days-stale (so they sink without pinning)', () => {
    const apps = [
      makeApp({ id: 'never', useCount: 0, lastUsedAt: null }),
      makeApp({ id: 'week-old', useCount: 1, lastUsedAt: NOW - 7 * DAY })
    ]
    const { favourites } = splitFavourites(apps, NOW)
    expect(favourites[0].id).toBe('week-old')
  })
})
