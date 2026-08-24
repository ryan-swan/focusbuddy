import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import EnginePickerChip from './EnginePickerChip'
import { useWebPanel } from '../../stores/webPanel'
import { sanitizeWebviewUrl } from '../../lib/browserUrl'

// The in-app browser panel (A2, AI-03, R4/R13): the web never leaves Plexi.
// One right-side panel serves citations, omnibar URLs, and search results —
// Claude-style, over the content, dismissed with Esc or its close control.
// The system browser is the explicit escape in the toolbar, never the
// default. Mounted globally (portal) by AssistantOverlay, which is always
// on screen, so no shared layout file had to change hands (lane law).

// The webview element's imperative surface, the parts this toolbar uses.
interface WebviewEl extends HTMLElement {
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function WebPanel(): React.JSX.Element | null {
  const open = useWebPanel((s) => s.open)
  const url = useWebPanel((s) => s.url)
  const close = useWebPanel((s) => s.close)
  const expanded = useWebPanel((s) => s.expanded)
  const toggleExpanded = useWebPanel((s) => s.toggleExpanded)
  const webviewRef = useRef<WebviewEl | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [title, setTitle] = useState('')
  // The webview's src is set ONCE per requested URL (the widget's hard-won
  // lesson: rebinding src on every navigation reloads the page mid-POST).
  const src = sanitizeWebviewUrl(url ?? '')

  useEffect(() => {
    if (!open) return
    const wv = webviewRef.current
    if (!wv) return
    const nav = (): void => {
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      setCurrentUrl(wv.getURL())
    }
    const onTitle = (e: Event): void => {
      const t = (e as unknown as { title?: string }).title
      if (t) setTitle(t)
    }
    const start = (): void => setLoading(true)
    const stop = (): void => {
      setLoading(false)
      nav()
    }
    wv.addEventListener('did-navigate', nav)
    wv.addEventListener('did-navigate-in-page', nav)
    wv.addEventListener('did-start-loading', start)
    wv.addEventListener('did-stop-loading', stop)
    wv.addEventListener('page-title-updated', onTitle)
    return () => {
      wv.removeEventListener('did-navigate', nav)
      wv.removeEventListener('did-navigate-in-page', nav)
      wv.removeEventListener('did-start-loading', start)
      wv.removeEventListener('did-stop-loading', stop)
      wv.removeEventListener('page-title-updated', onTitle)
    }
  }, [open, src])

  // Fullscreen means "like a connected app" (Caleb's ruling on the live
  // drive): the browser fills the CONTENT area — the nav rail stays visible
  // and clickable, exactly like opening Claude or Slack. The panel is a
  // fixed portal (so expanding never remounts the webview and never reloads
  // the page), so the content rectangle is measured from the live layout —
  // <main> minus the sidebar dock — and tracked per frame while expanded,
  // which also follows sidebar resizes and collapses for free.
  const [fullRect, setFullRect] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  useEffect(() => {
    if (!open || !expanded) {
      setFullRect(null)
      return
    }
    let raf = 0
    const tick = (): void => {
      const main = document.querySelector('main')
      if (main) {
        const m = main.getBoundingClientRect()
        const aside = document.querySelector(
          '[data-testid="desk-sidebar"], [data-testid="desk-sidebar-collapsed"]'
        )
        const left = aside
          ? Math.min(Math.max(aside.getBoundingClientRect().right + 6, m.left), m.right - 320)
          : m.left
        setFullRect((prev) => {
          const next = { top: m.top, left, width: m.right - left, height: m.height }
          return prev &&
            prev.top === next.top &&
            prev.left === next.left &&
            prev.width === next.width &&
            prev.height === next.height
            ? prev
            : next
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, expanded])

  // Esc steps DOWN: a fullscreen browser first returns to the panel, a
  // second Esc closes it. (The webview swallows its own keys; this catches
  // the chrome.)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (useWebPanel.getState().expanded) toggleExpanded()
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, toggleExpanded])

  if (!open || !src) return null

  return createPortal(
    <aside
      data-testid="web-panel"
      data-expanded={expanded ? 'true' : 'false'}
      className={`fixed z-[130] flex flex-col bg-[var(--surface-raised)] overflow-hidden ${
        expanded
          ? ''
          : 'top-10 bottom-7 right-[14px] w-[min(560px,calc(100vw-120px))] rounded-[var(--radius-card)] fb-fade-in-up'
      }`}
      style={
        expanded && fullRect
          ? { top: fullRect.top, left: fullRect.left, width: fullRect.width, height: fullRect.height }
          : expanded
            ? { top: 40, left: 90, right: 8, bottom: 28 }
            : {
                boxShadow:
                  '0 0 0 1px var(--edge-hairline), var(--shadow-cast), var(--shadow-inset-highlight)'
              }
      }
    >
      <div
        className={`flex items-center gap-1 shrink-0 ${
          expanded
            ? 'px-3 py-2 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]'
            : 'px-2 py-1.5 bg-[var(--surface-raised)]'
        }`}
      >
        <button
          className="icon-btn !h-6 !w-6"
          disabled={!canGoBack}
          onClick={() => webviewRef.current?.goBack()}
          title="Back"
        >
          <Icon name="arrow_back" size={14} />
        </button>
        <button
          className="icon-btn !h-6 !w-6"
          disabled={!canGoForward}
          onClick={() => webviewRef.current?.goForward()}
          title="Forward"
        >
          <Icon name="arrow_forward" size={14} />
        </button>
        <button
          className="icon-btn !h-6 !w-6"
          onClick={() => (loading ? webviewRef.current?.stop() : webviewRef.current?.reload())}
          title={loading ? 'Stop' : 'Reload'}
        >
          <Icon name={loading ? 'close' : 'refresh'} size={14} />
        </button>
        {expanded ? (
          <div className="flex-1 min-w-0 pl-1" title={currentUrl || src}>
            <div className="text-sm font-semibold text-[var(--ink-100)] truncate">
              {title || hostnameOf(currentUrl || src)}
            </div>
            <div className="text-[10px] text-[var(--ink-50)] truncate font-mono">
              {hostnameOf(currentUrl || src)}
            </div>
          </div>
        ) : (
          <div
            className="flex-1 min-w-0 px-2 py-1 rounded-[var(--radius-chip)] bg-[var(--surface-sunken)] fb-t-caption text-[var(--ink-60)] truncate"
            title={currentUrl || src}
          >
            <span className="text-[var(--ink-90)]">{title || hostnameOf(currentUrl || src)}</span>
            <span className="ml-2">{hostnameOf(currentUrl || src)}</span>
          </div>
        )}
        <EnginePickerChip />
        <button
          className="icon-btn !h-6 !w-6"
          onClick={toggleExpanded}
          title={expanded ? 'Back to the side panel (Esc)' : 'Full screen'}
          data-testid="web-panel-expand"
        >
          <Icon name={expanded ? 'fullscreen_exit' : 'fullscreen'} size={14} />
        </button>
        <button
          className="icon-btn !h-6 !w-6"
          onClick={() => void window.api.files.openExternal(currentUrl || src)}
          title="Open in your system browser"
          data-testid="web-panel-external"
        >
          <Icon name="open_in_new" size={14} />
        </button>
        <button className="icon-btn !h-6 !w-6" onClick={close} title="Close" data-testid="web-panel-close">
          <Icon name="close" size={14} />
        </button>
      </div>
      {/* The widget's proven webview shape: allowpopups must be present at
          attach time (Electron reads it when the guest is created). */}
      <div className="flex-1 relative min-h-0">
        <webview
          key={src}
          ref={webviewRef}
          src={src}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — allowpopups is a valid <webview> attribute
          allowpopups="true"
          style={{ width: '100%', height: '100%', display: 'inline-flex' }}
        />
      </div>
    </aside>,
    document.body
  )
}
