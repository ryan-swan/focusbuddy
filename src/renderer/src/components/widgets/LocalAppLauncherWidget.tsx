import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useConnectedAppsStore } from '../../stores/connectedApps'
import Icon from '../Icon'

interface Props {
  widget: Widget
  inline?: boolean
}

// Renders a tile bound to a local (kind='local') Connected App. Clicking the
// tile launches the underlying Mac app via the main process. A small running
// indicator polls every 4s while the widget is mounted so the user can tell
// at a glance whether the app is open.
//
// The binding lives in widget.sourceAppId, set when the user drags a local
// app onto the canvas. If the source app gets removed from Connected Apps
// later, the tile shows a friendly "broken link" state with a re-bind hint.
export default function LocalAppLauncherWidget({ widget, inline = false }: Props): JSX.Element {
  const apps = useConnectedAppsStore((s) => s.apps)
  const launchLocal = useConnectedAppsStore((s) => s.launchLocal)
  const sourceApp = widget.sourceAppId
    ? apps.find((a) => a.id === widget.sourceAppId) ?? null
    : null
  const [running, setRunning] = useState<boolean | null>(null)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll running state. We do this in the renderer (not main) so each widget
  // can have its own state without coupling to a global broadcast — and the
  // AppleScript call is fast enough (<50ms) that 4s polling is cheap.
  useEffect(() => {
    if (!sourceApp || sourceApp.kind !== 'local') {
      setRunning(null)
      return
    }
    let cancelled = false
    async function check(): Promise<void> {
      if (!sourceApp) return
      try {
        const r = await window.api.localApp.isRunning({
          appPath: sourceApp.appPath,
          title: sourceApp.title
        })
        if (!cancelled) setRunning(r)
      } catch {
        if (!cancelled) setRunning(null)
      }
    }
    void check()
    pollRef.current = setInterval(check, 4000)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sourceApp])

  async function handleLaunch(): Promise<void> {
    if (!sourceApp || launching) return
    setLaunching(true)
    setError(null)
    try {
      const r = await launchLocal(sourceApp.id)
      if (!r.ok) setError(r.error ?? 'Launch failed')
    } finally {
      setLaunching(false)
    }
  }

  const body = sourceApp ? (
    <button
      onClick={handleLaunch}
      disabled={launching}
      className="h-full w-full flex flex-col items-center justify-center gap-2 p-3 hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-70"
    >
      <div className="relative">
        {sourceApp.iconPngBase64 ? (
          <img
            src={`data:image/png;base64,${sourceApp.iconPngBase64}`}
            alt=""
            className="h-12 w-12 rounded-lg"
          />
        ) : (
          <span className="h-12 w-12 rounded-lg inline-flex items-center justify-center bg-accent/10 text-accent">
            <Icon name="apps" size={22} />
          </span>
        )}
        {running === true && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[var(--surface-raised)]"
            title="Running"
          />
        )}
      </div>
      <div className="min-w-0 text-center px-1">
        <div className="text-[12px] font-medium text-[var(--ink-100)] truncate">
          {sourceApp.title}
        </div>
        <div className="text-[10px] text-[var(--ink-50)]">
          {launching
            ? 'launching…'
            : running === true
              ? 'click to focus'
              : 'click to launch'}
        </div>
      </div>
      {error && (
        <div className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-full px-1">
          {error}
        </div>
      )}
    </button>
  ) : (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-3 text-center">
      <Icon name="broken_image" size={22} className="text-[var(--ink-40)]" />
      <div className="text-[11px] text-[var(--ink-50)]">
        Linked app was removed.
      </div>
      <div className="text-[10px] text-[var(--ink-40)]">
        Re-add it from the sidebar and drop onto the canvas.
      </div>
    </div>
  )

  if (inline) return body

  return (
    <WidgetFrame
      widget={widget}
      headerLabel={`App · ${sourceApp?.title ?? 'broken link'}`}
      headerAccent="bg-stone-300/60"
    >
      {body}
    </WidgetFrame>
  )
}
