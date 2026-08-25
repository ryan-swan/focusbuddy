// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { syncWakeCoalescer as c } from '../../src/renderer/src/lib/syncWakeCoalescer'

// Pins the fix for the dropped-wake bug: a workspace-changed wake arriving while
// a sync cycle is in flight used to be silently discarded, leaving the receiver
// on the 20s interval. The coalescer records it and grants exactly one
// follow-up cycle. These tests are the behavioural contract.

beforeEach(() => {
  c.running = false
  c.rerunRequested = false
})

describe('syncWakeCoalescer', () => {
  it('grants the slot to the first caller', () => {
    expect(c.enter()).toBe(true)
    expect(c.running).toBe(true)
  })

  it('records — not drops — a wake that lands mid-cycle, and grants one follow-up', () => {
    expect(c.enter()).toBe(true) // cycle starts
    expect(c.enter()).toBe(false) // wake during the cycle: coalesced, not dropped
    expect(c.exit()).toBe(true) // cycle ends → exactly one follow-up owed
  })

  it('coalesces N mid-cycle wakes into a single follow-up', () => {
    c.enter()
    c.enter()
    c.enter()
    c.enter() // three wakes land during one cycle
    expect(c.exit()).toBe(true) // one follow-up
    expect(c.enter()).toBe(true) // the follow-up takes the slot normally
    expect(c.exit()).toBe(false) // quiet follow-up → no further rerun; converged
  })

  it('owes no follow-up after a quiet cycle', () => {
    c.enter()
    expect(c.exit()).toBe(false)
  })

  it('re-arms across consecutive busy cycles until input goes quiet', () => {
    c.enter()
    c.enter() // wake during cycle 1
    expect(c.exit()).toBe(true) // follow-up 1 owed
    c.enter() // follow-up 1 runs
    c.enter() // wake during follow-up 1
    expect(c.exit()).toBe(true) // follow-up 2 owed
    c.enter() // follow-up 2 runs, nothing arrives
    expect(c.exit()).toBe(false) // converged
  })

  it('exit always releases the slot, even when a follow-up is owed', () => {
    c.enter()
    c.enter()
    c.exit()
    expect(c.running).toBe(false)
  })
})
