import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import { useConnectedAppsStore } from '../../stores/connectedApps'
import { useVaultStore } from '../../stores/vault'
import { catalogFor } from '../../lib/widgetCatalog'
import { registerWebview, unregisterWebviewByWidgetId } from '../../lib/webviewRegistry'
import { autofillWebview } from '../../lib/vaultAutofill'
import { normalizeUrl, sanitizeWebviewUrl } from '../../lib/browserUrl'
import Icon from '../Icon'
import ConnectedToolMenu from '../contextMenu/UnifiedConnectedMenu'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}


// Stored viewport presets the user can snap a browser window to. Sizes are
// the common device classes (CSS px) so a page renders the way it would on
// that form factor — the user asked for "4 commonly used options".
const BROWSER_RESOLUTIONS: { label: string; sub: string; width: number; height: number }[] = [
  { label: 'Mobile', sub: '390 × 844', width: 390, height: 844 },
  { label: 'Tablet', sub: '768 × 1024', width: 768, height: 1024 },
  // Tablet landscape — the small-screen-friendly wide option. 1024×768 fits
  // comfortably where Laptop/Desktop would run off the edges of a small display.
  { label: 'Tablet (landscape)', sub: '1024 × 768', width: 1024, height: 768 },
  { label: 'Laptop', sub: '1366 × 768', width: 1366, height: 768 },
  { label: 'Desktop', sub: '1920 × 1080', width: 1920, height: 1080 }
]

interface Props {
  widget: Widget
  inline?: boolean
}

