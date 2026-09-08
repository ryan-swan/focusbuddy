import { createRoot } from 'react-dom/client'
import type { Widget } from '@shared/types'
import { renderWidget } from '../components/widgets/renderWidget'
import { WidgetSurfaceContext } from './widgetSurface'

// Capturing a widget's own markup, for the kinds the projection has no
// structural renderer for.
//
// The widget is rendered off-screen through the same dispatcher the desk and
// the dashboard use, then serialised. Rendering it here rather than reading it
// off the canvas matters: publishing must not depend on the desk being open,
// and that is a bug this feature already had once.
//
// Two things make the output safe to publish. Styles are inlined from a curated
// property list, so the markup carries its own appearance and the public page
// never needs the app's stylesheet -- inlining everything computed costs about
// 9KB per element, which is why this list is short. And the result goes through
// the same sanitiser the editor trusts, after which the server checks again.


/** Structural tags a widget is built from. Anything else is unwrapped. */
const CAPTURE_TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'code', 'pre', 'blockquote',
  'sub', 'sup', 'mark', 'img', 'figure', 'figcaption'
])

/**
 * Sanitise captured widget markup.
 *
 * The editor's sanitiser is built for document HTML: its allowlist is
 * paragraphs and tables, so it unwrapped every div and a calculator's keypad
 * arrived as the string "789456123". Widget markup needs structure preserved
 * and everything executable removed, which is a different job.
 *
 * Only `style` survives, and only the properties we inlined. No classes, no
 * ids, no data attributes, no handlers, no javascript:/data: URLs.
 */
export function sanitizeCapturedHtml(root: HTMLElement): string {
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) walk(child)
    const tag = el.tagName.toLowerCase()
    for (const a of Array.from(el.attributes)) {
      const keep =
        a.name === 'style' ||
        (tag === 'img' && (a.name === 'src' || a.name === 'alt'))
      if (!keep) el.removeAttribute(a.name)
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? ''
      // A local file reference is dead in a browser and a remote one would
      // phone home from the reader's machine; neither belongs in a capture.
      if (!/^data:image\//i.test(src)) el.remove()
      return
    }
    if (!CAPTURE_TAGS.has(tag)) {
      // Unknown element: keep what it said, drop the element itself.
      el.replaceWith(...Array.from(el.childNodes))
    }
  }
  for (const child of Array.from(root.children)) walk(child)
  return root.innerHTML
}

/** Enough to preserve layout and appearance without shipping a stylesheet. */
const CAPTURED_PROPERTIES = [
  'display', 'position', 'top', 'left', 'right', 'bottom', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  // Individual sides, not shorthands: `margin` computes to '0px' on an element
  // whose margin-right is 8px, so capturing the shorthand dropped the spacing
  // and rows of labels ran into each other.
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'box-sizing', 'overflow',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'column-gap', 'row-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'color', 'background-color', 'background-image', 'opacity',
  'border-width', 'border-style', 'border-color', 'border-radius', 'box-shadow',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration-line', 'text-transform', 'letter-spacing',
  'white-space', 'text-overflow', 'vertical-align', 'transform'
]

/**
 * Elements that must never appear in published markup: executable, or a window
 * onto something the public has no business seeing.
 */
const STRIP_SELECTOR = 'script,style,link,iframe,webview,object,embed,canvas,video,audio'

/**
 * Controls are not stripped, they are defused. A calculator's keypad and a
 * Stream Deck's grid ARE the widget; deleting them published a calculator with
 * no keys and a deck with no buttons. Each becomes a plain element carrying the
 * same text and appearance, so it looks right and does nothing.
 */
const CONTROL_SELECTOR = 'button,input,textarea,select,a,form,label'

function defuseControls(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    const plain = document.createElement('div')
    for (const a of Array.from(el.attributes)) {
      if (a.name === 'style') plain.setAttribute('style', a.value)
    }
    // An input shows its value; everything else keeps its children.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      plain.textContent = el.value || el.placeholder || ''
    } else if (el instanceof HTMLSelectElement) {
      plain.textContent = el.selectedOptions[0]?.textContent ?? ''
    } else {
      while (el.firstChild) plain.appendChild(el.firstChild)
    }
    el.replaceWith(plain)
  }
}

const MAX_CAPTURE_BYTES = 512 * 1024
/** Rendering is asynchronous; give effects a moment to put content on screen. */
const SETTLE_MS = 450

function inlineStyles(root: HTMLElement): void {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  for (const el of all) {
    const cs = getComputedStyle(el)
    const parts: string[] = []
    for (const prop of CAPTURED_PROPERTIES) {
      const v = cs.getPropertyValue(prop)
      if (!v) continue
      // Border properties are never skipped. The app's reset sets
      // `border-style: solid; border-width: 0`, so dropping a 0px width leaves
      // a solid border at the browser's default ~3px and outlines every element
      // in the capture. A zero here has to be stated, not implied.
      const isBorder = prop.startsWith('border-')
      if (!isBorder) {
        if (v === 'none' || v === 'normal' || v === 'auto' || v === '0px') continue
      }
      parts.push(`${prop}:${v}`)
    }
    el.setAttribute('style', parts.join(';'))
    // Internal identifiers are not content and have no business being public.
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('data-') || a.name.startsWith('on') || a.name === 'class' || a.name === 'id') {
        el.removeAttribute(a.name)
      }
    }
  }
}

/**
 * Render one widget off-screen and return its sanitised markup, or null when it
 * produced nothing worth publishing. Never throws into a publish.
 */
export async function captureWidgetHtml(widget: Widget): Promise<string | null> {
  const host = document.createElement('div')
  // Off-screen rather than display:none, so layout still resolves and the
  // computed styles we inline are the real ones.
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.max(120, widget.width)}px;height:${Math.max(80, widget.height)}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(
      <WidgetSurfaceContext.Provider value="embedded">{renderWidget(widget)}</WidgetSurfaceContext.Provider>
    )
    await new Promise((r) => setTimeout(r, SETTLE_MS))

    // Remove anything executable or session-bearing before serialising, so the
    // sanitiser is a second line of defence rather than the only one.
    for (const el of Array.from(host.querySelectorAll(STRIP_SELECTOR))) el.remove()
    // The frame's own header is chrome, not content: it published the widget's
    // title followed by "edit push_pin remove open_in_full close".
    for (const el of Array.from(host.querySelectorAll('.widget-handle'))) el.remove()
    // Icon fonts do not travel. Material Symbols render their ligature as the
    // literal word without the font, so a deck button read "play_pause".
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      if (/material (symbols|icons)/i.test(getComputedStyle(el).fontFamily)) el.remove()
    }
    // Styles are inlined BEFORE controls are replaced, so a defused button
    // carries the appearance it actually had.
    inlineStyles(host)
    defuseControls(host)

    // Nothing visible is not worth a card; the placeholder says more.
    if (!host.innerText.trim() && !host.querySelector('img')) return null
    const clean = sanitizeCapturedHtml(host)
    if (!clean || clean.length > MAX_CAPTURE_BYTES) return null
    return clean
  } catch {
    return null
  } finally {
    try {
      root.unmount()
    } catch {
      /* already gone */
    }
    host.remove()
  }
}
