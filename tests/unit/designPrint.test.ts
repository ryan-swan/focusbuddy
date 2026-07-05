import { describe, it, expect } from 'vitest'
import { designPrintSize, designPrintHtml, normalizeDesignBody, type DesignBody } from '../../src/shared/design'

function design(patch: Partial<DesignBody> = {}): DesignBody {
  return {
    schemaVersion: 1,
    width: 1000,
    height: 800,
    background: { type: 'solid', color: '#ffeecc' },
    elements: [],
    ...patch
  }
}

describe('designPrintSize', () => {
  it('adds bleed + a crop-mark margin on every side', () => {
    const s = designPrintSize(design({ bleed: 20 }), { cropMarks: true })
    expect(s.bleed).toBe(20)
    expect(s.markMargin).toBe(24)
    expect(s.pageWidth).toBe(1000 + 2 * (20 + 24))
    expect(s.pageHeight).toBe(800 + 2 * (20 + 24))
  })

  it('no crop marks + no bleed leaves the trim size unchanged', () => {
    const s = designPrintSize(design(), { cropMarks: false })
    expect(s.pageWidth).toBe(1000)
    expect(s.pageHeight).toBe(800)
  })

  it('bleed alone turns crop marks on by default', () => {
    const s = designPrintSize(design({ bleed: 12 }))
    expect(s.markMargin).toBe(24)
    expect(s.pageWidth).toBe(1000 + 2 * (12 + 24))
  })
})

describe('designPrintHtml', () => {
  it('emits a page sized for bleed + marks, with the background extended and crop-mark lines', () => {
    const html = designPrintHtml(design({ bleed: 20 }), { cropMarks: true })
    expect(html).toContain('width:1088px') // 1000 + 2*(20+24)
    expect(html).toContain('#ffeecc') // background painted into the bleed box
    expect(html).toContain('<line') // crop marks
    // 4 corners × 2 lines = 8 crop-mark lines.
    expect((html.match(/<line/g) || []).length).toBe(8)
  })

  it('with no bleed and no marks it is just the trim canvas', () => {
    const html = designPrintHtml(design(), { cropMarks: false })
    expect(html).toContain('width:1000px')
    expect(html).not.toContain('<line')
  })
})

describe('normalizeDesignBody', () => {
  it('preserves a positive bleed and drops a non-positive one', () => {
    expect(normalizeDesignBody({ width: 100, height: 100, bleed: 9 }).bleed).toBe(9)
    expect(normalizeDesignBody({ width: 100, height: 100, bleed: 0 }).bleed).toBeUndefined()
    expect(normalizeDesignBody({ width: 100, height: 100 }).bleed).toBeUndefined()
  })
})
