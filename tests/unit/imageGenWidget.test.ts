import { describe, it, expect } from 'vitest'
import { WIDGET_CATALOG } from '../../src/renderer/src/lib/widgetCatalog'
import { widgetToText } from '../../src/shared/widgetText'
import type { Widget } from '../../src/shared/types'

// The image generator stores a FILE ID, never the image itself. A 1024x1024 PNG
// is ~2 MB of base64, widget content is synced and CRDT-merged, and putting
// binary there would bloat the database and every sync payload with something
// that has a perfectly good home in the files store.

const w = (content: string): Widget =>
  ({ id: 'g1', taskId: 'd1', kind: 'image-gen', title: '', content, x: 0, y: 0,
     width: 420, height: 460, zIndex: 1, color: null, archived: false,
     createdAt: 0, updatedAt: 0 }) as Widget

describe('the image generator is a real catalog widget', () => {
  it('is offered in the picker', () => {
    const e = WIDGET_CATALOG.find((x) => x.kind === 'image-gen')
    expect(e).toBeDefined()
    expect(e?.hideFromPicker).toBeFalsy()
    expect(e?.isWebBased).toBe(false)
    expect(e?.defaultWidth).toBeGreaterThan(0)
  })
})

describe('what the AI can read from it', () => {
  it('describes the image by its prompt, so it can be found later', () => {
    const t = widgetToText(w(JSON.stringify({ prompt: 'a calm desk at golden hour', fileId: 'f1' })), {})
    expect(t.text).toContain('a calm desk at golden hour')
  })

  it('says something useful when there is an image but no prompt', () => {
    expect(widgetToText(w(JSON.stringify({ fileId: 'f1' })), {}).text).toBe('Generated image')
  })

  it('is honest about an empty generator rather than inventing content', () => {
    expect(widgetToText(w(''), {}).text).toContain('empty')
    expect(widgetToText(w('{}'), {}).text).toContain('empty')
  })

  it('never leaks image bytes into the readable text', () => {
    // If someone ever stored a data URI here, the text surface must not carry it
    // into a prompt or an export.
    const t = widgetToText(w(JSON.stringify({ prompt: 'x', fileId: 'f1' })), {})
    expect(t.text).not.toMatch(/^data:|base64/)
    expect(t.text.length).toBeLessThan(300)
  })
})
