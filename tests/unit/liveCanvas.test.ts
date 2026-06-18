// Unit tests for the live-canvas body parse/build helpers (lib/liveCanvas.ts).
//
// These cover the pure, deterministic half of the canvas collaboration core:
// turning a stored JSON body back into a usable CanvasBody, reading defensively
// so a corrupt or foreign body fails to a clean null rather than throwing in
// the render path, and producing a well-formed empty body. serializeCanvasBody
// is exercised by the desktop e2e because it depends on window.api.

import { describe, it, expect } from 'vitest'
import {
  parseCanvasBody,
  emptyCanvasBody,
  CANVAS_BODY_VERSION,
  type CanvasBody
} from '../../src/renderer/src/lib/liveCanvas'

describe('parseCanvasBody', () => {
  it('round-trips a well-formed body', () => {
    const body: CanvasBody = {
      version: 1,
      title: 'Launch plan',
      widgets: [
        {
          id: 'w1',
          kind: 'sticky',
          title: 'Idea',
          content: 'ship it',
          x: 10,
          y: 20,
          width: 280,
          height: 200,
          color: '#ffd'
        }
      ],
      links: [{ sourceWidgetId: 'w1', targetWidgetId: 'w2', type: 'context', enabled: true }]
    }
    const parsed = parseCanvasBody(JSON.stringify(body))
    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe('Launch plan')
    expect(parsed!.widgets).toHaveLength(1)
    expect(parsed!.widgets[0].id).toBe('w1')
    expect(parsed!.links).toHaveLength(1)
    expect(parsed!.links[0].sourceWidgetId).toBe('w1')
  })

  it('returns null for non-JSON', () => {
    expect(parseCanvasBody('not json {')).toBeNull()
  })

  it('returns null when widgets is missing or not an array', () => {
    expect(parseCanvasBody(JSON.stringify({ title: 'x', links: [] }))).toBeNull()
    expect(parseCanvasBody(JSON.stringify({ widgets: 'nope' }))).toBeNull()
  })

  it('returns null for a JSON primitive or null', () => {
    expect(parseCanvasBody('42')).toBeNull()
    expect(parseCanvasBody('null')).toBeNull()
    expect(parseCanvasBody('"a string"')).toBeNull()
  })

  it('defaults missing optional fields rather than failing', () => {
    // A body with widgets but no title/version/links is still usable.
    const parsed = parseCanvasBody(JSON.stringify({ widgets: [] }))
    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe('Untitled desk')
    expect(parsed!.version).toBe(1)
    expect(parsed!.links).toEqual([])
  })

  it('tolerates a non-array links field by treating it as empty', () => {
    const parsed = parseCanvasBody(JSON.stringify({ widgets: [], links: { bad: true } }))
    expect(parsed).not.toBeNull()
    expect(parsed!.links).toEqual([])
  })
})

describe('emptyCanvasBody', () => {
  it('produces a parseable empty body at the current version', () => {
    const raw = emptyCanvasBody('My desk')
    const parsed = parseCanvasBody(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(CANVAS_BODY_VERSION)
    expect(parsed!.title).toBe('My desk')
    expect(parsed!.widgets).toEqual([])
    expect(parsed!.links).toEqual([])
  })

  it('falls back to a default title when given an empty string', () => {
    const parsed = parseCanvasBody(emptyCanvasBody(''))
    expect(parsed!.title).toBe('Untitled desk')
  })
})
