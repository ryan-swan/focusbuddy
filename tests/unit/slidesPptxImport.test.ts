import { describe, it, expect } from 'vitest'
import pptxgen from 'pptxgenjs'
import { parsePptx } from '../../src/main/slidesIo'

// Build a real .pptx with pptxgenjs (the same library our exporter uses), then
// import it back through parsePptx. This is a genuine round-trip: text AND
// speaker notes must survive, proving import no longer silently drops notes.
async function buildPptx(): Promise<Uint8Array> {
  const pptx = new pptxgen()
  const s1 = pptx.addSlide()
  s1.addText('Quarter in review', { x: 0.5, y: 0.3, w: 9, h: 1 })
  s1.addText('Revenue up 20%', { x: 0.5, y: 1.5, w: 9, h: 1 })
  s1.addNotes('Open with the headline number, then slow down on the risks slide.')

  const s2 = pptx.addSlide()
  s2.addText('Next quarter', { x: 0.5, y: 0.3, w: 9, h: 1 })
  // s2 intentionally has no notes.

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return new Uint8Array(out as Buffer)
}

// A 1x1 transparent PNG, embedded so we can prove images survive import.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function buildPptxWithImage(): Promise<Uint8Array> {
  const pptx = new pptxgen()
  const s = pptx.addSlide()
  s.addText('Slide with a picture', { x: 0.5, y: 0.3, w: 9, h: 1 })
  s.addImage({ data: `image/png;base64,${PNG_1x1}`, x: 1, y: 2, w: 3, h: 2 })
  const out = await pptx.write({ outputType: 'nodebuffer' })
  return new Uint8Array(out as Buffer)
}

async function buildPptxWithTable(): Promise<Uint8Array> {
  const pptx = new pptxgen()
  const s = pptx.addSlide()
  s.addText('Quarterly figures', { x: 0.5, y: 0.3, w: 9, h: 1 })
  s.addTable(
    [
      [{ text: 'Region' }, { text: 'Revenue' }],
      [{ text: 'North' }, { text: '120' }],
      [{ text: 'South' }, { text: '95' }]
    ],
    { x: 1, y: 2, w: 6, h: 2 }
  )
  const out = await pptx.write({ outputType: 'nodebuffer' })
  return new Uint8Array(out as Buffer)
}

describe('parsePptx — speaker notes round-trip', () => {
  it('imports slides with their text', async () => {
    const res = await parsePptx(await buildPptx(), 'deck.pptx')
    expect(res.ok).toBe(true)
    expect(res.body!.slides).toHaveLength(2)
  })

  it('preserves a slide\'s speaker notes (previously dropped on import)', async () => {
    const res = await parsePptx(await buildPptx(), 'deck.pptx')
    const first = res.body!.slides[0]
    expect(first.notes).toContain('Open with the headline number')
    expect(first.notes).toContain('slow down on the risks slide')
  })

  it('leaves notes empty for a slide that has none — no invented text', async () => {
    const res = await parsePptx(await buildPptx(), 'deck.pptx')
    // The slide-number placeholder must not leak in as fake notes.
    expect(res.body!.slides[1].notes.trim()).toBe('')
  })

  it('returns an honest error for a non-pptx buffer', async () => {
    const res = await parsePptx(new Uint8Array([1, 2, 3]), 'x.pptx')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})

describe('parsePptx — image round-trip', () => {
  it('imports an embedded picture as a positioned image element (previously dropped)', async () => {
    const res = await parsePptx(await buildPptxWithImage(), 'deck.pptx')
    expect(res.ok).toBe(true)
    const images = (res.body!.slides[0].elements ?? []).filter((e) => e.type === 'image')
    expect(images).toHaveLength(1)
    const img = images[0] as { src: string; x: number; y: number; w: number; h: number }
    expect(img.src.startsWith('data:image/png;base64,')).toBe(true)
    // Positioned within the 1280x720 logical canvas, not at the origin.
    expect(img.x).toBeGreaterThan(0)
    expect(img.y).toBeGreaterThan(0)
    expect(img.w).toBeGreaterThan(0)
    expect(img.h).toBeGreaterThan(0)
    expect(img.x).toBeLessThan(1280)
    expect(img.y).toBeLessThan(720)
  })

  it('keeps the slide\'s text alongside the imported image', async () => {
    const res = await parsePptx(await buildPptxWithImage(), 'deck.pptx')
    const els = res.body!.slides[0].elements ?? []
    expect(els.some((e) => e.type === 'text')).toBe(true)
    expect(els.some((e) => e.type === 'image')).toBe(true)
  })
})

describe('parsePptx — table round-trip', () => {
  it('imports a pptx table as a table element with its cells (previously dropped)', async () => {
    const res = await parsePptx(await buildPptxWithTable(), 'deck.pptx')
    const tables = (res.body!.slides[0].elements ?? []).filter((e) => e.type === 'table')
    expect(tables).toHaveLength(1)
    const t = tables[0] as { cells: string[][]; x: number; y: number }
    expect(t.cells).toEqual([
      ['Region', 'Revenue'],
      ['North', '120'],
      ['South', '95']
    ])
    expect(t.x).toBeGreaterThan(0)
    expect(t.y).toBeGreaterThan(0)
  })

  it('does not leak the table cell text into the slide bullets', async () => {
    const res = await parsePptx(await buildPptxWithTable(), 'deck.pptx')
    const bulletText = (res.body!.slides[0].elements ?? [])
      .filter((e) => e.type === 'text')
      .map((e) => JSON.stringify(e))
      .join(' ')
    // "Revenue"/"North" belong to the table, not the body text.
    expect(bulletText).not.toContain('North')
    expect(bulletText).not.toContain('120')
  })
})
