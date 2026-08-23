// The brand-motion policy (Brand Motion mission, 2026-08-23): the mark is
// static at rest, blinks once on mount, runs whole cycles while hovered, and
// only ever freezes on a cycle boundary. These tests pin the pure machine the
// PlexiiMark wrapper drives.
import { describe, expect, it } from 'vitest'
import {
  CYCLE_MS,
  cycleEnd,
  initial,
  pointerEnter,
  pointerLeave
} from '../../src/renderer/src/components/brand/brandMotion'

describe('brand motion machine', () => {
  it('off never animates, loop always does and never re-arms a timer', () => {
    expect(initial('off')).toEqual({ state: { animating: false, hovered: false }, timerMs: null })
    const loop = initial('loop')
    expect(loop.state.animating).toBe(true)
    expect(loop.timerMs).toBeNull()
    expect(cycleEnd(loop.state, 'loop').state.animating).toBe(true)
  })

  it('once: one cycle on mount, then frozen; hover does nothing', () => {
    const m = initial('once')
    expect(m.state.animating).toBe(true)
    expect(m.timerMs).toBe(CYCLE_MS)
    const entered = pointerEnter(m.state, 'once')
    expect(entered.state).toBe(m.state) // no hover behaviour
    const settled = cycleEnd(m.state, 'once')
    expect(settled.state.animating).toBe(false)
    expect(settled.timerMs).toBeNull()
  })

  it('hover: frozen at rest, starts on enter, settles on the boundary after leave', () => {
    const rest = initial('hover')
    expect(rest.state.animating).toBe(false)
    const entered = pointerEnter(rest.state, 'hover')
    expect(entered.state).toEqual({ animating: true, hovered: true })
    expect(entered.timerMs).toBe(CYCLE_MS)
    // leave mid-cycle: nothing stops yet — the boundary check settles it
    const left = pointerLeave(entered.state, 'hover')
    expect(left.state.animating).toBe(true)
    expect(left.timerMs).toBeNull()
    const settled = cycleEnd(left.state, 'hover')
    expect(settled.state.animating).toBe(false)
  })

  it('hover: held hover keeps whole cycles rolling', () => {
    const entered = pointerEnter(initial('hover').state, 'hover')
    const boundary = cycleEnd(entered.state, 'hover')
    expect(boundary.state.animating).toBe(true)
    expect(boundary.timerMs).toBe(CYCLE_MS) // re-armed, still hovered
  })

  it('once+hover: entering during the mount cycle rides it, no timer reset', () => {
    const m = initial('once+hover')
    const entered = pointerEnter(m.state, 'once+hover')
    expect(entered.state).toEqual({ animating: true, hovered: true })
    expect(entered.timerMs).toBeNull() // rides the already-armed cycle
    // boundary while still hovered: keep rolling; after leave: settle
    expect(cycleEnd(entered.state, 'once+hover').timerMs).toBe(CYCLE_MS)
    const left = pointerLeave(entered.state, 'once+hover')
    expect(cycleEnd(left.state, 'once+hover').state.animating).toBe(false)
  })
})
