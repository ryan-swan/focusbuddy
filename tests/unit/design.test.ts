import { describe, it, expect } from 'vitest'
import {
  DESIGN_SIZES,
  DESIGN_TEMPLATES,
  findDesignSize,
  normalizeDesignBody,
  templatesForCategory,
  designFromTemplate,
  blankDesign,
  designToHtml,
  composeDesign,
  type DesignCategory
} from '../../src/shared/design'
import type { OrgBrandKit } from '../../src/shared/brandKit'

const brand: OrgBrandKit = {
  colorPrimary: '#7c3aed',
  colorSecondary: '#0d9488',
  fontHeading: 'Georgia, serif',
  fontBody: 'Inter, sans-serif'
}

describe('design sizes', () => {
  it('ships presets across all four families', () => {
    const cats = new Set(DESIGN_SIZES.map((s) => s.category))
    for (const c of ['social', 'marketing', 'presentation', 'logo'] as DesignCategory[]) {
      expect(cats.has(c)).toBe(true)
    }
  })
  it('finds a size by id and has sane dimensions', () => {
    const ig = findDesignSize('ig-post')!
    expect(ig.w).toBe(1080)
    expect(ig.h).toBe(1080)
    for (const s of DESIGN_SIZES) {
      expect(s.w).toBeGreaterThan(0)
      expect(s.h).toBeGreaterThan(0)
    }
  })
})

describe('normalizeDesignBody', () => {
  it('fills defaults for an empty body', () => {
    const b = normalizeDesignBody({})
    expect(b.schemaVersion).toBe(1)
    expect(b.width).toBe(1080)
    expect(b.elements).toEqual([])
    expect(b.background).toEqual({ type: 'solid', color: '#ffffff' })
  })
  it('clamps absurd dimensions', () => {
    expect(normalizeDesignBody({ width: -5, height: 999999 }).width).toBe(16)
    expect(normalizeDesignBody({ width: -5, height: 999999 }).height).toBe(10000)
  })
  it('keeps provided elements', () => {
    const el = [{ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1 }]
    expect(normalizeDesignBody({ elements: el }).elements).toHaveLength(1)
  })
})

describe('templates', () => {
  it('every template builds valid, uniquely-id\'d elements at its size', () => {
    for (const t of DESIGN_TEMPLATES) {
      const size = findDesignSize(t.sizeId)!
      const out = t.build(size.w, size.h, brand)
      expect(out.elements.length).toBeGreaterThan(0)
      const ids = out.elements.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length) // unique within a template
      for (const e of out.elements) {
        expect(e.x).toBeGreaterThanOrEqual(0)
        expect(e.y).toBeGreaterThanOrEqual(0)
        expect(typeof e.z).toBe('number')
      }
    }
  })
  it('templatesForCategory filters', () => {
    expect(templatesForCategory('social').every((t) => t.category === 'social')).toBe(true)
    expect(templatesForCategory('logo').length).toBeGreaterThan(0)
  })
  it('designFromTemplate applies the brand color to the canvas', () => {
    const tpl = DESIGN_TEMPLATES.find((t) => t.id === 'social-quote')!
    const size = findDesignSize('ig-post')!
    const d = designFromTemplate(tpl, size, brand)
    expect(d.width).toBe(1080)
    expect(d.background).toEqual({ type: 'solid', color: '#7c3aed' })
    expect(d.brandApplied).toBe(true)
  })
  it('blankDesign is an empty white canvas at the size', () => {
    const d = blankDesign(findDesignSize('poster-a4')!)
    expect(d.elements).toEqual([])
    expect(d.width).toBe(794)
    expect(d.category).toBe('marketing')
  })
})

describe('designToHtml export render', () => {
  const d = designFromTemplate(
    DESIGN_TEMPLATES.find((t) => t.id === 'social-quote')!,
    findDesignSize('ig-post')!,
    { colorPrimary: '#2563eb', fontHeading: 'Inter', fontBody: 'Inter' }
  )

  it('renders a sized canvas with the background color', () => {
    const html = designToHtml(d)
    expect(html).toContain('width:1080px')
    expect(html).toContain('height:1080px')
    expect(html).toContain('background:#2563eb')
  })
  it('renders each element', () => {
    const html = designToHtml(d)
    // Every element is an absolutely-positioned node in the export.
    expect((html.match(/position:absolute/g) ?? []).length).toBeGreaterThanOrEqual(d.elements.length)
  })
  it('escapes user text in the export', () => {
    const body = composeDesign(findDesignSize('ig-post')!, { colorPrimary: '#000', fontHeading: 'Inter', fontBody: 'Inter' }, {
      headline: 'A & B <script>'
    })
    const html = designToHtml(body)
    expect(html).toContain('A &amp; B &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
