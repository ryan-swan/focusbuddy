import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── DEC-094 — the plan review reads like Book time's sibling ────────────────
// Presentation only, by operator ruling: every handler, every behaviour and
// every model from DEC-071/089/092 is untouched. What changed is what it
// LOOKS like — the mark in a tile, one start time instead of a range, a
// duration chip, day rules with real spans, the empty time between rows made
// visible, and a primary action that looks primary.

const SRC = join(__dirname, '../..', 'src')
const cal = readFileSync(join(SRC, 'renderer/src/components/views/CalendarView.tsx'), 'utf-8')

describe('DEC-094 — header and framing', () => {
  it('the mark sits in an accent tile', () => {
    expect(cal).toContain('rounded-[var(--radius-chip)] bg-accent/15 inline-flex')
  })
  it('the subtitle speaks in hours, and names the day span when there is one', () => {
    expect(cal).toContain('fmtSpan(proposals.reduce((n, x) => n + x.durationMin, 0))')
    expect(cal).toContain('reviewDayCount > 1 ? ` across ${reviewDayCount} days` : \'\'')
    // the promise itself is unchanged (DEC-071)
    expect(cal).toContain('nothing is booked until you accept')
  })
  it('the prompt echo is one quiet quoted line, not a labelled grey block', () => {
    expect(cal).toContain('“{planIntent}”')
    expect(cal).not.toContain('You asked for')
  })
})

describe('DEC-094 — rows', () => {
  it('ONE start time in a fixed tabular column (the end lives in the tooltip)', () => {
    expect(cal).toContain('fb-tabular text-[var(--ink-70)] hover:text-[rgb(var(--accent))] shrink-0 w-[82px]')
    expect(cal).toContain('title={`Change the day or start time — ends ${new Date(')
  })
  it('duration is a chip', () => {
    expect(cal).toContain('h-7 min-w-[46px] px-2 rounded-[var(--radius-chip)] border')
    expect(cal).toContain('{fmtSpan(pr.durationMin)}')
  })
  it('an overlap is an amber chip, not a sentence in the row', () => {
    expect(cal).toContain('border-amber-500/40 bg-amber-500/10')
    expect(cal).toContain('overlaps')
  })
  it('the whole row is still the drag surface — no six-dot grip anywhere', () => {
    expect(cal).toContain('cursor-grab active:cursor-grabbing')
    expect(cal).not.toContain('drag_indicator')
  })
})

describe('DEC-094 — the empty time between rows is visible', () => {
  it('a gap rule carries the span; 30m+ reads as open', () => {
    expect(cal).toContain('data-testid="plan-gap-rule"')
    expect(cal).toContain("gapMin >= 30 ? ' open' : ''")
  })
  it('gaps are computed from the data that was already there', () => {
    expect(cal).toContain('(pr.startMs - (prev.startMs + prev.durationMin * 60_000)) / 60_000')
  })
})

describe('DEC-094 — day headers and footer', () => {
  it('each day carries its own total as a span', () => {
    expect(cal).toContain('{fmtSpan(ps.reduce((n, x) => n + x.durationMin, 0))}')
  })
  it('the primary action looks primary and keeps its keycap', () => {
    expect(cal).toContain('!h-9 !px-4 font-semibold shadow-[0_2px_10px_rgb(var(--accent)/0.35)]')
    expect(cal).toContain('<span>Accept plan</span>')
  })
  it('the hint still teaches the two gestures that exist', () => {
    expect(cal).toContain('Drag rows to reorder · click a time or duration to edit it.')
  })
})

describe('DEC-094 — behaviour is untouched', () => {
  it('every DEC-089 control is still wired', () => {
    for (const pin of [
      'data-testid="plan-review-row"',
      'data-testid="plan-row-when"',
      'data-testid="plan-row-dur"',
      'data-testid="plan-row-date"',
      'data-testid="plan-row-time"',
      'data-testid="plan-row-dur-input"',
      'reorderProposal(from, pr.uid!, over.pos)',
      'dropProposal(pr.uid!)'
    ])
      expect(cal).toContain(pin)
  })
  it('the native pickers survive this pass — they only wear the accent', () => {
    expect(cal).toContain('type="date"')
    expect(cal).toContain('type="time"')
    expect(cal).toContain('[accent-color:rgb(var(--accent))]')
  })
})

describe('DEC-094 — the affinity note reads as a sentence', () => {
  const planner = readFileSync(join(SRC, 'renderer/src/lib/attentionPlanner.ts'), 'utf-8')
  it('separated from the lateness clause and clipped on a word boundary', () => {
    expect(planner).toContain('` · Grouped beside “${clipTitle(')
    expect(planner).toContain('function clipTitle(')
  })
})
