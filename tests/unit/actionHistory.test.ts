import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useActionHistory } from '../../src/renderer/src/stores/actionHistory'

// The unified undo/redo timeline: record pushes onto past + clears redo; undo
// runs the inverse and moves the entry to the redo stack; redo replays it. A
// fresh action after an undo drops the redo branch.

function reset(): void {
  useActionHistory.setState({ past: [], future: [], busy: false, toast: null })
}

describe('actionHistory store', () => {
  beforeEach(reset)

  it('records, undoes in LIFO order, and redoes', async () => {
    const calls: string[] = []
    const h = useActionHistory.getState()
    h.record({ label: 'A', undo: () => void calls.push('undoA'), redo: () => void calls.push('redoA') })
    h.record({ label: 'B', undo: () => void calls.push('undoB'), redo: () => void calls.push('redoB') })
    expect(useActionHistory.getState().past.map((e) => e.label)).toEqual(['A', 'B'])

    await useActionHistory.getState().undo()
    expect(calls).toEqual(['undoB'])
    expect(useActionHistory.getState().past.map((e) => e.label)).toEqual(['A'])
    expect(useActionHistory.getState().future.map((e) => e.label)).toEqual(['B'])
    expect(useActionHistory.getState().toast).toMatchObject({ kind: 'undo', label: 'B' })

    await useActionHistory.getState().redo()
    expect(calls).toEqual(['undoB', 'redoB'])
    expect(useActionHistory.getState().past.map((e) => e.label)).toEqual(['A', 'B'])
    expect(useActionHistory.getState().future).toEqual([])
  })

  it('a new action clears the redo branch', async () => {
    const h = useActionHistory.getState()
    h.record({ label: 'A', undo: () => {}, redo: () => {} })
    await useActionHistory.getState().undo()
    expect(useActionHistory.getState().future).toHaveLength(1)
    useActionHistory.getState().record({ label: 'B', undo: () => {}, redo: () => {} })
    expect(useActionHistory.getState().future).toEqual([])
    expect(useActionHistory.getState().past.map((e) => e.label)).toEqual(['B'])
  })

  it('undo/redo are no-ops on empty stacks', async () => {
    await useActionHistory.getState().undo()
    await useActionHistory.getState().redo()
    expect(useActionHistory.getState().past).toEqual([])
    expect(useActionHistory.getState().future).toEqual([])
  })

  it('recordWithToast surfaces an action toast offering undo', () => {
    useActionHistory.getState().recordWithToast({ label: 'Delete task', undo: () => {}, redo: () => {} })
    expect(useActionHistory.getState().toast).toMatchObject({ kind: 'action', label: 'Delete task' })
    expect(useActionHistory.getState().past).toHaveLength(1)
  })

  it('awaits async inverses before settling the stacks', async () => {
    const order: string[] = []
    const slow = (): Promise<void> =>
      new Promise((r) =>
        setTimeout(() => {
          order.push('ran')
          r()
        }, 5)
      )
    useActionHistory.getState().record({ label: 'X', undo: slow, redo: slow })
    await useActionHistory.getState().undo()
    expect(order).toEqual(['ran'])
    expect(useActionHistory.getState().busy).toBe(false)
    expect(useActionHistory.getState().future.map((e) => e.label)).toEqual(['X'])
  })
})