export default function WebViewWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const create = useWidgetStore((s) => s.create)
  // setActive (not focusOn): activating a browser widget you can already see
  // must NOT pan the camera — focusOn bumps centerToken and yanks the world.
  // The overlay's whole job is to hand the NEXT click to the page, so it just
  // marks the widget active in place.
  const setActive = useWidgetStore((s) => s.setActive)
  const isActive = useWidgetStore((s) => s.activeWidgetId === widget.id)
  const webviewRef = useRef<HTMLElement | null>(null)
  const entry = catalogFor(widget.kind)
  const placeholder = entry?.urlPlaceholder ?? 'https://…'
  const [editing, setEditing] = useState(!widget.content)
  const [draft, setDraft] = useState(widget.content)
  // ── Browser-toolbar state ─────────────────────────────────────────────────
  // canGoBack / canGoForward feed the back+forward button enabled state.
  // We update them from the webview's `did-navigate*` events because
  // canGoBack()/canGoForward() are imperative calls that have to be re-
  // queried after every navigation.
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // currentUrl is the address shown in the toolbar's URL bar. It tracks
  // the LIVE webview URL (updated from `did-navigate*`) so it always
  // reflects where the user actually is — including in-page hash changes.
  const [currentUrl, setCurrentUrl] = useState(widget.content)
  // urlDraft is the inline edit buffer for the URL bar. We only commit
  // (call loadURL) on Enter or blur, so transient typing doesn't navigate.
  const [urlDraft, setUrlDraft] = useState('')
  const [urlEditing, setUrlEditing] = useState(false)
  // Resolution-preset dropdown (snap the browser window to a stored viewport).
  const [resMenuOpen, setResMenuOpen] = useState(false)
  // Right-click on the widget frame (NOT the inner webview — webviews
  // own their own context menu). Captures clicks on the chrome / URL
  // bar area; we ALWAYS suppress the chrome's native menu so the
  // create-and-connect entry is reachable.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; cellText?: string } | null>(null)
  // Live preview shown in the header — tracks the CURRENT page while navigating.
  const [livePreview, setLivePreview] = useState<{ url: string; title: string } | null>(null)
  // Last URL we persisted into widget.content — avoids redundant DB writes on rapid navs
  const lastPersistedUrl = useRef<string>(widget.content)
  // ── webviewSrc — the URL we tell the <webview> element to load ─────────────
  // CRITICAL: this is intentionally NOT derived from widget.content. Binding
  // src={widget.content} causes the webview to reload on every navigation,
  // because persistNavUrl writes the post-nav URL back to widget.content →
  // React re-renders the <webview> with a new src attribute → Electron
  // treats that as a load request → reload kills mid-sign-in POSTs.
  //
  // Instead, webviewSrc is only updated when the URL change is EXTERNAL to
  // this webview: the user typed a new URL in the edit form, or a sibling
  // widget instance (e.g. focus-mode swap) wrote a different URL. The
  // webview navigates organically for everything else.
  const [webviewSrc, setWebviewSrc] = useState(() => sanitizeWebviewUrl(widget.content))
  const headerLabel = (() => {
    const previewTitle = livePreview?.title
    const previewHost = livePreview ? hostnameOf(livePreview.url) : ''
    if (previewTitle) return previewTitle
    if (previewHost) return previewHost
    if (widget.title) return widget.title
    if (widget.content) return hostnameOf(widget.content)
    return entry?.label ?? 'browser'
  })()

  // Full reset when the widget instance itself changes (different widget id —
  // e.g. focus-mode mounts a fresh sibling for the same content). Notably we
  // do NOT include widget.content here: that would refire on every persistNavUrl
  // write and reset state mid-navigation.
  useEffect(() => {
    setDraft(widget.content)
    setEditing(!widget.content)
    lastPersistedUrl.current = widget.content
    setWebviewSrc(sanitizeWebviewUrl(widget.content))
    setLivePreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id])

  // External-sync: widget.content changed but it wasn't from THIS webview's
  // own navigation (lastPersistedUrl tracks our own writes). Cases that fire
  // this branch: the focus-mode sibling wrote a new URL while we were
  // mounted, or the user explicitly edited the URL via the form (commit()
  // also sets lastPersistedUrl so we don't double-load there).
  useEffect(() => {
    if (widget.content === lastPersistedUrl.current) return
    // Genuine external change — sync to webview + adopt as our new baseline.
    lastPersistedUrl.current = widget.content
    setWebviewSrc(sanitizeWebviewUrl(widget.content))
    setDraft(widget.content)
  }, [widget.content])

  // Safety-net flush on unmount: if the last nav event didn't fire (rare) or the user
  // closes focus mode mid-load, read the webview's getURL() and commit it.
  useEffect(() => {
    const wvAtMount = webviewRef.current
    return () => {
      try {
        const finalUrl =
          (wvAtMount as unknown as { getURL?: () => string } | null)?.getURL?.() ?? ''
        const finalTitle =
          (wvAtMount as unknown as { getTitle?: () => string } | null)?.getTitle?.() ?? ''
        if (
          finalUrl &&
          /^https?:\/\//i.test(finalUrl) &&
          finalUrl !== lastPersistedUrl.current
        ) {
          lastPersistedUrl.current = finalUrl
          void update(widget.id, {
            content: finalUrl,
            title: finalTitle || hostnameOf(finalUrl)
          })
        }
      } catch {
        // Element already detached; best effort
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id])

  // Persist the latest URL into widget.content so the next mount (incl. focus-mode
  // expand) loads where you left off. NO debounce — saves are tiny and racing the user
  // clicking "expand" is worse than 3 extra writes during a redirect chain.
  function persistNavUrl(url: string, title: string): void {
    if (!/^https?:\/\//i.test(url)) return
    if (url === lastPersistedUrl.current) return
    setLivePreview({ url, title })
    lastPersistedUrl.current = url
    void update(widget.id, {
      content: url,
      title: title || hostnameOf(url)
    })
  }

  // Allow popups (OAuth, window.open). We do NOT intercept new-window in the
  // renderer because doing so kills `window.opener`, which OAuth providers use
  // to post the auth callback back to the parent page. The main process owns
  // popup routing via setWindowOpenHandler:
  //   - disposition='new-window' / has features → open as a real native popup
  //     window sharing this webview's session (OAuth flows work).
  //   - target=_blank link clicks → main forwards the URL via IPC, we spawn a
  //     new canvas widget below.
  useEffect(() => {
    if (editing) return
    const wv = webviewRef.current
    if (!wv) return
    wv.setAttribute('allowpopups', '')
  }, [editing])

  // Spawn a canvas widget for target=_blank links that originated from this
  // webview's webContents. We compare webContentsId so a link click in one
  // browser widget doesn't spawn duplicates across every other browser widget.
  useEffect(() => {
    if (editing) return
    const off = window.api.webview.onLinkClicked(({ sourceWebContentsId, url }) => {
      const wv = webviewRef.current
      if (!wv) return
      let myId = -1
      try {
        myId = (wv as unknown as { getWebContentsId: () => number }).getWebContentsId()
      } catch {
        return
      }
      if (myId !== sourceWebContentsId) return
      if (!url || !/^https?:\/\//i.test(url)) return
      void create({
        taskId: widget.taskId,
        kind: 'webview',
        title: '',
        content: url,
        x: widget.x + 40,
        y: widget.y + 40,
        width: 560,
        height: 400,
        color: null,
        sourceAppId: widget.sourceAppId
      })
    })
    return off
  }, [editing, widget.id, widget.taskId, widget.x, widget.y, widget.sourceAppId, create])

  // Register this webview's webContentsId so the host renderer can look it up
  // when the main process forwards a context-menu action.
  useEffect(() => {
    if (editing) return
    const wv = webviewRef.current
    if (!wv) return

    function handleDomReady(): void {
      try {
        const id = (wv as unknown as { getWebContentsId: () => number }).getWebContentsId()
        registerWebview(id, widget.id, wv as HTMLElement)
      } catch {
        // webview not yet attached
      }
    }

    wv.addEventListener('dom-ready', handleDomReady as EventListener)
    return () => {
      wv.removeEventListener('dom-ready', handleDomReady as EventListener)
      unregisterWebviewByWidgetId(widget.id)
    }
  }, [editing, widget.id])

  // Record navigation events into the browsing history so the create/edit dialog
  // can suggest "Recent pages" the user has actually used for similar tasks.
  useEffect(() => {
    if (editing) return
    const wv = webviewRef.current
    if (!wv) return

    function handleNav(e: Event): void {
      const ev = e as Event & { url?: string; isMainFrame?: boolean }
      if (ev.isMainFrame === false) return
      const url = ev.url ?? (wv as unknown as { getURL?: () => string }).getURL?.()
      if (!url || !/^https?:\/\//i.test(url)) return
      let title = ''
      try {
        title = (wv as unknown as { getTitle?: () => string }).getTitle?.() ?? ''
      } catch {
        // pre-attach race — title fills in via did-finish-load
      }
      void window.api.history.record(url, title, widget.taskId)
      let host = ''
      try {
        host = new URL(url).hostname.replace(/^www\./, '')
      } catch {
        // ignore
      }
      void window.api.trail.record({
        taskId: widget.taskId,
        kind: 'browser_nav',
        payload: { url, title, host, widgetId: widget.id }
      })
      // Persist the latest URL back to the widget so re-opening goes to where the user
      // actually was, not the original URL.
      persistNavUrl(url, title)
      // Drive the toolbar's URL bar + back/forward enabled state. We re-
      // query the imperative canGoBack/canGoForward after every nav
      // because they're only meaningful relative to the current history.
      setCurrentUrl(url)
      try {
        type NavQuery = { canGoBack?: () => boolean; canGoForward?: () => boolean }
        const q = wv as unknown as NavQuery
        setCanGoBack(q.canGoBack?.() ?? false)
        setCanGoForward(q.canGoForward?.() ?? false)
      } catch {
        // ignore
      }
    }
    function handleLoadStart(): void {
      setIsLoading(true)
    }
    function handleLoadStop(): void {
      setIsLoading(false)
    }

    wv.addEventListener('did-navigate', handleNav as EventListener)
    wv.addEventListener('did-navigate-in-page', handleNav as EventListener)
    wv.addEventListener('did-finish-load', handleNav as EventListener)
    wv.addEventListener('did-redirect-navigation', handleNav as EventListener)
    wv.addEventListener('did-start-loading', handleLoadStart as EventListener)
    wv.addEventListener('did-stop-loading', handleLoadStop as EventListener)
    return () => {
      wv.removeEventListener('did-navigate', handleNav as EventListener)
      wv.removeEventListener('did-navigate-in-page', handleNav as EventListener)
      wv.removeEventListener('did-finish-load', handleNav as EventListener)
      wv.removeEventListener('did-redirect-navigation', handleNav as EventListener)
      wv.removeEventListener('did-start-loading', handleLoadStart as EventListener)
      wv.removeEventListener('did-stop-loading', handleLoadStop as EventListener)
    }
  }, [editing, widget.id, widget.taskId])

  // When webviewSrc actually changes (via commit() or external sync), call
  // loadURL explicitly. Just updating the src attribute on a mounted <webview>
  // isn't always sufficient in Electron — loadURL is the reliable trigger.
  // This effect ONLY fires on the deliberate sync points, never on internal
  // navigation, so no refresh loop is possible.
  useEffect(() => {
    if (editing) return
    const wv = webviewRef.current
    if (!wv) return
    if (!webviewSrc || !/^https?:\/\//i.test(webviewSrc)) return
    try {
      const current = (wv as unknown as { getURL?: () => string }).getURL?.() ?? ''
      if (current === webviewSrc) return
      ;(wv as unknown as { loadURL: (url: string) => void }).loadURL(webviewSrc)
    } catch {
      // Webview not yet attached — initial render's src attribute will load.
    }
  }, [webviewSrc, editing])

  function commit(): void {
    const url = normalizeUrl(draft)
    if (!url) return
    setDraft(url)
    // User-initiated URL change. Mark as our write (so the external-sync
    // useEffect skips it) AND drive the webview load via webviewSrc.
    lastPersistedUrl.current = url
    setWebviewSrc(url)
    void update(widget.id, { content: url, title: hostnameOf(url) })
    setEditing(false)
  }

  // ── Connected App binding ─────────────────────────────────────────────────
  // If this widget was dragged from a Connected App OR has been pinned to one,
  // share that app's session partition + auto-fill its vault credentials.
  const apps = useConnectedAppsStore((s) => s.apps)
  const touchApp = useConnectedAppsStore((s) => s.touch)
  const createApp = useConnectedAppsStore((s) => s.create)
  const vaultEntries = useVaultStore((s) => s.entries)
  const vaultUnlocked = useVaultStore((s) => s.unlocked)
  const sourceApp = widget.sourceAppId
    ? apps.find((a) => a.id === widget.sourceAppId) ?? null
    : null
  const partition = sourceApp
    ? `persist:connectedapp-${sourceApp.id}`
    : 'persist:webview-default'

  // Bump the connected app's usage when this widget is first focused — signals
  // the Favourites sort that the user is actively working with it.
  const bumpedFocusFor = useRef<string | null>(null)
  useEffect(() => {
    if (!sourceApp) return
    if (!isActive) return
    if (bumpedFocusFor.current === sourceApp.id) return
    bumpedFocusFor.current = sourceApp.id
    void touchApp(sourceApp.id)
  }, [isActive, sourceApp, touchApp])

  // Vault auto-fill: when the page settles and we have a bound vault entry,
  // inject credentials. Only fire once per load (tracked via the URL ref) so
  // we don't refill a half-submitted form on every sub-frame did-finish-load.
  const autofilledForUrl = useRef<string>('')
  useEffect(() => {
    if (editing) return
    if (!sourceApp) return
    if (!sourceApp.autofillEnabled) return
    if (!sourceApp.vaultEntryId) return
    if (!vaultUnlocked) return
    const wv = webviewRef.current
    if (!wv) return
    const entry = vaultEntries.find((e) => e.id === sourceApp.vaultEntryId) ?? null
    if (!entry) return
    // Origin gate: only auto-fill on the host this Connected App is bound to.
    const boundHost = hostnameOf(sourceApp.url)

    function onFinish(): void {
      try {
        const url =
          (wv as unknown as { getURL?: () => string } | null)?.getURL?.() ?? ''
        if (!url || url === autofilledForUrl.current) return
        autofilledForUrl.current = url
        void autofillWebview(wv as HTMLElement | null, entry, boundHost)
      } catch {
        // ignore
      }
    }
    wv.addEventListener('did-finish-load', onFinish as EventListener)
    return () => {
      wv.removeEventListener('did-finish-load', onFinish as EventListener)
    }
  }, [editing, sourceApp, vaultEntries, vaultUnlocked])

  // ── "Pin this site" handler ───────────────────────────────────────────────
  // One-click promotion from a freeform browser widget to a Connected App.
  // Re-uses the existing connected app if the hostname already matches one we
  // know about (no duplicates), otherwise creates a new app from the current
  // URL + title. The widget's sourceAppId then drives partition + autofill.
  const [pinning, setPinning] = useState(false)
  async function handlePinToApps(): Promise<void> {
    if (pinning || sourceApp || !widget.content) return
    setPinning(true)
    try {
      let host = ''
      try {
        host = new URL(widget.content).hostname.replace(/^www\./, '')
      } catch {
        return
      }
      const existing = await window.api.connectedApps.findByHostname(host)
      if (existing) {
        await update(widget.id, { sourceAppId: existing.id })
        void touchApp(existing.id)
        return
      }
      const wv = webviewRef.current
      let title = ''
      try {
        title =
          (wv as unknown as { getTitle?: () => string } | null)?.getTitle?.() ?? ''
      } catch {
        // ignore
      }
      const app = await createApp({
        title: title || host,
        url: widget.content,
        icon: 'apps',
        color: null
      })
      await update(widget.id, { sourceAppId: app.id })
      void touchApp(app.id)
    } finally {
      setPinning(false)
    }
  }

  // In inline (focus modal) mode the modal already provides isolation, so always interactive.
  const showOverlay = !inline && !editing && !isActive

  function navBack(): void {
    const wv = webviewRef.current as unknown as { goBack?: () => void } | null
    wv?.goBack?.()
  }
  function navForward(): void {
    const wv = webviewRef.current as unknown as { goForward?: () => void } | null
    wv?.goForward?.()
  }
  function navReload(): void {
    const wv = webviewRef.current as unknown as { reload?: () => void } | null
    wv?.reload?.()
  }
  function navStop(): void {
    const wv = webviewRef.current as unknown as { stop?: () => void } | null
    wv?.stop?.()
  }
  function commitUrlBar(): void {
    setUrlEditing(false)
    const next = normalizeUrl(urlDraft.trim())
    if (!next || next === currentUrl) return
    const wv = webviewRef.current as unknown as { loadURL?: (u: string) => void } | null
    if (wv?.loadURL) {
      try {
        wv.loadURL(next)
      } catch {
        // bad URL, give up silently — input keeps the user's text via urlDraft
      }
    }
  }

  const body = (
    <div
      className="h-full w-full bg-[var(--surface-raised)] relative flex flex-col"
      onContextMenu={(e) => {
        // The <webview> element owns its inner context menu via
        // shell-level webContents; we only act on right-clicks landing
        // on the chrome / URL bar / loading overlay (everything OUTSIDE
        // the webview). Detect by checking whether the target is
        // inside the webview element.
        const t = e.target as HTMLElement
        if (t.closest && t.closest('webview')) return
        if (e.shiftKey) return
        e.preventDefault()
        // For webview widgets, the most useful seed is the URL — passes
        // through as content for sticky/note/markdown so the user has
        // the URL handy in the new tool too.
        const seed = widget.content || ''
        setCtxMenu({ x: e.clientX, y: e.clientY, cellText: seed })
      }}
    >
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
          className="h-full w-full flex flex-col items-stretch justify-center gap-2 p-4"
        >
          <label className="text-xs uppercase tracking-wider text-[var(--ink-50)] flex items-center gap-1.5">
            <Icon name={entry?.icon ?? 'public'} size={16} className="text-[var(--ink-70)]" />
            {entry?.label ?? 'URL'}
          </label>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--edge-firm)] focus:ring-2 focus:ring-[var(--edge-soft)]"
          />
          <p className="text-[11px] text-[var(--ink-70)]">
            {entry?.hint ?? 'Renders inside a focused browser tab — no other tabs allowed.'}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="submit" className="btn-primary">
              <Icon name="open_in_new" size={14} />
              <span>Load</span>
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Browser-chrome toolbar — back/forward/reload/stop + URL bar.
              Lives above the webview content in a flex column so the
              webview area shrinks to the remaining height. */}
          <div className="shrink-0 flex items-center gap-1 px-1.5 py-1 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]/80">
            <button
              onClick={navBack}
              disabled={!canGoBack}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:text-[var(--ink-30)] disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="Back"
              aria-label="Go back"
            >
              <Icon name="arrow_back" size={14} />
            </button>
            <button
              onClick={navForward}
              disabled={!canGoForward}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:text-[var(--ink-30)] disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="Forward"
              aria-label="Go forward"
            >
              <Icon name="arrow_forward" size={14} />
            </button>
            <button
              onClick={isLoading ? navStop : navReload}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
              title={isLoading ? 'Stop loading' : 'Reload'}
              aria-label={isLoading ? 'Stop loading' : 'Reload'}
            >
              <Icon name={isLoading ? 'close' : 'refresh'} size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <input
                value={urlEditing ? urlDraft : currentUrl}
                onFocus={(e) => {
                  setUrlDraft(currentUrl)
                  setUrlEditing(true)
                  // Select all so the user can type a fresh URL without
                  // first deleting the old one.
                  e.currentTarget.select()
                }}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitUrlBar()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setUrlEditing(false)
                    setUrlDraft('')
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                onBlur={() => {
                  if (urlEditing) commitUrlBar()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                placeholder="https://…"
                className="w-full h-6 px-2 text-[11px] rounded bg-[var(--surface-raised)] border border-[var(--edge-soft)] focus:border-[var(--edge-firm)] focus:outline-none text-[var(--ink-90)] truncate"
                title={currentUrl}
              />
            </div>
            <div className="relative shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setResMenuOpen((v) => !v)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`h-6 w-6 inline-flex items-center justify-center rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] ${resMenuOpen ? 'bg-[var(--surface-sunken)]' : ''}`}
                title="Resize to a stored resolution"
                aria-label="Resize to a stored resolution"
              >
                <Icon name="aspect_ratio" size={14} />
              </button>
              {resMenuOpen && (
                <>
                  {/* click-away backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation()
                      setResMenuOpen(false)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <div
                    className="absolute right-0 top-7 z-50 w-44 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg py-1"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ink-40)]">
                      Window size
                    </div>
                    {BROWSER_RESOLUTIONS.map((r) => {
                      const active =
                        Math.round(widget.width) === r.width &&
                        Math.round(widget.height) === r.height
                      return (
                        <button
                          key={r.label}
                          onClick={(e) => {
                            e.stopPropagation()
                            update(widget.id, { width: r.width, height: r.height })
                            setResMenuOpen(false)
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-[var(--surface-sunken)] ${active ? 'text-[var(--ink-100)] font-medium' : 'text-[var(--ink-70)]'}`}
                        >
                          <span className="flex items-center gap-2">
                            {active && <Icon name="check" size={12} />}
                            <span className={active ? '' : 'pl-[18px]'}>{r.label}</span>
                          </span>
                          <span className="text-[10px] text-[var(--ink-40)] tabular-nums">{r.sub}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 relative min-h-0">
          <webview
            ref={webviewRef}
            src={webviewSrc}
            partition={partition}
            // allowpopups MUST be present at attach time — Electron reads it when
            // the guest webContents is created. Setting it later via setAttribute
            // (the old approach, kept below as a belt-and-braces no-op) does not
            // reliably enable window.open for the already-attached contents, which
            // is why site menus and OAuth "sign in" popups silently did nothing.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — allowpopups is a valid <webview> attribute
            allowpopups="true"
            style={{ width: '100%', height: '100%', display: 'inline-flex' }}
          />
          {showOverlay && (
            <div
              onClick={(e) => {
                e.stopPropagation()
                // ⌘/Ctrl-click while zoomed out dives into this browser: jump
                // to 100% with it centred. The overlay swallows the event
                // (stopPropagation) so it never reaches WidgetFrame — we have
                // to honour the gesture here too, or browsers would be the
                // one widget kind that can't be dived into.
                const store = useWidgetStore.getState()
                if ((e.metaKey || e.ctrlKey) && store.zoom < 0.8) {
                  store.zoomToWidget(widget.id)
                  return
                }
                setActive(widget.id)
              }}
              className="absolute inset-0 cursor-pointer group bg-transparent"
              title="Click to interact — scroll pans the canvas while not active"
            >
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-stone-900/80 backdrop-blur text-[11px] text-stone-50 shadow flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                <Icon name="touch_app" size={12} />
                <span>Click to interact</span>
              </div>
            </div>
          )}
          {!editing && (
            <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
              {!sourceApp && widget.content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void handlePinToApps()
                  }}
                  disabled={pinning}
                  title="Pin this site to Connected Apps (shares session + enables vault auto-fill)"
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)] text-[var(--ink-70)] disabled:opacity-60"
                >
                  <Icon name="push_pin" size={11} />
                  <span>{pinning ? 'pinning…' : 'pin to apps'}</span>
                </button>
              )}
              {sourceApp && (
                <span
                  title={`Linked to "${sourceApp.title}" — session + auto-fill shared`}
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-70)]"
                >
                  <Icon name="link" size={11} />
                  <span className="truncate max-w-[120px]">{sourceApp.title}</span>
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title="Change URL (full form)"
                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)] text-[var(--ink-70)]"
              >
                <Icon name="edit" size={11} />
                <span>edit</span>
              </button>
            </div>
          )}
          </div>
        </>
      )}
      {ctxMenu && (
        <ConnectedToolMenu
          sourceWidgetId={widget.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          selectionContext={{ selectionText: ctxMenu.cellText }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )

  if (inline) return body

  // Build the kind-specific context menu extras. WidgetFrame's generic menu
  // (Make-this-a-task / Duplicate / Bring-to-front / Archive) sits beneath
  // these; we surface webview-only actions like "Pin to Apps" and "Reload"
  // at the top so they're a single right-click away.
  const headerMenuExtras: { label: string; icon: string; onClick: () => void }[] = []
  // Pin to Apps — only meaningful for a freeform widget with a URL that
  // isn't already bound to a Connected App. Once bound, the entry stays
  // hidden because re-pinning would be a no-op.
  if (!sourceApp && widget.content) {
    headerMenuExtras.push({
      label: 'Pin to Apps',
      icon: 'push_pin',
      onClick: () => void handlePinToApps()
    })
  }
  // Reload — duplicates the toolbar button so it's reachable when the user
  // is already in a right-click context.
  headerMenuExtras.push({
    label: 'Reload',
    icon: 'refresh',
    onClick: () => {
      const wv = webviewRef.current as unknown as { reload?: () => void } | null
      wv?.reload?.()
    }
  })
  // Change URL (full form) — same path as the existing "edit" button in
  // the top-right cluster. Useful when the user wants the hint-rich form
  // instead of the inline URL bar.
  headerMenuExtras.push({
    label: 'Change URL…',
    icon: 'edit',
    onClick: () => setEditing(true)
  })

  return (
    <WidgetFrame
      widget={widget}
      headerLabel={`${entry?.label ?? 'Browser'} · ${headerLabel}`}
      headerAccent="bg-stone-300/60"
      headerMenuExtras={headerMenuExtras}
    >
      {body}
    </WidgetFrame>
  )
}
