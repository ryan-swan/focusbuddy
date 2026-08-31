import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FbNode } from '../../src/shared/types'
import {
  DEFAULT_PLANNER_SETTINGS,
  parsePlanWindow,
  parsePlanSpread,
  planSpread,
  type PlannerSettings
} from '../../src/renderer/src/lib/attentionPlanner'
import { selectByKeywords } from '../../src/main/ai/planSelect'
import { intentNamesTopic } from '../../src/shared/planLanguage'

// ── DEC-090 — the plan intent stops hallucinating and learns to tell time ──
// Operator live QA: "cetra partners open items, first half of tomorrow"
// pulled RANDOM items (the model's honest empty selection was overridden by
// keyword noise), and "later in the day" packed the morning (time words went
// nowhere). Now: an empty model answer SURVIVES and offers the alternative;
// time windows and week-spread parse deterministically and constrain slots.

const S: PlannerSettings = { ...DEFAULT_PLANNER_SETTINGS } // 9:00–17:00
const DAY0 = new Date(2026, 7, 31).getTime() // Monday, local midnight
const H = 3_600_000

describe('DEC-090 — parsePlanWindow: time words become slot bounds', () => {
  const w = (s: string) => parsePlanWindow(s, S)
  it('named periods', () => {
    expect(w('knock things out this morning')).toMatchObject({ startMin: 9 * 60, endMin: 12 * 60 })
    expect(w('afternoon please')).toMatchObject({ startMin: 12 * 60, endMin: 17 * 60 })
    expect(w('do it this evening')).toMatchObject({ startMin: 17 * 60, endMin: 21 * 60 })
    expect(w('first half of the day tomorrow')).toMatchObject({ startMin: 9 * 60, endMin: 12 * 60 + 30 })
    expect(w('the second half of the day')).toMatchObject({ startMin: 12 * 60 + 30, endMin: 17 * 60 })
    expect(w('everything before noon')).toMatchObject({ startMin: 9 * 60, endMin: 12 * 60 })
  })
  it('"later in the day" no longer means the morning', () => {
    expect(w('do these later in the day')).toMatchObject({ startMin: 14 * 60, endMin: 17 * 60 })
    expect(w('later today works')).toMatchObject({ startMin: 14 * 60 })
    expect(w('end of day')).toMatchObject({ startMin: 15 * 60, endMin: 17 * 60 })
  })
  it('explicit clocks: after / before / between (bare small hours read as pm)', () => {
    expect(w('after 2pm')).toMatchObject({ startMin: 14 * 60 })
    expect(w('by 3')).toMatchObject({ startMin: 9 * 60, endMin: 15 * 60 })
    expect(w('between 2 and 4')).toMatchObject({ startMin: 14 * 60, endMin: 16 * 60 })
    expect(w('after 10am')).toMatchObject({ startMin: 10 * 60 })
  })
  it('no time words → null (the full window stands)', () => {
    expect(w('the cetra pitch deck')).toBeNull()
    expect(w('')).toBeNull()
  })
  it('every window carries a speakable label', () => {
    expect(w('this morning')!.label).toBe('the morning')
    expect(w('later in the day')!.label).toBe('later in the day')
  })
})

describe('DEC-090 — parsePlanSpread', () => {
  it('recognizes week-spreading language', () => {
    expect(parsePlanSpread('spread these across the week')).toBe(true)
    expect(parsePlanSpread('throughout the week during work hours')).toBe(true)
    expect(parsePlanSpread('over the next few days')).toBe(true)
  })
  it('plain day intents do not spread', () => {
    expect(parsePlanSpread('plan my day around cetra')).toBe(false)
    expect(parsePlanSpread('this week is busy')).toBe(false)
  })
})

