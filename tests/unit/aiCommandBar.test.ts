import { describe, it, expect, beforeEach } from 'vitest'
import { useAiCommandBar } from '../../src/renderer/src/stores/aiCommandBar'

// The store backs the single "Ask AI" command bar so any surface (header,
// Cmd+Shift+K, the canvas toolbar) can open it, and carries the build hand-off
// from the command bar to the canvas builder preview.

beforeEach(() => {
  useAiCommandBar.setState({ open: false, handoff: null })
})

describe('useAiCommandBar', () => {
  it('opens and closes via setOpen', () => {
    useAiCommandBar.getState().setOpen(true)
    expect(useAiCommandBar.getState().open).toBe(true)
    useAiCommandBar.getState().setOpen(false)
    expect(useAiCommandBar.getState().open).toBe(false)
  })

  it('toggle flips the open state', () => {
    expect(useAiCommandBar.getState().open).toBe(false)
    useAiCommandBar.getState().toggle()
    expect(useAiCommandBar.getState().open).toBe(true)
    useAiCommandBar.getState().toggle()
    expect(useAiCommandBar.getState().open).toBe(false)
  })

  it('carries and clears the build hand-off', () => {
    const handoff = {
      suggestions: [{ id: 's1', kind: 'table', title: 'Episodes', reason: 'track episodes' }] as never,
      intent: 'a podcast tracker'
    }
    useAiCommandBar.getState().setHandoff(handoff)
    expect(useAiCommandBar.getState().handoff?.intent).toBe('a podcast tracker')
    expect(useAiCommandBar.getState().handoff?.suggestions).toHaveLength(1)
    useAiCommandBar.getState().setHandoff(null)
    expect(useAiCommandBar.getState().handoff).toBeNull()
  })
})
