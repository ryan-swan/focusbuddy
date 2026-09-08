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

/** Enough to preserve layout and appearance without shipping a stylesheet. */
const CAPTURED_PROPERTIES = [
  'display', 'position', 'top', 'left', 'right', 'bottom',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'padding', 'box-sizing', 'overflow',
  'flex', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'color', 'background-color', 'background-image', 'opacity',
  'border', 'border-radius', 'box-shadow',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration', 'text-transform', 'letter-spacing',
  'white-space', 'text-overflow', 'vertical-align', 'transform'
]

/** Elements that must never appear in published markup, whatever they render. */
const STRIP_SELECTOR = 'script,style,link,iframe,webview,object,embed,canvas,video,audio,input,textarea,select,button'

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
      if (!v || v === 'none' || v === 'normal' || v === 'auto' || v === '0px') continue
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
    inlineStyles(host)

    const html = host.innerHTML
    if (!html || html.length > MAX_CAPTURE_BYTES) return null
    // Nothing visible is not worth a card; the placeholder says more.
    if (!host.innerText.trim() && !host.querySelector('img,svg')) return null

    const { sanitizeHtml } = await import('./htmlSanitize')
    const clean = sanitizeHtml(html)
    return clean && clean.length <= MAX_CAPTURE_BYTES ? clean : null
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