describe('DEC-090 — planSpread: several workdays, weekends skipped', () => {
  const wi = (id: string): FbNode =>
    ({
      id,
      parentId: null,
      kind: 'work_item',
      title: id,
      description: '',
      status: 'open',
      sortOrder: 0,
      createdAt: DAY0,
      updatedAt: DAY0,
      workItemState: 'open',
      intentClass: 'to_do',
      groupId: null
    }) as FbNode
  it('a queue too big for one day lands across days, none on a weekend', () => {
    // 20 × 30min vs a 330min/day cap → needs 2+ days.
    const items = Array.from({ length: 20 }, (_, i) => wi(`i${i}`))
    const out = planSpread(items, [], S, DAY0, DAY0, {})
    expect(out.length).toBeGreaterThan(11) // more than one day's cap worth
    const days = new Set(out.map((p) => new Date(p.startMs).toDateString()))
    expect(days.size).toBeGreaterThanOrEqual(2)
    for (const p of out) {
      const dow = new Date(p.startMs).getDay()
      expect(dow).not.toBe(0)
      expect(dow).not.toBe(6)
    }
  })
  it('an item is planned once, not once per day', () => {
    const items = [wi('solo')]
    const out = planSpread(items, [], S, DAY0, DAY0, {})
    expect(out.filter((p) => p.itemId === 'solo').length).toBe(1)
  })
})

describe('DEC-090 — selectByKeywords: scaffolding words select nothing', () => {
  const cands = [
    { id: 'a', title: 'Review slides for new product roadmap', context: 'roadmap' },
    { id: 'b', title: 'Fantasy Football Draft - Sept 5', context: '759 League (2026)' },
    { id: 'c', title: 'Clean up Plexii menus', context: '' }
  ]
  it("the operator's failing intent now matches NOTHING when nothing relates", () => {
    expect(
      selectByKeywords(
        'identify all of my attention items related to cetra partners, open items in the first half of the day tomorrow',
        cands
      )
    ).toEqual([])
  })
  it('a real topic still selects — and only its items', () => {
    const withCetra = [...cands, { id: 'd', title: 'Cetra lease abstract QA', context: 'Cetra Partners' }]
    expect(
      selectByKeywords('cetra partners items in the first half of tomorrow', withCetra)
    ).toEqual(['d'])
  })
})

describe('DEC-090 — intentNamesTopic: scheduling language means the full queue', () => {
  it('pure scheduling intents name no topic', () => {
    expect(intentNamesTopic('spread my open items across the week during work hours')).toBe(false)
    expect(intentNamesTopic('later in the day tomorrow')).toBe(false)
    expect(intentNamesTopic('plan everything this afternoon')).toBe(false)
  })
  it('a project, person or subject IS a topic', () => {
    expect(intentNamesTopic('cetra partners items tomorrow')).toBe(true)
    expect(intentNamesTopic('fantasy football later in the day')).toBe(true)
    expect(intentNamesTopic('prep for the 759 league draft')).toBe(true)
  })
})

// ── source pins ─────────────────────────────────────────────────────────────
const SRC = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('DEC-090 — wiring pins', () => {
  it("planSelect: the model's empty answer SURVIVES (only a failed call falls back)", () => {
    const src = read('main/ai/planSelect.ts')
    expect(src).toContain('an EMPTY model selection is an honest answer')
    expect(src).not.toContain('if (!ids.length) return fallback()')
    expect(src).toContain('Time or day words')
  })
  it('runPlan applies the window to the slot settings and spreads on request', () => {
    const cal = read('renderer/src/components/views/CalendarView.tsx')
    expect(cal).toContain('dayStartMin: win.startMin, dayEndMin: win.endMin')
    expect(cal).toContain('planSpread(items, blocks, planSettings, targetDay.dayMs')
    expect(cal).toContain('Keeping it to ${win.label}.')
    // Topic-less intents route deterministically to the full queue — the
    // model never gets to misread "my open items" as a topic search.
    expect(cal).toContain('askText.trim() && intentNamesTopic(askText)')
  })
  it('the honest zero offers the alternative instead of guessing', () => {
    const cal = read('renderer/src/components/views/CalendarView.tsx')
    expect(cal).toContain("'No open items match that.'")
    expect(cal).toContain('data-testid="plan-offer-full"')
    expect(cal).toContain('Plan the rest of the day instead')
  })
})
