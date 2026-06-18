import { describe, it, expect } from 'vitest'
import { SLIDE_TEMPLATES } from '@shared/slideTemplates'
import { BUILTIN_THEMES } from '@shared/slideThemes'

const theme = BUILTIN_THEMES[0] // plexi-default

// ── Helpers ───────────────────────────────────────────────────────────────────

function ids(els: { id: string }[]): string[] {
  return els.map((e) => e.id)
}

// ── Core contract ─────────────────────────────────────────────────────────────

describe('SLIDE_TEMPLATES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(SLIDE_TEMPLATES)).toBe(true)
    expect(SLIDE_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('every template has id, name, description, and a build function', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      expect(typeof tpl.id).toBe('string')
      expect(tpl.id.length).toBeGreaterThan(0)
      expect(typeof tpl.name).toBe('string')
      expect(typeof tpl.description).toBe('string')
      expect(typeof tpl.build).toBe('function')
    }
  })

  it('build(theme) never throws for any template', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      expect(() => tpl.build(theme)).not.toThrow()
    }
  })

  it('"blank" template returns an empty array', () => {
    const blank = SLIDE_TEMPLATES.find((t) => t.id === 'blank')
    expect(blank).toBeDefined()
    expect(blank!.build(theme)).toEqual([])
  })

  it('non-blank templates each return at least one element', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      if (tpl.id === 'blank') continue
      const els = tpl.build(theme)
      expect(els.length, `template "${tpl.id}" returned no elements`).toBeGreaterThan(0)
    }
  })

  it('element ids are unique within a single build call', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      const els = tpl.build(theme)
      const elIds = ids(els)
      const unique = new Set(elIds)
      expect(unique.size, `template "${tpl.id}" has duplicate element ids within a single build`).toBe(elIds.length)
    }
  })

  it('element ids are unique across two consecutive builds of the same template (counter guarantee)', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      if (tpl.id === 'blank') continue // blank returns no elements
      const first = ids(tpl.build(theme))
      const second = ids(tpl.build(theme))
      const overlap = first.filter((id) => second.includes(id))
      expect(overlap, `template "${tpl.id}" reused ids across consecutive build() calls: ${overlap.join(', ')}`).toHaveLength(0)
    }
  })
})

// ── Per-template structural assertions ────────────────────────────────────────

describe('"agenda" template', () => {
  it('contains a text element whose paragraphs use listStyle "number" with multiple paragraphs', () => {
    const tpl = SLIDE_TEMPLATES.find((t) => t.id === 'agenda')!
    expect(tpl).toBeDefined()
    const els = tpl.build(theme)
    const numbered = els.find(
      (el) =>
        el.type === 'text' &&
        el.paragraphs.length > 1 &&
        el.paragraphs.every((p) => p.listStyle === 'number')
    )
    expect(numbered, 'agenda must have a text element with multiple paragraphs all using listStyle "number"').toBeDefined()
    expect(numbered!.type === 'text' && numbered!.paragraphs.length).toBeGreaterThan(1)
  })
})

describe('"comparison" template', () => {
  it('returns multiple elements including at least one shape', () => {
    const tpl = SLIDE_TEMPLATES.find((t) => t.id === 'comparison')!
    expect(tpl).toBeDefined()
    const els = tpl.build(theme)
    expect(els.length, 'comparison should return many elements').toBeGreaterThan(2)
    const shapes = els.filter((e) => e.type === 'shape')
    expect(shapes.length, 'comparison should include shape elements for the column headers').toBeGreaterThan(0)
  })

  it('contains both "Option A" and "Option B" text', () => {
    const tpl = SLIDE_TEMPLATES.find((t) => t.id === 'comparison')!
    const els = tpl.build(theme)
    const texts = els
      .filter((e) => e.type === 'text')
      .flatMap((e) => e.type === 'text' ? e.paragraphs.flatMap((p) => p.runs.map((r) => r.text)) : [])
    expect(texts.some((t) => t === 'Option A')).toBe(true)
    expect(texts.some((t) => t === 'Option B')).toBe(true)
  })
})

describe('theme application', () => {
  it('build() uses the theme accent colour in shape fills', () => {
    // Any template that has a shape should use the theme accent
    const tplWithShape = SLIDE_TEMPLATES.find(
      (t) => t.id !== 'blank' && t.build(theme).some((e) => e.type === 'shape')
    )
    expect(tplWithShape, 'at least one template should include shapes').toBeDefined()
    const els = tplWithShape!.build(theme)
    const shapeWithAccent = els.find(
      (e) => e.type === 'shape' && e.fill?.type === 'solid' && e.fill.color === theme.accent
    )
    expect(shapeWithAccent, `template "${tplWithShape!.id}" shape should use theme.accent (${theme.accent})`).toBeDefined()
  })

  it('build() with a different theme uses that theme accent', () => {
    const midnight = BUILTIN_THEMES.find((t) => t.id === 'midnight')!
    const cover = SLIDE_TEMPLATES.find((t) => t.id === 'cover')!
    const els = cover.build(midnight)
    const accentShape = els.find(
      (e) => e.type === 'shape' && e.fill?.type === 'solid' && e.fill.color === midnight.accent
    )
    expect(accentShape).toBeDefined()
  })
})

describe('all templates produce valid element types', () => {
  const validTypes = new Set(['text', 'shape', 'image', 'line'])
  it('every element has a type in the known set', () => {
    for (const tpl of SLIDE_TEMPLATES) {
      for (const el of tpl.build(theme)) {
        expect(validTypes.has(el.type), `template "${tpl.id}" produced element with unknown type "${el.type}"`).toBe(true)
      }
    }
  })
})
