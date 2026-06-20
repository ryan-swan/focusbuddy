import { describe, it, expect } from 'vitest'
import type { FocusSession } from '@shared/types'
import {
  summarize,
  focusByHour,
  bestFocusHours,
  topTasksByFocus,
  hourLabel
} from '../../src/renderer/src/lib/focusInsights'

function sess(over: Partial<FocusSession>): FocusSession {
  return {
    id: Math.random().toString(36).slice(2),
    taskId: null,
    kind: '5min',
    plannedSeconds: 300,
    startedAt: 0,
    completedAt: 1,
    actualSeconds: 300,
    outcome: 'done',
    ...over
  }
}

// A fixed clock: 2026-06-20T09:30 local → use Date to derive hour deterministically.
const NINE_AM = new Date(2026, 5, 20, 9, 30, 0).getTime()
const TWO_PM = new Date(2026, 5, 20, 14, 0, 0).getTime()

describe('summarize', () => {
  it('counts sessions, completion, abandoned, focused + median minutes', () => {
    const s = [
      sess({ startedAt: NINE_AM, actualSeconds: 300, outcome: 'done' }),
      sess({ startedAt: NINE_AM, actualSeconds: 600, outcome: 'continued' }),
      sess({ startedAt: NINE_AM, actualSeconds: 60, outcome: 'abandoned' }),
      sess({ startedAt: NINE_AM, completedAt: null, actualSeconds: null, outcome: null })
    ]
    const sum = summarize(s, 0)
    expect(sum.sessions).toBe(4)
    expect(sum.completed).toBe(2) // done + continued
    expect(sum.abandoned).toBe(1)
    expect(sum.focusedMinutes).toBe(16) // (300+600+60)/60 across completed = 16
    expect(sum.completionRate).toBeCloseTo(0.5)
    expect(sum.medianMinutes).toBeGreaterThan(0)
  })
  it('excludes sessions before the window', () => {
    const sum = summarize([sess({ startedAt: 1000 })], 5000)
    expect(sum.sessions).toBe(0)
  })
  it('is all-zero with no data (no fabrication)', () => {
    const sum = summarize([], 0)
    expect(sum).toEqual({
      sessions: 0,
      completed: 0,
      abandoned: 0,
      focusedMinutes: 0,
      medianMinutes: 0,
      completionRate: 0
    })
  })
})

describe('focusByHour + bestFocusHours', () => {
  it('buckets engaged minutes by local hour', () => {
    const by = focusByHour(
      [sess({ startedAt: NINE_AM, actualSeconds: 600 }), sess({ startedAt: TWO_PM, actualSeconds: 1200 })],
      0
    )
    expect(by[9]).toBe(10)
    expect(by[14]).toBe(20)
    expect(bestFocusHours(by, 1)).toEqual([14]) // 2pm had the most
  })
  it('ignores empty hours', () => {
    expect(bestFocusHours(new Array(24).fill(0))).toEqual([])
  })
})

describe('topTasksByFocus', () => {
  it('ranks tasks by focused minutes and drops unknown ids', () => {
    const s = [
      sess({ startedAt: NINE_AM, taskId: 't1', actualSeconds: 600 }),
      sess({ startedAt: NINE_AM, taskId: 't1', actualSeconds: 600 }),
      sess({ startedAt: NINE_AM, taskId: 't2', actualSeconds: 300 }),
      sess({ startedAt: NINE_AM, taskId: 'gone', actualSeconds: 9999 })
    ]
    const titleFor = (id: string): string | null => (id === 't1' ? 'Alpha' : id === 't2' ? 'Beta' : null)
    const top = topTasksByFocus(s, 0, titleFor)
    expect(top.map((t) => t.title)).toEqual(['Alpha', 'Beta']) // 'gone' dropped
    expect(top[0].minutes).toBe(20)
  })
})

describe('hourLabel', () => {
  it('formats 12h with am/pm', () => {
    expect(hourLabel(0)).toBe('12am')
    expect(hourLabel(9)).toBe('9am')
    expect(hourLabel(12)).toBe('12pm')
    expect(hourLabel(14)).toBe('2pm')
  })
})
