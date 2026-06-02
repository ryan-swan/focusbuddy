// Compact auto-update affordance.
//
// Lives in the Footer next to the version text. Default state: silent.
// When the main-process autoUpdater reports anything but `idle` or
// `none`, this becomes visible.
//
// State machine matches main/autoUpdate.ts UpdateState:
//   idle / none         → nothing rendered
//   checking            → tiny pulsing dot
//   available           → "Update available · vX.Y.Z" (passive — download
//                         starts automatically because autoDownload=true)
//   downloading         → "Downloading update · NN%"
//   ready               → "Install Haptyx vX.Y.Z" button → restarts app
//   error               → red text + retry link
//
// The banner is intentionally tiny — sits in the footer row, not a
// modal. Auto-updates land as a chip the user can tap when convenient
// rather than a popup that demands attention.

import { useEffect, useState } from 'react'
import Icon from './Icon'

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes?: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string; releaseNotes?: string }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'error'; message: string }

export default function UpdaterBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })

  useEffect(() => {
    // Pull whatever state was missed before this component mounted.
    let cancelled = false
    void window.api.update.getState().then((s) => { if (!cancelled) setState(s) })
    const detach = window.api.update.onState((s) => setState(s))
    return () => {
      cancelled = true
      detach?.()
    }
  }, [])

  if (state.kind === 'idle' || state.kind === 'none') return null

  if (state.kind === 'checking') {
    return (
      <span
        className="inline-flex items-center gap-1 text-stone-400 dark:text-stone-500"
        title="Checking for updates…"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400 animate-pulse" />
        <span>Checking…</span>
      </span>
    )
  }

  if (state.kind === 'available') {
    return (
      <span
        className="inline-flex items-center gap-1 text-accent"
        title={state.releaseNotes ? state.releaseNotes.slice(0, 200) : `v${state.version} available — downloading`}
      >
        <Icon name="download" size={11} />
        <span>Update available · v{state.version}</span>
      </span>
    )
  }

  if (state.kind === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1 text-accent">
        <Icon name="download" size={11} className="animate-pulse" />
        <span>Downloading · {state.percent}%</span>
      </span>
    )
  }

  if (state.kind === 'ready') {
    return (
      <button
        onClick={() => { void window.api.update.installAndRestart() }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-accent hover:bg-accent/10 font-medium"
        title={state.releaseNotes ? state.releaseNotes.slice(0, 240) : `Install v${state.version} and restart`}
      >
        <Icon name="rocket_launch" size={11} />
        <span>Install v{state.version}</span>
      </button>
    )
  }

  if (state.kind === 'error') {
    return (
      <button
        onClick={() => { void window.api.update.check() }}
        className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
        title={state.message}
      >
        <Icon name="error_outline" size={11} />
        <span>Update check failed — retry</span>
      </button>
    )
  }

  return null
}
