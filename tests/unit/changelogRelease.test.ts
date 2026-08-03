import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getPendingReleaseEntry,
  advanceRunVersion,
  markReleaseSeen,
  getReleaseEntryForVersion,
  newestVersionedEntry,
  getAppVersion
} from '../../src/renderer/src/lib/changelog'

// The first-run release modal must: fire once for the running version, only
// after an actual update (never on a brand-new install), and never re-fire once
// seen. __APP_VERSION__ is a build-time global; we set it on globalThis so
// getAppVersion() resolves to a real version in the test.

const RELEASE_KEY = 'fb.app.releaseModalVersion'
const LAST_RUN_KEY = 'fb.app.lastRunVersion'

// A complete in-memory localStorage. happy-dom's built-in stub is missing some
// Storage methods in this config, so we provide a deterministic one.
function makeLocalStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => Array.from(m.keys())[i] ?? null
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
  ;(globalThis as Record<string, unknown>).__APP_VERSION__ = '2.5.26'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as Record<string, unknown>).__APP_VERSION__
})

describe('release modal gating', () => {
  it('does NOT show on a brand-new install (no prior run, not flagged updated)', () => {
    // No last-run marker and wasUpdated=false → fresh install → nothing.
    expect(getPendingReleaseEntry({ wasUpdated: false })).toBeNull()
    advanceRunVersion()
    expect(localStorage.getItem(LAST_RUN_KEY)).toBe('2.5.26')
    expect(getPendingReleaseEntry({ wasUpdated: false })).toBeNull()
  })

  it('shows when the main process flags this launch as an update', () => {
    const entry = getPendingReleaseEntry({ wasUpdated: true })
    expect(entry).not.toBeNull()
    expect(entry?.version).toBe('2.5.26')
    expect(entry?.summary).toBeTruthy()
    expect((entry?.links ?? []).length).toBeGreaterThan(0)
  })

  it('shows when the last-run version differs from the current version', () => {
    localStorage.setItem(LAST_RUN_KEY, '2.5.25')
    expect(getPendingReleaseEntry({ wasUpdated: false })?.version).toBe('2.5.26')
  })

  it('does not re-show once the version is marked seen (reload within a version)', () => {
    localStorage.setItem(LAST_RUN_KEY, '2.5.25')
    expect(getPendingReleaseEntry({ wasUpdated: true })).not.toBeNull()
    markReleaseSeen('2.5.26')
    expect(getPendingReleaseEntry({ wasUpdated: true })).toBeNull()
  })

  it('returns null when the running version has no changelog entry', () => {
    ;(globalThis as Record<string, unknown>).__APP_VERSION__ = '9.9.9'
    expect(getPendingReleaseEntry({ wasUpdated: true })).toBeNull()
  })

  it('does nothing in unpackaged dev (version "dev")', () => {
    ;(globalThis as Record<string, unknown>).__APP_VERSION__ = undefined
    expect(getAppVersion()).toBe('dev')
    expect(getPendingReleaseEntry({ wasUpdated: true })).toBeNull()
  })
})

describe('changelog versioning', () => {
  it('has a newest versioned entry with a semver version (release discipline)', () => {
    // The strict "newest entry version == package.json version" check lives in
    // the release gate (scripts/verify-release-assets.sh). Here we just assert
    // the changelog always carries a versioned top entry so the modal has data.
    const top = newestVersionedEntry()
    expect(top).not.toBeNull()
    expect(top?.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(top?.summary).toBeTruthy()
  })

  it('getReleaseEntryForVersion finds an entry by version', () => {
    const top = newestVersionedEntry()!
    expect(getReleaseEntryForVersion(top.version!)?.title).toBe(top.title)
    expect(getReleaseEntryForVersion('0.0.0')).toBeNull()
  })
})
