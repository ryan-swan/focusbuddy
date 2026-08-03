import { describe, it, expect, beforeEach } from 'vitest'
import {
  setAutomationDispatcher,
  emitAutomationEvent,
  withAutomationSuppressed,
  type AutomationEvent
} from '../../src/main/db/automationEvents'

// The event bus decouples workspace mutations from the flow engine and, crucially,
// suppresses events while a flow runs so a flow's own mutations can't re-trigger
// event flows (the loop guard). These tests pin that behaviour.

describe('automationEvents bus', () => {
  let seen: AutomationEvent[]
  beforeEach(() => {
    seen = []
    setAutomationDispatcher((e) => seen.push(e))
  })

  it('delivers an emitted event to the registered dispatcher', () => {
    emitAutomationEvent({ name: 'task-completed', nodeId: 'n1' })
    expect(seen).toEqual([{ name: 'task-completed', nodeId: 'n1' }])
  })

  it('suppresses events emitted inside withAutomationSuppressed', async () => {
    await withAutomationSuppressed(async () => {
      emitAutomationEvent({ name: 'row-added', tableId: 't1' })
    })
    expect(seen).toHaveLength(0)
    // ...and resumes delivery afterwards.
    emitAutomationEvent({ name: 'row-added', tableId: 't2' })
    expect(seen).toEqual([{ name: 'row-added', tableId: 't2' }])
  })

  it('stays suppressed until the OUTERMOST nested block exits', async () => {
    await withAutomationSuppressed(async () => {
      await withAutomationSuppressed(async () => {
        emitAutomationEvent({ name: 'task-completed', nodeId: 'inner' })
      })
      // Inner block exited, but the outer is still active — still suppressed.
      emitAutomationEvent({ name: 'task-completed', nodeId: 'outer' })
    })
    expect(seen).toHaveLength(0)
    emitAutomationEvent({ name: 'task-completed', nodeId: 'after' })
    expect(seen).toHaveLength(1)
  })

  it('restores the suppression depth even if the block throws', async () => {
    await expect(
      withAutomationSuppressed(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    // Depth must have been decremented despite the throw, so emit works again.
    emitAutomationEvent({ name: 'row-added', tableId: 't3' })
    expect(seen).toHaveLength(1)
  })

  it('a throwing dispatcher never breaks the emitting mutation', () => {
    setAutomationDispatcher(() => {
      throw new Error('handler exploded')
    })
    expect(() => emitAutomationEvent({ name: 'task-completed', nodeId: 'n' })).not.toThrow()
  })
})
