import { describe, it, expect } from 'vitest'
import { widgetText, noteWidgetText } from '../../src/main/workspaceExtras'

// Unit lock for the PURE widget content-extraction dispatcher (plexi-brain P2.5 —
// Layer 1: "every canvas widget's content reaches the brain"). widgetText() is the
// single function BOTH the keyword extras pool and the P2.5 semantic indexer call to
// turn a widget's stored `content` into ingestible text. The properties locked here:
//   • text-bearing kinds return their real prose (findable, not invisible)
//   • non-text kinds return '' so the caller SKIPS them (no UI-state / media noise,
//     no double-counting the pointer kinds whose target is already indexed)
//   • JSON-config kinds (card, page/living-doc Tiptap) parse main-side, with a safe
//     fallback to the raw string for legacy bare-string content (never throws)
// Grounded in 05-ARCHITECTURE/03-CONTENT-EXTRACTION-INVENTORY.md.

describe('widgetText — text-bearing kinds return real prose', () => {
  it('sticky / note / markdown return content verbatim', () => {
    expect(widgetText('sticky', 'Sarah Chen owns the launch')).toBe('Sarah Chen owns the launch')
    expect(widgetText('note', 'call the vet Monday')).toBe('call the vet Monday')
    expect(widgetText('markdown', '# Plan\n- ship it')).toBe('# Plan\n- ship it')
  })

  it('page (Tiptap JSON) extracts the prose from the ProseMirror tree', () => {
    const tiptap = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Acme Corp signed the contract' }] }]
    })
    expect(widgetText('page', tiptap)).toContain('Acme Corp signed the contract')
  })

  it('living-doc uses the same Tiptap path as page', () => {
    const tiptap = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'weekly digest for the team' }] }]
    })
    expect(widgetText('living-doc', tiptap)).toContain('weekly digest for the team')
  })

  it('page falls back to the raw string for legacy bare-string content (never throws)', () => {
    expect(widgetText('page', 'legacy plain text note')).toBe('legacy plain text note')
  })

  it('card joins title + body from its JSON shape', () => {
    const card = JSON.stringify({ title: 'Decision', body: 'chose vendor Acme over Globex' })
    expect(widgetText('card', card)).toBe('Decision\nchose vendor Acme over Globex')
  })

  it('card falls back to the whole string when content is not JSON', () => {
    expect(widgetText('card', 'just a plain callout')).toBe('just a plain callout')
  })
})

describe('widgetText — non-text kinds return "" so the caller skips them', () => {
  // Genuine NONE: media / UI-state / containers / freehand. Indexing these dilutes recall.
  it.each(['minimap', 'calculator', 'timer', 'color', 'scratchpad', 'section', 'image', 'video', 'shape'])(
    'non-text kind %s → ""',
    (kind) => {
      expect(widgetText(kind, '{"anything":"here"}')).toBe('')
    }
  )

  // Pointer kinds whose target is already indexed via its own path — extracting here
  // would DOUBLE-COUNT the entity. Must return '' (emit an edge later, never text).
  it.each(['task-link', 'portal', 'doc', 'sheet', 'slides', 'map', 'file'])(
    'pointer kind %s (target already indexed) → ""',
    (kind) => {
      expect(widgetText(kind, 'some-target-id')).toBe('')
    }
  )

  // External/live surfaces deferred to a later increment — not silently mis-indexed now.
  it.each(['webview', 'pdf', 'gdoc', 'gsheet', 'email', 'chat-thread'])(
    'deferred external kind %s → "" (handled in a later P2.5 increment)',
    (kind) => {
      expect(widgetText(kind, 'https://example.com')).toBe('')
    }
  )
})

describe('widgetText — robustness', () => {
  it('empty / null content never throws, returns ""', () => {
    expect(widgetText('sticky', '')).toBe('')
    // @ts-expect-error — deliberately passing a non-string to prove the guard holds
    expect(widgetText('sticky', null)).toBe('')
  })

  it('noteWidgetText is a back-compat alias of widgetText', () => {
    expect(noteWidgetText('sticky', 'x')).toBe(widgetText('sticky', 'x'))
    expect(noteWidgetText('page', 'legacy')).toBe(widgetText('page', 'legacy'))
  })
})
