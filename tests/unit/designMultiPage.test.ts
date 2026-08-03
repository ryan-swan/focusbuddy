import { describe, it, expect } from 'vitest'
import { normalizeDesignBody, designToHtmlAllPages, type DesignBody } from '../../src/shared/design'

describe('design multi-page model', () => {
  it('migrates a legacy single-canvas body into one page mirroring the top level', () => {
    const b = normalizeDesignBody({ width: 800, height: 600, background: { type: 'solid', color: '#abcdef' }, elements: [{ id: 'e', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1 }] })
    expect(b.pages).toHaveLength(1)
    expect(b.activePage).toBe(0)
    expect(b.pages![0].elements).toHaveLength(1)
    expect(b.pages![0].background).toEqual({ type: 'solid', color: '#abcdef' })
    // Top level mirrors the active page.
    expect(b.elements).toBe(b.pages![0].elements)
  })

  it('loads a stored multi-page body and mirrors the active page to the top level', () => {
    const raw = {
      width: 400,
      height: 400,
      pages: [
        { id: 'p1', background: { type: 'solid', color: '#111111' }, elements: [] },
        { id: 'p2', background: { type: 'solid', color: '#222222' }, elements: [{ id: 'x', type: 'shape', shape: 'rect', x: 0, y: 0, w: 5, h: 5, z: 1 }] }
      ],
      activePage: 1
    }
    const b = normalizeDesignBody(raw)
    expect(b.pages).toHaveLength(2)
    expect(b.activePage).toBe(1)
    expect(b.background).toEqual({ type: 'solid', color: '#222222' })
    expect(b.elements).toHaveLength(1)
  })

  it('clamps an out-of-range activePage', () => {
    const b = normalizeDesignBody({ width: 100, height: 100, pages: [{ id: 'p1', elements: [] }], activePage: 5 })
    expect(b.activePage).toBe(0)
  })

  it('designToHtmlAllPages stacks each page with a page break between them', () => {
    const body: DesignBody = {
      schemaVersion: 1,
      width: 300,
      height: 200,
      elements: [],
      pages: [
        { id: 'p1', background: { type: 'solid', color: '#101010' }, elements: [] },
        { id: 'p2', background: { type: 'solid', color: '#202020' }, elements: [] },
        { id: 'p3', background: { type: 'solid', color: '#303030' }, elements: [] }
      ],
      activePage: 0
    }
    const html = designToHtmlAllPages(body)
    // Three page divs, two page-breaks between them.
    expect((html.match(/page-break-after:always/g) || []).length).toBe(2)
    expect(html).toContain('#101010')
    expect(html).toContain('#303030')
  })
})
