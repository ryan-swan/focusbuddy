import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useGuestCaptureStore } from '../stores/guestCapture'

// M6 (CR-12) — the non-dismissible disclosure. While a guest capture runs,
// this bar is on screen with no close affordance: the only verb is Stop.
// Both lines name exactly what is being heard — and mic-only says the
// honest floor out loud: "Plexii can hear you, not them."

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function GuestCaptureBar(): JSX.Element | null {
  const status = useGuestCaptureStore((s) => s.status)
  const mode = useGuestCaptureStore((s) => s.mode)
  const title = useGuestCaptureStore((s) => s.title)
  const startedAt = useGuestCaptureStore((s) => s.startedAt)
  const moments = useGuestCaptureStore((s) => s.moments)
  const markMoment = useGuestCaptureStore((s) => s.markMoment)
  const stop = useGuestCaptureStore((s) => s.stop)

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (status !== 'recording') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [status])

  // The Stage grammar carries over: ⌘⇧M marks the moment here too.
  useEffect(() => {
    if (status !== 'recording') return
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        markMoment()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, markMoment])

  if (status !== 'recording') return null

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[340] flex items-center gap-3 rounded-full bg-stone-900 text-white shadow-2xl border border-white/10 pl-4 pr-2 py-2"
      data-testid="guest-capture-bar"
    >
      <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
      <div className="min-w-0">
        <div className="text-[12px] font-medium leading-tight truncate max-w-[280px]">
          Recording {title || 'this meeting'} · {startedAt ? fmtElapsed(now - startedAt) : '0:00'}
        </div>
        <div className="text-[10.5px] text-white/60 leading-tight" data-testid="guest-capture-mode">
          {mode === 'both'
            ? 'Your mic + this machine’s audio — transcribed on this machine, never uploaded.'
            : 'Plexii can hear you, not them — system audio unavailable, mic only.'}
        </div>
      </div>
      <button
        onClick={markMoment}
        className="fb-press text-[11px] text-amber-300/90 px-1.5"
        title="Mark this moment (⌘⇧M)"
        data-testid="guest-capture-moment"
      >
        ⚑{moments.length > 0 ? ` ${moments.length}` : ''}
      </button>
      <button
        onClick={stop}
        className="fb-press inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 hover:bg-rose-500 text-white text-[12px] font-medium px-3 py-1.5"
        data-testid="guest-capture-stop"
      >
        <Icon name="stop_circle" size={14} />
        Stop
      </button>
    </div>
  )
}
