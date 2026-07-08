import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOnboarding } from '../../stores/onboarding'
import { moduleById } from '../../lib/onboarding/registry'
import Icon from '../Icon'

// The generic, replayable tour overlay for "steps" onboarding modules. It is
// deliberately lightweight and fast: each step jumps to the real surface it is
// teaching, highlights the real element with a ring, and shows one short card
// with one action. Progress dots and a time estimate are always visible, and
// Skip is always one click away, because the operator flagged that a slow or
// trapping tour is itself a reason to abandon (especially with ADHD).

function estLabel(seconds: number): string {
  if (seconds < 60) return `~${seconds} sec`
  const m = Math.round(seconds / 60)
  return `~${m} min`
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export default function OnboardingTour(): JSX.Element | null {
  const activeModuleId = useOnboarding((s) => s.activeModuleId)
  const activeStep = useOnboarding((s) => s.activeStep)
  const next = useOnboarding((s) => s.next)
  const prev = useOnboarding((s) => s.prev)
  const skip = useOnboarding((s) => s.skip)

  const mod = activeModuleId ? moduleById(activeModuleId) : null
  const isSteps = !!mod && mod.kind === 'steps'
  const step = isSteps ? mod.steps[activeStep] : null

  const [target, setTarget] = useState<Rect | null>(null)
  const goneRef = useRef<string | null>(null)

  // On entering a step, run its navigation once (so the tour lands on the right
  // surface), then locate its spotlight target when it renders.
  useEffect(() => {
    if (!isSteps || !step) return
    const key = `${activeModuleId}:${activeStep}`
    if (goneRef.current !== key) {
      goneRef.current = key
      try {
        step.go?.()
      } catch {
        /* navigation is best-effort */
      }
    }
  }, [isSteps, step, activeModuleId, activeStep])

  // Poll briefly for the spotlight element after navigation, then track it on
  // resize/scroll. Falls back to a centred card if it never appears.
  useLayoutEffect(() => {
    if (!isSteps || !step) {
      setTarget(null)
      return
    }
    let raf = 0
    let tries = 0
    const sel = step.spotlight ? `[data-testid="${step.spotlight}"]` : null
    const measure = (): void => {
      if (!sel) {
        setTarget(null)
        return
      }
      const el = document.querySelector(sel) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setTarget({ top: r.top, left: r.left, width: r.width, height: r.height })
        return
      }
      if (tries++ < 40) raf = requestAnimationFrame(measure)
      else setTarget(null)
    }
    measure()
    const onMove = (): void => measure()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [isSteps, step, activeStep, activeModuleId])

  if (!isSteps || !mod || !step) return null

  const isLast = activeStep >= mod.steps.length - 1
  const PAD = 8
  // Card placement: under the target if there's room below, else above, else a
  // fixed bottom-centre position when there's no target.
  let cardStyle: React.CSSProperties
  if (target) {
    const belowSpace = window.innerHeight - (target.top + target.height)
    const below = belowSpace > 220
    cardStyle = below
      ? { top: target.top + target.height + 12, left: Math.min(Math.max(16, target.left), window.innerWidth - 380) }
      : { top: Math.max(16, target.top - 12 - 210), left: Math.min(Math.max(16, target.left), window.innerWidth - 380) }
  } else {
    cardStyle = { bottom: 28, left: '50%', transform: 'translateX(-50%)' }
  }

  return createPortal(
    <div className="fixed inset-0 z-[250]" aria-live="polite">
      {/* Dim + highlight: a soft scrim with a cut-out ring around the target so
          attention lands on the real element, not a screenshot. Scrim lets
          clicks through to nothing (pointer-events-none) so it never traps. */}
      <div className="absolute inset-0 bg-stone-950/40 pointer-events-none" />
      {target && (
        <div
          className="absolute rounded-lg ring-2 ring-[rgb(var(--accent))] shadow-[0_0_0_9999px_rgba(12,18,32,0.45)] transition-all duration-200 pointer-events-none"
          style={{
            top: target.top - PAD,
            left: target.left - PAD,
            width: target.width + PAD * 2,
            height: target.height + PAD * 2
          }}
        />
      )}

      {/* Step card */}
      <div
        className="absolute w-[360px] max-w-[92vw] rounded-2xl bg-[rgba(16,24,39,0.97)] border border-white/10 shadow-2xl text-stone-100 p-5"
        style={cardStyle}
        role="dialog"
        aria-label={`${mod.title}: ${step.title}`}
        data-testid="onboarding-step-tour"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {mod.steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === activeStep ? 'w-5 bg-accent' : i < activeStep ? 'w-2.5 bg-accent/50' : 'w-2.5 bg-white/15'
                }`}
              />
            ))}
          </div>
          <span className="text-[10.5px] text-stone-400 fb-tabular">{estLabel(mod.estSeconds)}</span>
        </div>

        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-lg bg-accent/15 text-accent inline-flex items-center justify-center shrink-0">
            <Icon name={step.icon} size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">{step.title}</h3>
            <p className="text-[12.5px] text-stone-300 leading-relaxed mt-1">{step.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button onClick={() => skip()} className="text-[12px] text-stone-400 hover:text-stone-200" data-testid="onboarding-tour-skip">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <button onClick={() => prev()} className="text-[12px] text-stone-300 hover:text-white px-2 py-1">
                Back
              </button>
            )}
            <button onClick={() => next()} className="btn-primary !py-1.5" data-testid="onboarding-tour-next">
              <span>{step.cta ?? (isLast ? 'Done' : 'Next')}</span>
              {!isLast && !step.cta && <Icon name="arrow_forward" size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
