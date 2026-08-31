import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePlanDay,
  effectivePlanDay,
  DEFAULT_PLANNER_SETTINGS
} from '../../src/renderer/src/lib/attentionPlanner'

// ── DEC-087 — the three demo-blockers ───────────────────────────────────────
// (a) Capture card ran off the viewport with no scrollbar.
// (b) "Plan my day" at 6pm reported a full day instead of planning tomorrow,
//     and an intent naming a day ("…tomorrow") planned the viewed day anyway.
// (c) Editing a calendar block duplicated or resized it: single click did
//     nothing, misses booked new slots, and a 7px slip on the resize lip
//     snapped a whole 15-minute step.

const SRC = join(__dirname, '../../src/renderer/src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

// A fixed clock: Wed 2026-08-26 22:00 local — after the 17:00 default dayEnd.
const wedNight = new Date(2026, 7, 26, 22, 0, 0, 0).getTime()
// And one mid-morning: Wed 2026-08-26 10:00.
const wedMorning = new Date(2026, 7, 26, 10, 0, 0, 0).getTime()
const dayFloor = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const DAY = 24 * 60 * 60 * 1000

describe('DEC-087(b) — parsePlanDay: the intent names the DAY', () => {
  it('"tomorrow" → tomorrow at local midnight', () => {
    expect(parsePlanDay('finish the deck tomorrow', wedMorning)).toBe(dayFloor(wedMorning) + DAY)
  })
  it('"today" and "tonight" → today', () => {
    expect(parsePlanDay('plan today', wedMorning)).toBe(dayFloor(wedMorning))
    expect(parsePlanDay('wrap this up tonight', wedNight)).toBe(dayFloor(wedNight))
  })
  it('a weekday name → its NEXT occurrence (same weekday = next week)', () => {
    // wedMorning is a Wednesday; "friday" is +2 days, "wednesday" wraps +7.
    expect(parsePlanDay('prep the review for Friday', wedMorning)).toBe(
      dayFloor(wedMorning) + 2 * DAY
    )
    expect(parsePlanDay('do it wednesday', wedMorning)).toBe(dayFloor(wedMorning) + 7 * DAY)
  })
  it('no day named → null (the viewed day stands)', () => {
    expect(parsePlanDay('deep work on the proposal', wedMorning)).toBeNull()
    expect(parsePlanDay('', wedMorning)).toBeNull()
  })
})

describe('DEC-087(b) — effectivePlanDay: a closed today rolls to tomorrow', () => {
  const settings = DEFAULT_PLANNER_SETTINGS
  it('mid-morning today keeps today (slots remain)', () => {
    const r = effectivePlanDay(dayFloor(wedMorning), [], settings, wedMorning)
    expect(r.dayMs).toBe(dayFloor(wedMorning))
    expect(r.rolledToTomorrow).toBe(false)
  })
  it('10pm today rolls to tomorrow and says so', () => {
    const r = effectivePlanDay(dayFloor(wedNight), [], settings, wedNight)
    expect(r.dayMs).toBe(dayFloor(wedNight) + DAY)
    expect(r.rolledToTomorrow).toBe(true)
  })
  it('a non-today request passes through untouched — never rolled', () => {
    const friday = dayFloor(wedNight) + 2 * DAY
    const r = effectivePlanDay(friday, [], settings, wedNight)
    expect(r.dayMs).toBe(friday)
    expect(r.rolledToTomorrow).toBe(false)
  })
})

describe('DEC-087(b) — CalendarView wires day + rollover into runPlan', () => {
  const src = read('components/views/CalendarView.tsx')
  it('parsePlanDay and effectivePlanDay feed the plan target', () => {
    // DEC-090: the parsed text is askText (forceFull passes '' to plan the
    // full queue), and the effective day is computed against the WINDOWED
    // settings so "this evening" at 6pm doesn't roll to tomorrow. The
    // original pins said intent/settings; the day+rollover wiring stands.
    expect(src).toContain('parsePlanDay(askText, nowMs)')
    expect(src).toContain('effectivePlanDay(named ?? planDayMs, blocks, planSettings, nowMs)')
    // DEC-090: placement now uses the WINDOWED settings (planSettings), so
    // "later in the day" narrows the slots. The target-day wiring stands.
    expect(src).toContain('planDay(items, blocks, planSettings, targetDay.dayMs, nowMs')
  })
  it('the rollover is SAID, not silent', () => {
    expect(src).toContain('Today’s working window has closed — this plans tomorrow instead.')
  })
})

describe('DEC-087(a) — the Capture card scrolls instead of running off-screen', () => {
  const src = read('components/CaptureConsole.tsx')
  it('card is height-capped with a scrolling body', () => {
    expect(src).toContain('max-h-[76vh]')
    expect(src).toContain('min-h-0 flex-1 overflow-y-auto overscroll-contain')
  })
})

describe('DEC-087(c) — click edits; only a real drag moves or resizes', () => {
  const src = read('components/views/WeekTimeGrid.tsx')
  it('5px dead zone before any drag engages (the 15-minute-slip fix)', () => {
    expect(src).toContain('Math.abs(deltaY) < 5 && Math.abs(e.clientX - d.startClientX) < 5')
  })
  it('a drag that moved consumes the click; a still press keeps it', () => {
    expect(src).toContain('dragConsumedClickRef.current = !!d?.moved')
  })
  it('single click routes to the SAME editor as double-click', () => {
    expect(src).toContain('SINGLE click opens the editor')
    // Both handlers carry the identical routing ladder.
    const ladder = 'if (block.meeting || !block.taskId) setEditBlockState(block)'
    expect(src.split(ladder).length - 1).toBeGreaterThanOrEqual(2)
  })
})
