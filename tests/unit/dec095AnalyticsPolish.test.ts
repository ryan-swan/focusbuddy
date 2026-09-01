import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toneTriplet, queueTint } from '../../src/renderer/src/lib/attentionQueues'

// ── DEC-095 — the Attention analytics band, made of material ───────────────
// Presentation only (operator ruling, same as DEC-094): the KPI tiles were
// flat swatches — one tint, no edge, no depth, nothing on hover. They are
// now house material chips. Every number, filter and handler is untouched.

const SRC = join(__dirname, '../..', 'src/renderer/src')
const css = readFileSync(join(SRC, 'styles/globals.css'), 'utf-8')
const blocks = readFileSync(join(SRC, 'components/attention/attentionBlocks.tsx'), 'utf-8')

describe('DEC-095 — toneTriplet feeds the var() alpha form safely', () => {
  it('returns a SPACE-separated triplet (GAP-018/019: commas paint nothing)', () => {
    expect(toneTriplet('#0ea5e9')).toBe('14 165 233')
    expect(toneTriplet('#10b981')).toBe('16 185 129')
    expect(toneTriplet('#ffffff')).toBe('255 255 255')
    expect(toneTriplet('#000000')).toBe('0 0 0')
  })
  it('queueTint is untouched and still returns rgba()', () => {
    expect(queueTint('#0ea5e9', 0.2)).toBe('rgba(14, 165, 233, 0.2)')
  })
})

describe('DEC-095 — the tile recipe', () => {
  it('gradient, tone ring and the shared inset highlight', () => {
    expect(css).toContain('.fb-kpi-tile {')
    expect(css).toContain('rgb(var(--kpi-tone) / 0.15)')
    expect(css).toContain('inset 0 0 0 1px rgb(var(--kpi-tone) / 0.2)')
    expect(css).toContain('var(--shadow-inset-highlight)')
  })
  it('a gloss sweep that is theme-aware and never over the content', () => {
    expect(css).toContain('.fb-kpi-tile::after')
    expect(css).toContain('.dark .fb-kpi-tile::after')
    expect(css).toContain('pointer-events: none')
    expect(css).toContain('.fb-kpi-tile > * {')
  })
  it('hover lifts and deepens; active settles', () => {
    expect(css).toContain('.fb-kpi-tile:hover')
    expect(css).toContain('transform: translateY(-2px)')
    expect(css).toContain('.fb-kpi-tile:active')
  })
  it('the selected state reads without a hover (DEC-049: the tile is a filter)', () => {
    expect(css).toContain(".fb-kpi-tile[data-on='true']")
    expect(css).toContain('inset 0 0 0 1.5px rgb(var(--kpi-tone) / 0.55)')
  })
  it('reduced motion drops the lift and the transition', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toContain('.fb-kpi-tile')
    expect(rm).toContain('transform: none')
  })
})

describe('DEC-095 — wiring', () => {
  it('tiles carry the class, the tone var and their on-state', () => {
    expect(blocks).toContain('className="fb-kpi-tile rounded-xl px-3 py-2.5 text-left fb-press"')
    expect(blocks).toContain("'--kpi-tone': toneTriplet(m.tone)")
    expect(blocks).toContain("data-on={on ? 'true' : 'false'}")
  })
  it('the status bars sit in a recessed track with glossed segments (both sites)', () => {
    expect(css).toContain('.fb-stat-track')
    expect(css).toContain('.fb-stat-seg')
    expect(blocks.split('fb-stat-track').length - 1).toBe(2)
    expect(blocks.split('fb-stat-seg').length - 1).toBe(8)
  })
  it('empty sparkline days read as absent, not as a sliver of success', () => {
    expect(blocks).toContain("n === 0\n                            ? queueTint('#64748b', 0.22)")
  })
  it('the filter behaviour is untouched', () => {
    expect(blocks).toContain('onClick={() => onPickKpi?.(m.key)}')
    expect(blocks).toContain('const on = activeKpi === m.key')
  })
})
