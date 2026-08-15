// Unit tests for the live-canvas migration helpers (lib/liveCanvas.ts).
//
// The live-canvas mechanism itself is retired (WS01 lock-retire Stage D1): a desk
// now collaborates by sharing the real desk on the CRDT substrate, and legacy
// docType:'canvas' live-docs convert to a real desk on open. What remains is the
// pure, deterministic parse half — turning a stored (or legacy) JSON body back into
// a usable CanvasBody, reading defensively so a corrupt or foreign body fails to a
// clean null rather than throwing in the render path — which the migration path
// still depends on (applyCanvasBodyToTask, exercised by the desktop e2e because it
// depends on window.api). serializeCanvasBody and emptyCanvasBody were removed with
// the mechanism they served and are no longer under test here.

import { describe, it, expect } from 'vitest'
import { parseCanvasBody, type CanvasBody } from '../../src/renderer/src/lib/liveCanvas'

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
