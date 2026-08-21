import { describe, it, expect, beforeEach } from 'vitest'
import { useViewStore } from '../../src/renderer/src/stores/view'
import { recentModuleKeys } from '../../src/renderer/src/lib/viewRecency'

// Phase 1 of the Plexii AI mission: the hub is a real navigation destination.
// goPlexii commits like every other view — history, persistence and recency all
// treat it as a first-class module, so Back works from the hub and a restart
// lands back on it.

describe('plexii hub navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    useViewStore.setState({ view: { kind: 'home' }, past: [], future: [] })
  })

  it('goPlexii commits the plexii view', () => {
    useViewStore.getState().goPlexii()
    expect(useViewStore.getState().view).toEqual({ kind: 'plexii' })
  })

  it('participates in back/forward history like any view', () => {
    const s = useViewStore.getState()
    s.goPlexii()
    expect(useViewStore.getState().past.at(-1)).toEqual({ kind: 'home' })
    useViewStore.getState().back()
    expect(useViewStore.getState().view).toEqual({ kind: 'home' })
    useViewStore.getState().forward()
    expect(useViewStore.getState().view).toEqual({ kind: 'plexii' })
  })

  it('persists as the last view so a reload resumes on the hub', () => {
    useViewStore.getState().goPlexii()
    expect(JSON.parse(localStorage.getItem('fb.view.last') ?? 'null')).toEqual({ kind: 'plexii' })
  })

  it('is recorded as a visited module for command-palette recency', () => {
    useViewStore.getState().goPlexii()
    expect(recentModuleKeys()).toContain('plexii')
  })
})
