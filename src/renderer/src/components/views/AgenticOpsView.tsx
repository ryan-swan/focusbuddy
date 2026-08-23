import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icon'

// Agentic Ops (ws-v-1 suite convergence): the local agentic operations console
// (triage, proposals, boardrooms, agent dispatch) hosted as a first-class
// PlexiDesk surface. The console is a local-first service on this machine; we
// embed it rather than proxy it, so its data never leaves localhost. When the
// service is not running we say so plainly and offer a retry — never a fake
// or cached view.

const OPS_URL = 'http://localhost:8765'

type OpsState = 'checking' | 'up' | 'down'

export default function AgenticOpsView(): JSX.Element {
  const webviewRef = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<OpsState>('checking')
  const [lastError, setLastError] = useState<string | null>(null)

  // Reachability probe before mounting the webview: a dead webview src shows a
  // blank pane, which reads as a broken app. An explicit probe lets us render
  // an honest offline state instead.
  const probe = useCallback(async (): Promise<void> => {
    setState('checking')
    setLastError(null)
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(`${OPS_URL}/api/notify/status`, { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) {
        setState('up')
      } else {
        setState('down')
        setLastError(`The console answered with HTTP ${res.status}.`)
      }
    } catch {
      setState('down')
      setLastError(`Nothing is listening at ${OPS_URL}.`)
    }
  }, [])

  useEffect(() => {
    void probe()
  }, [probe])

  // If the page dies after mount (service stopped mid-session), fall back to
  // the honest offline state rather than leaving a dead pane.
  useEffect(() => {
    if (state !== 'up') return undefined
    const wv = webviewRef.current
    if (!wv) return undefined
    const onFail = (e: Event): void => {
      // Only a real main-frame load failure counts. A failed subresource or an
      // aborted navigation (ERR_ABORTED, -3) must not flip a healthy pane.
      const ev = e as Event & { isMainFrame?: boolean; errorCode?: number }
      if (ev.isMainFrame === false || ev.errorCode === -3) return
      setState('down')
      setLastError('The console stopped responding.')
    }
    wv.addEventListener('did-fail-load', onFail)
    return () => wv.removeEventListener('did-fail-load', onFail)
  }, [state])

  if (state !== 'up') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 desk-paper no-tod">
        <div className="max-w-md">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] mb-4">
            <Icon name="smart_toy" size={28} className="text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--ink-100)] mb-2">
            {state === 'checking' ? 'Reaching your ops console…' : 'Ops console not reachable'}
          </h2>
          {state === 'checking' ? (
            <p className="text-sm text-[var(--ink-300)]">Checking {OPS_URL}.</p>
          ) : (
            <>
              <p className="text-sm text-[var(--ink-300)] mb-1">
                {lastError} The agentic ops console runs as a local service on this machine.
              </p>
              <p className="text-sm text-[var(--ink-300)] mb-4">
                Start it, then retry. Nothing is shown here unless the real console is live.
              </p>
              <button
                type="button"
                onClick={() => void probe()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90"
              >
                <Icon name="refresh" size={16} />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 relative">
        <webview
          ref={(el) => {
            webviewRef.current = el as HTMLElement | null
          }}
          src={OPS_URL}
          // Persistent partition so the console's session + local prefs
          // (theme, focus list, dismissed cards) survive app restarts.
          partition="persist:agentic-ops"
          style={{ width: '100%', height: '100%', display: 'inline-flex' }}
        />
      </div>
    </div>
  )
}
