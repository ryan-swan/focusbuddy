import { describe, it, expect, beforeEach } from 'vitest'
import { focusBlocksQuickAdd, quickAddAllowed, deepActiveElement } from '../../src/renderer/src/lib/quickAddFocus'

// Single-key quick-add (S=sticky, T=table, …) turned ordinary typing into
// object creation. The reported repro: click a sticky, start typing before its
// editor has focus, and a sticky, a table and a timer appear.
//
// The old guard was a deny-list over document.activeElement -- INPUT, TEXTAREA,
// contenteditable. Everything below is a case that list waved through.

function el(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild!
}

const ON_DESK = { activeTaskId: 'desk_1', activeWidgetId: null, focusedWidgetId: null }

describe('focusBlocksQuickAdd — what counts as typing', () => {
  it.each([
    ['<input />', 'a text input'],
    ['<textarea></textarea>', 'a textarea'],
    ['<select><option>a</option></select>', 'a select'],
    ['<button>Save</button>', 'a button'],
    ['<a href="#">link</a>', 'a link'],
    ['<div contenteditable="true">x</div>', 'a contenteditable'],
    ['<div role="textbox">x</div>', 'an ARIA textbox'],
    ['<div role="combobox">x</div>', 'an ARIA combobox'],
    ['<div role="dialog">x</div>', 'anything inside a dialog'],
    ['<div data-no-shortcuts>x</div>', 'an explicit opt-out']
  ])('blocks on %s (%s)', (html) => {
    expect(focusBlocksQuickAdd(el(html))).toBe(true)
  })

  it('blocks inside a webview, whose contents we cannot inspect', () => {
    // A user typing into an embedded browser is invisible to us; treating that
    // as "not typing" is how letters leaked through to the canvas.
    expect(focusBlocksQuickAdd(el('<webview></webview>'))).toBe(true)
    expect(focusBlocksQuickAdd(el('<iframe></iframe>'))).toBe(true)
  })

  it('blocks a plain element nested inside an editor', () => {
    const editor = el('<div contenteditable="true"><span id="inner">word</span></div>')
    document.body.appendChild(editor)
    const inner = editor.querySelector('#inner')!
    // jsdom does not implement isContentEditable, so the ancestor walk is what
    // actually carries this case -- and it is the common one in TipTap.
    expect(focusBlocksQuickAdd(inner)).toBe(true)
    editor.remove()
  })

  it('allows the bare canvas surface', () => {
    expect(focusBlocksQuickAdd(el('<div data-bare-canvas></div>'))).toBe(false)
    expect(focusBlocksQuickAdd(null)).toBe(false)
  })
})

describe('quickAddAllowed — the whole decision', () => {
  it('fires on a desk with nothing engaged', () => {
    expect(quickAddAllowed({ ...ON_DESK, focusedElement: null })).toBe(true)
  })

  it('does not fire without a desk open', () => {
    expect(
      quickAddAllowed({ activeTaskId: null, activeWidgetId: null, focusedWidgetId: null, focusedElement: null })
    ).toBe(false)
  })

  it('does not fire while a widget is activated, even with focus still on the body', () => {
    // This is the reported bug. Clicking into a sticky activates it well before
    // its editor wins focus; during that window activeElement is the body, so
    // the old guard saw "not typing" and created objects.
    expect(
      quickAddAllowed({
        activeTaskId: 'desk_1',
        activeWidgetId: 'w_sticky',
        focusedWidgetId: null,
        focusedElement: document.body
      })
    ).toBe(false)
  })

  it('does not fire in focus mode', () => {
    expect(
      quickAddAllowed({
        activeTaskId: 'desk_1',
        activeWidgetId: null,
        focusedWidgetId: 'w_doc',
        focusedElement: null
      })
    ).toBe(false)
  })

  it('does not fire while a control has focus', () => {
    expect(quickAddAllowed({ ...ON_DESK, focusedElement: el('<input />') })).toBe(false)
  })
})

describe('deepActiveElement', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('reports the element inside a shadow root, not its host', () => {
    // activeElement stops at the host, so focus inside a shadow root read as
    // "the host div" -- not an input, therefore not typing, therefore letters
    // became shortcuts.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    shadow.appendChild(input)
    input.focus()
    expect(deepActiveElement()).toBe(input)
    expect(focusBlocksQuickAdd(deepActiveElement())).toBe(true)
  })
})
