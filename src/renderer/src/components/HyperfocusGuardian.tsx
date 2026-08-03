import { useEffect, useState } from 'react'
import {
  endRunForBreak,
  fmtRun,
  snoozeGuardian,
  useGuardianState
} from '../lib/hyperfocusGuardian'
import { chimeIn, chimeOut } from '../lib/audioBeep'
import Icon from './Icon'

// Soft top-center banner when the user crosses 90 min of uninterrupted focus.
// Doesn't nag — affirms first ("you're on fire"), then offers a 3-min stretch.
export default function HyperfocusGuardian(): JSX.Element | null {
  const state = useGuardianState()
  const [stretching, setStretching] = useState(false)
  const [stretchRemaining, setStretchRemaining] = useState(0)

  useEffect(() => {
    if (!stretching) return
    if (stretchRemaining <= 0) {
      chimeIn()
      setStretching(false)
      endRunForBreak()
      return
    }
    const id = window.setTimeout(() => setStretchRemaining((v) => v - 1), 1000)
    return () => window.clearTimeout(id)
  }, [stretching, stretchRemaining])

  function handleKeepGoing(): void {
    chimeOut()
    snoozeGuardian()
  }

  function handleStretch(): void {
    chimeIn()
    setStretching(true)
    setStretchRemaining(180)
  }

  if (stretching) {
    const min = Math.floor(stretchRemaining / 60)
    const sec = stretchRemaining % 60
    return (
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[160] pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 shadow-2xl backdrop-blur">
          <Icon name="self_improvement" size={18} className="text-emerald-700 dark:text-emerald-400" />
          <div className="text-sm">
            <div className="text-emerald-900 dark:text-emerald-100 font-medium">
              Stretch, water, breathe
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
              {min}:{sec.toString().padStart(2, '0')} remaining
            </div>
          </div>
          <button
            onClick={() => {
              setStretching(false)
              endRunForBreak()
            }}
            className="ml-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            done
          </button>
        </div>
      </div>
    )
  }

  if (!state.bannerVisible) return null

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[160] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 shadow-2xl backdrop-blur text-sm animate-[fadeInUp_400ms_ease-out]">
        <Icon name="local_fire_department" size={16} className="text-amber-600 dark:text-amber-400" />
        <span className="text-[var(--ink-90)]">
          You're on fire —{' '}
          <span className="text-[var(--ink-50)] text-xs font-mono">
            {fmtRun(state.currentRunMs)} straight
          </span>
        </span>
        <button
          onClick={handleStretch}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-emerald-50 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors"
        >
          <Icon name="self_improvement" size={13} />
          <span>3-min stretch</span>
        </button>
        <button
          onClick={handleKeepGoing}
          className="text-[11px] text-[var(--ink-70)] hover:text-[var(--ink-100)] px-2 py-1"
        >
          keep going
        </button>
      </div>
    </div>
  )
}
