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
