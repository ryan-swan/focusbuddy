import { useState } from 'react'
import { useDemoStore } from './useDemo'
import Icon from '../components/Icon'

// The demo's chrome: act eyebrow, caption pill, progress dots, transport
// controls and the end card. Everything is pointer-events-none except the
// controls, so the app underneath stays visible and the recording shows the
// real product rather than an overlay sitting on top of it.
export default function DemoOverlay(): JSX.Element | null {
  const active = useDemoStore((s) => s.active)
  const paused = useDemoStore((s) => s.paused)
  const currentStep = useDemoStore((s) => s.currentStep)
  const totalSteps = useDemoStore((s) => s.totalSteps)
  const scenarioTitle = useDemoStore((s) => s.scenarioTitle)
  const scenarioSubtitle = useDemoStore((s) => s.scenarioSubtitle)
  const demoComplete = useDemoStore((s) => s.demoComplete)
  const caption = useDemoStore((s) => s._caption)
  const act = useDemoStore((s) => s._act)
  const actor = useDemoStore((s) => s._actor)
  const pause = useDemoStore((s) => s.pause)
  const resume = useDemoStore((s) => s.resume)
  const skip = useDemoStore((s) => s.skip)
  const exit = useDemoStore((s) => s.exit)

  const [keepPrompt, setKeepPrompt] = useState(false)

  if (!active) return null

  if (demoComplete) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 backdrop-blur-sm">
        <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-8 w-[420px] flex flex-col items-center gap-5">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500">
            <Icon name="check_circle" size={32} />
          </span>
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-[var(--ink-100)] mb-1">{scenarioTitle}</h2>
            <p className="text-[13px] text-[var(--ink-60)]">
              {scenarioSubtitle || 'Demo complete.'} Keep this workspace or clean it up.
            </p>
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
              className="w-full h-10 rounded-xl border border-[var(--edge-soft)] text-[var(--ink-90)] text-[13px] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Clean up and exit
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Exclude the trailing end-card step from the dot count.
  const dotCount = Math.max(0, totalSteps - 1)
  const activeDot = Math.min(currentStep, dotCount - 1)

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
      {/* Scenario title, top centre */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 select-none drop-shadow">
          {scenarioTitle}
        </span>
      </div>

      {/* Transport, top right */}
      <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => (paused ? resume() : pause())}
          title={paused ? 'Resume' : 'Pause'}
          aria-label={paused ? 'Resume demo' : 'Pause demo'}
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

      {/* Caption, bottom centre */}
      {caption && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6">
          <div className="rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 px-7 py-5 shadow-2xl flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              {act && (
                <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-violet-300">
                  {act}
                </span>
              )}
              {/* Who is typing. On video there is no cursor to tell a person
                  writing from the model drafting — this is the only signal. */}
              {actor && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.14em] ${
                    actor === 'ai'
                      ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40'
                      : 'bg-white/15 text-white/85 ring-1 ring-white/25'
                  }`}
                >
                  <Icon name={actor === 'ai' ? 'auto_awesome' : 'edit'} size={11} />
                  {actor === 'ai' ? 'Plexii AI is writing' : 'You are typing'}
                </span>
              )}
            </div>
            <p className="text-[19px] font-semibold text-white text-center leading-snug text-balance">
              {caption}
            </p>
          </div>
        </div>
      )}

      {/* Progress dots */}
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

      {keepPrompt && (
        <div className="pointer-events-auto fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-7 w-[360px] flex flex-col gap-4">
            <h2 className="text-[16px] font-semibold text-[var(--ink-100)]">Exit demo?</h2>
            <p className="text-[13px] text-[var(--ink-60)]">
              Keep the demo workspace, or delete everything the demo created.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setKeepPrompt(false)
                  void exit(true)
                }}
                className="flex-1 h-9 rounded-xl bg-violet-500 text-white text-[13px] font-semibold hover:bg-violet-600 transition-colors"
              >
                Keep workspace
              </button>
              <button
                onClick={() => {
                  setKeepPrompt(false)
                  void exit(false)
                }}
                className="flex-1 h-9 rounded-xl border border-[var(--edge-soft)] text-[var(--ink-90)] text-[13px] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Clean up
              </button>
            </div>
            <button
              onClick={() => setKeepPrompt(false)}
              className="text-center text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-90)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
