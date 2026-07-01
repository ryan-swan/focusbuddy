import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNodeStore } from '../../src/renderer/src/stores/nodes'

// Regression guard for "all my workspaces disappeared": a transient failure to
// load the node tree must never leave the store silently empty (which reads as
// data loss). It retries, and on real failure it records an honest error and
// preserves whatever nodes were already loaded.

function stubNodesList(list: () => Promise<unknown>): void {
  ;(globalThis as unknown as { window: unknown }).window = { api: { nodes: { list } } }
}

describe('node store load resilience', () => {
  beforeEach(() => {
    useNodeStore.setState({ nodes: [], loaded: false, error: null, loading: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries a transient failure and loads on a later attempt', async () => {
    let calls = 0
    stubNodesList(async () => {
      calls += 1
      if (calls < 2) throw new Error('database is locked')
      return [{ id: 'n1', parentId: null, kind: 'folder', title: 'Demo Workspace' }]
    })
    await useNodeStore.getState().refresh()
    const s = useNodeStore.getState()
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(s.nodes.length).toBe(1)
    expect(s.loaded).toBe(true)
    expect(s.error).toBeNull()
  })

  it('on persistent failure records an honest error and keeps existing nodes', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useNodeStore.setState({ nodes: [{ id: 'x', parentId: null, kind: 'folder', title: 'Existing' }] as any, loaded: true })
    stubNodesList(async () => {
      throw new Error('database is locked')
    })
    await useNodeStore.getState().refresh()
    const s = useNodeStore.getState()
    expect(s.error).toMatch(/locked/)
    expect(s.nodes.length).toBe(1) // preserved, never blanked to a fake-empty state
    expect(s.loading).toBe(false)
  })
})
