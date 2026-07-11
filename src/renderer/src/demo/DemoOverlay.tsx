import { useState } from 'react'
import { useDemoStore } from './useDemo'
import Icon from '../components/Icon'

export default function DemoOverlay(): JSX.Element | null {
  const active = useDemoStore((s) => s.active)
  const paused = useDemoStore((s) => s.paused)
  const currentStep = useDemoStore((s) => s.currentStep)
  const totalSteps = useDemoStore((s) => s.totalSteps)
  const scenarioTitle = useDemoStore((s) => s.scenarioTitle)
  const demoComplete = useDemoStore((s) => s.demoComplete)
  const pause = useDemoStore((s) => s.pause)
  const resume = useDemoStore((s) => s.resume)
  const skip = useDemoStore((s) => s.skip)
  const exit = useDemoStore((s) => s.exit)
  const steps = useDemoStore((s) => s.totalSteps)

  // Read captions from scenarios at runtime — we need a lazy import trick
  // to avoid circular deps. Instead, we derive the caption from the scenario
  // in the store. Simplest: expose it directly.
  const caption = useDemoStore((s) => s._caption)

  const [keepPrompt, setKeepPrompt] = useState(false)

  if (!active) return null

  // End card state
  if (demoComplete) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-8 w-[400px] flex flex-col items-center gap-5">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500">
            <Icon name="check_circle" size={32} />
          </span>
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-[var(--ink-100)] mb-1">{scenarioTitle}</h2>
            <p className="text-[13px] text-[var(--ink-60)]">Demo complete. Keep this workspace or clean it up.</p>
          </div>
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={() => void exit(true)}
              className="w-full h-10 rounded-xl bg-violet-500 text-white text-[13px] font-semibold hover:bg-violet-600 transition-colors"
            >
              Keep this workspace
            </button>
            <button
              onClick={() => void exit(false)}
              className="w-full h-10 rounded-xl border border-[var(--edge-soft)] text-[var(--ink-80)] text-[13px] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Clean up and exit
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Dots — exclude the last step (end card)
  const dotCount = Math.max(0, totalSteps - 1)
  const activeDot = Math.min(currentStep, dotCount - 1)

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
      {/* Top bar: scenario title + controls */}
      <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50 select-none">
          {scenarioTitle}
        </span>
      </div>

      {/* Top-right controls */}
      <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => (paused ? resume() : pause())}
          title={paused ? 'Resume' : 'Pause'}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-black/30 backdrop-blur text-white/80 hover:bg-black/50 hover:text-white transition-colors"
        >
          <Icon name={paused ? 'play_arrow' : 'pause'} size={16} />
        </button>
        <button
          onClick={skip}
          title="Skip step"
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-black/30 backdrop-blur text-white/80 hover:bg-black/50 hover:text-white transition-colors text-[12px] font-medium"
        >
          <Icon name="skip_next" size={14} />
          Skip
        </button>
        <button
          onClick={() => setKeepPrompt(true)}
          title="Exit demo"
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-black/30 backdrop-blur text-white/80 hover:bg-black/50 hover:text-white transition-colors text-[12px] font-medium"
        >
          <Icon name="close" size={14} />
          Exit
        </button>
      </div>

      {/* Caption pill — bottom center */}
      {caption && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
          <div className="rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 px-6 py-4 shadow-2xl">
            <p className="text-[18px] font-semibold text-white text-center leading-snug">
              {caption}
            </p>
          </div>
        </div>
      )}

      {/* Step progress dots */}
      {dotCount > 0 && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {Array.from({ length: dotCount }).map((_, i) => (
            <span
              key={i}
              className={`block rounded-full transition-all duration-300 ${
                i === activeDot
                  ? 'w-5 h-2 bg-white'
                  : i < activeDot
                    ? 'w-2 h-2 bg-white/60'
                    : 'w-2 h-2 bg-white/25'
              }`}
            />
          ))}
        </div>
      )}

      {/* Exit confirm prompt */}
      {keepPrompt && (
        <div className="pointer-events-auto fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-7 w-[360px] flex flex-col gap-4">
            <h2 className="text-[16px] font-semibold text-[var(--ink-100)]">Exit demo?</h2>
            <p className="text-[13px] text-[var(--ink-60)]">
              Keep the demo workspace or delete everything that was created.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setKeepPrompt(false); void exit(true) }}
                className="flex-1 h-9 rounded-xl bg-violet-500 text-white text-[13px] font-semibold hover:bg-violet-600 transition-colors"
              >
                Keep workspace
              </button>
              <button
                onClick={() => { setKeepPrompt(false); void exit(false) }}
                className="flex-1 h-9 rounded-xl border border-[var(--edge-soft)] text-[var(--ink-80)] text-[13px] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Clean up
              </button>
            </div>
            <button
              onClick={() => setKeepPrompt(false)}
              className="text-center text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-80)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
