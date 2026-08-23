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

  // Esc closes the panel — but only when the focus is not inside the page
  // itself (the webview swallows its own keys; this catches the chrome).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open || !src) return null

  return createPortal(
    <aside
      data-testid="web-panel"
      className="fixed top-10 bottom-7 right-[14px] z-[130] w-[min(560px,calc(100vw-120px))] flex flex-col rounded-[var(--radius-card)] bg-[var(--surface-base)] fb-fade-in-up overflow-hidden"
      style={{
        boxShadow: '0 0 0 1px var(--edge-hairline), var(--shadow-cast), var(--shadow-inset-highlight)'
      }}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[var(--surface-raised)]">
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
        <div
          className="flex-1 min-w-0 px-2 py-1 rounded-[var(--radius-chip)] bg-[var(--surface-sunken)] fb-t-caption text-[var(--ink-60)] truncate"
          title={currentUrl || src}
        >
          <span className="text-[var(--ink-90)]">{title || hostnameOf(currentUrl || src)}</span>
          <span className="ml-2">{hostnameOf(currentUrl || src)}</span>
        </div>
        <EnginePickerChip />
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
