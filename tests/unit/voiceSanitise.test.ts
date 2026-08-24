// The whitelist-and-drop gate for voice commands. It is the no-fakery firewall:
// anything the model emits that isn't a supported kind, or that fabricates an id /
// omits a required field, must be dropped (return null) rather than applied. The
// live AI call needs a key so isn't unit-tested; this proves the gate that stands
// between the model and the applier for the new system-wide kinds.

import { describe, it, expect } from 'vitest'
import { sanitiseProposal } from '../../src/main/ai/voiceCommand'

const NONE = new Map()
const s = (raw: unknown) => sanitiseProposal(raw, NONE, null, 0)

describe('voice sanitiser — system-wide kinds', () => {
  it('accepts a valid navigate-to and assigns an id', () => {
    const p = s({ kind: 'navigate-to', target: 'calendar', label: 'Calendar' })
    expect(p?.kind).toBe('navigate-to')
    expect(p && 'target' in p && p.target).toBe('calendar')
    expect(p?.id).toBeTruthy()
  })

  it('drops navigate-to with an unknown target', () => {
    expect(s({ kind: 'navigate-to', target: 'nonsense', label: 'x' })).toBeNull()
  })

  it('drops navigate-to to a specific object with no id (no guessing)', () => {
    expect(s({ kind: 'navigate-to', target: 'document', label: 'a doc' })).toBeNull()
    expect(s({ kind: 'navigate-to', target: 'task', label: 'a desk' })).toBeNull()
    // ...but with a real id it is accepted
    expect(s({ kind: 'navigate-to', target: 'document', targetId: 'doc_1', label: 'a doc' })?.kind).toBe('navigate-to')
  })

  it('open-url requires an http(s) url', () => {
    expect(s({ kind: 'open-url', url: 'notaurl' })).toBeNull()
    expect(s({ kind: 'open-url', url: 'https://example.com' })?.kind).toBe('open-url')
  })

  it('start-focus-session clamps minutes to 1..480', () => {
    const a = s({ kind: 'start-focus-session', minutes: 9000 })
    expect(a && 'minutes' in a && a.minutes).toBe(480)
    const b = s({ kind: 'start-focus-session', minutes: 0 })
    expect(b && 'minutes' in b && b.minutes).toBe(1)
  })

  it('create-document only accepts a real docType', () => {
    expect(s({ kind: 'create-document', docType: 'exe', title: 'x' })).toBeNull()
    expect(s({ kind: 'create-document', docType: 'sheet', title: 'Budget' })?.kind).toBe('create-document')
  })

  it('schedule-event needs a title AND a positive startMs (no invented date)', () => {
    expect(s({ kind: 'schedule-event', title: 'Standup', durationMinutes: 30 })).toBeNull() // no startMs
    expect(s({ kind: 'schedule-event', title: '', startMs: 123 })).toBeNull() // no title
    const ok = s({ kind: 'schedule-event', title: 'Standup', startMs: 1_800_000_000_000, durationMinutes: 9999 })
    expect(ok?.kind).toBe('schedule-event')
    expect(ok && 'durationMinutes' in ok && ok.durationMinutes).toBe(1440) // clamped
  })

  it('create-knowledge-entry requires non-empty title AND body', () => {
    expect(s({ kind: 'create-knowledge-entry', title: 'x', body: '' })).toBeNull()
    expect(s({ kind: 'create-knowledge-entry', title: 'Note', body: 'real content' })?.kind).toBe('create-knowledge-entry')
  })

  it('compose-mail needs at least a subject or body', () => {
    expect(s({ kind: 'compose-mail', to: ['a@b.com'] })).toBeNull()
    expect(s({ kind: 'compose-mail', subject: 'Hi', body: 'there' })?.kind).toBe('compose-mail')
  })

  it('drops an entirely unknown kind', () => {
    expect(s({ kind: 'launch-missiles' })).toBeNull()
  })

  it('drops canvas-target kinds when there is no active task / snapshot', () => {
    // create-widget needs an active task; with none it must be dropped.
    expect(s({ kind: 'create-widget', widgetKind: 'sticky', title: 'x' })).toBeNull()
  })

  // R16 harmonisation (A3 build 1): the web never demands a canvas. A webview
  // create-widget with no desk open converts to open-url — the in-app browser
  // panel is its destination — instead of being silently dropped (voice that
  // talks but never acts was the live symptom).
  it('converts a no-canvas webview create-widget into open-url (R16)', () => {
    const p = s({
      kind: 'create-widget',
      widgetKind: 'webview',
      title: 'The Knot',
      content: 'https://www.theknot.com'
    })
    expect(p?.kind).toBe('open-url')
    expect(p && 'url' in p && p.url).toBe('https://www.theknot.com')
    expect(p && 'title' in p && p.title).toBe('The Knot')
  })

  it('still drops a no-canvas webview whose content is not a real address', () => {
    expect(
      s({ kind: 'create-widget', widgetKind: 'webview', title: 'x', content: 'wedding stuff' })
    ).toBeNull()
  })

  it('keeps create-widget as create-widget when a desk IS open', () => {
    const p = sanitiseProposal(
      { kind: 'create-widget', widgetKind: 'webview', title: 'The Knot', content: 'https://www.theknot.com' },
      NONE,
      'task_1',
      0
    )
    expect(p?.kind).toBe('create-widget')
  })
})
