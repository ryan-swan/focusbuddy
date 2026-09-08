import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PUBLIC_CAPTURE_ALLOWED,
  mayCapture,
  isPubliclyRenderable
} from '../../src/shared/publicDesk'
import { validatePublicDeskProjection } from '../../src/shared/publicDeskValidate'
import { projectWidget, NULL_RESOLVERS, type ProjectionResolvers } from '../../src/renderer/src/lib/publicDeskProjection'
import type { Widget } from '../../src/shared/types'

// Capturing a widget's rendered markup is a denylist -- you ship everything and
// strip what should not be there -- which is the opposite of how the rest of
// the projection works. It buys real fidelity for the long tail of widgets
// nobody has written a projector for, so it exists; but it is permitted only
// for kinds that show the owner's own content or a control surface, never for
// one that renders a secret, a credential, or somebody's correspondence.

function widget(kind: string, id = `w_${kind}`): Widget {
  return {
    id, taskId: 'd1', kind, title: '', content: '',
    x: 0, y: 0, width: 200, height: 120, zIndex: 0, color: null, status: null,
    pinned: false, pinnedScreenX: null, pinnedScreenY: null, pinnedZone: null,
    parentSectionId: null, layout: null, sourceAppId: null
  } as unknown as Widget
}

const withCapture = (html: string): ProjectionResolvers => ({ ...NULL_RESOLVERS, capture: () => html })

describe('what may be captured', () => {
  it('only covers kinds that have no structural projector', () => {
    for (const kind of PUBLIC_CAPTURE_ALLOWED) {
      expect(isPubliclyRenderable(kind), `${kind} has a projector and should use it`).toBe(false)
    }
  })

  it.each(['agent', 'webhook', 'inbound-hook'])('never captures %s — it renders secrets', (kind) => {
    expect(mayCapture(kind)).toBe(false)
    expect(projectWidget(widget(kind), withCapture('<div>secret</div>')).render.type).toBe('placeholder')
  })

  it.each(['email', 'chat-thread', 'meeting-record'])('never captures %s — private correspondence', (kind) => {
    expect(mayCapture(kind)).toBe(false)
    const out = projectWidget(widget(kind), withCapture('<div>Dear Bob</div>'))
    expect(out.render.type).toBe('placeholder')
    expect(JSON.stringify(out)).not.toContain('Dear Bob')
  })

  it.each([...PUBLIC_CAPTURE_ALLOWED])('publishes a capture for %s when one exists', (kind) => {
    const out = projectWidget(widget(kind), withCapture('<div>visible</div>'))
    expect(out.render.type).toBe('capture')
  })

  it('falls back to a placeholder when nothing was captured', () => {
    // A desk that could not render the widget says so, rather than an empty box.
    expect(projectWidget(widget('calculator'), NULL_RESOLVERS).render.type).toBe('placeholder')
  })
})

describe('the server enforces the same rule', () => {
  const projection = (kind: string, render: unknown): unknown => ({
    schema: 'plexi.public-desk', version: 1, deskId: 'd1', title: 'D',
    publishedAt: 1, revision: 1, bounds: { x: 0, y: 0, width: 10, height: 10 },
    widgets: [{
      id: 'w1', kind, title: '', rect: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0, color: null, parentSectionId: null, render
    }],
    links: [], assets: []
  })

  it('accepts a capture from an allowlisted kind', () => {
    const r = validatePublicDeskProjection(
      projection('calculator', { type: 'capture', html: '<div>1+1</div>', kind: 'calculator' })
    )
    expect(r.errors).toEqual([])
  })

  it('refuses a capture from a kind that is not allowlisted', () => {
    // The desktop is not the only thing standing between an agent's prompt and
    // the public page.
    const r = validatePublicDeskProjection(
      projection('agent', { type: 'capture', html: '<div>system prompt</div>', kind: 'agent' })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/has no public projector/)
  })

  it('refuses captured markup carrying a script', () => {
    const r = validatePublicDeskProjection(
      projection('calculator', { type: 'capture', html: '<div><script>alert(1)</script></div>', kind: 'calculator' })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/script or handlers/)
  })

  it('refuses captured markup carrying an event handler', () => {
    const r = validatePublicDeskProjection(
      projection('calculator', { type: 'capture', html: '<div onclick="steal()">x</div>', kind: 'calculator' })
    )
    expect(r.ok).toBe(false)
  })

  it('refuses an oversized capture', () => {
    const r = validatePublicDeskProjection(
      projection('calculator', { type: 'capture', html: 'x'.repeat(600 * 1024), kind: 'calculator' })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/exceeds 512KB/)
  })
})

describe('the capture itself', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'src', 'renderer', 'src', 'lib', 'widgetCapture.tsx'),
    'utf8'
  )

  it('renders off-screen rather than reading the canvas', () => {
    // Publishing must not require the desk to be open; that was a real bug.
    expect(src).toContain('createRoot')
    expect(src).toContain('left:-10000px')
  })

  it('strips everything executable or session-bearing before serialising', () => {
    expect(src).toContain("const STRIP_SELECTOR = 'script,style,link,iframe,webview,object,embed,canvas,video,audio'")
  })

  it('defuses controls rather than deleting them', () => {
    // A calculator's keypad and a Stream Deck's grid ARE the widget. Deleting
    // them published a calculator with no keys.
    expect(src).toContain('function defuseControls')
    expect(src).toContain("const CONTROL_SELECTOR = 'button,input,textarea,select,a,form,label'")
    // The replacement is inert: a div, carrying only style.
    expect(src).toContain("createElement('div')")
    expect(src).toContain("if (a.name === 'style') plain.setAttribute('style', a.value)")
  })

  it('states zero borders rather than implying them', () => {
    // The app's reset is `border-style: solid; border-width: 0`. Skipping the
    // zero width left a solid border at the browser default and outlined every
    // element in the capture.
    expect(src).toContain("const isBorder = prop.startsWith('border-')")
    expect(src).toContain('if (!isBorder) {')
  })

  it('captures box spacing per side, not as a shorthand', () => {
    // `margin` computes to '0px' on an element whose margin-right is 8px, so
    // capturing the shorthand dropped the spacing and labels ran together.
    expect(src).toContain("'margin-top', 'margin-right', 'margin-bottom', 'margin-left'")
    expect(src).toContain("'column-gap', 'row-gap'")
  })

  it('drops internal identifiers', () => {
    expect(src).toContain("a.name.startsWith('data-')")
  })

  it('inlines a curated style set rather than everything computed', () => {
    // Inlining every computed property costs about 9KB per element.
    expect(src).toContain('CAPTURED_PROPERTIES')
    expect(src).not.toContain('for (let i = 0; i < cs.length; i++)')
  })

  it('sanitises with a structural allowlist, not the document one', () => {
    // The editor's sanitiser allows only document tags, so it unwrapped every
    // div and a calculator's keypad arrived as the string "789456123".
    expect(src).toContain('export function sanitizeCapturedHtml')
    expect(src).toContain("'div', 'span', 'p', 'section'")
    // Only style survives, and only on the tags we keep.
    expect(src).toContain("a.name === 'style'")
  })

  it('drops the frame chrome and icon-font glyphs', () => {
    expect(src).toContain("querySelectorAll('.widget-handle')")
    expect(src).toContain('material (symbols|icons)')
  })

  it('refuses images that are not self-contained', () => {
    // A local reference is dead in a browser; a remote one phones home from
    // the reader's machine.
    expect(src).toContain("/^data:image\\//i.test(src)")
  })
})
