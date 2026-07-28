import { useEffect, useState } from 'react'
import Icon from '../Icon'
import {
  getTraceView,
  hasTraceContent,
  traceSummary,
  SOURCE_REVEAL_INTERVAL_MS,
  type AssistantTrace
} from '../../lib/traceView'

// What the assistant did, while it does it.
//
// Every line here is drawn from `getTraceView` — a pure derivation of facts the
// server actually reported. This component owns exactly one piece of state that
// isn't derived (`revealedCount`, the reveal tick) plus the collapse timers.
// Nothing it draws can outlive the work it describes.
//
// The two rules it enforces visually:
//   • when nothing happened, it renders nothing at all — no empty shell, no
//     "0 sources" badge over an answer that used none;
//   • a failure ends red. Phases that really finished stay green, the failing
//     step is named, and nothing ahead of it is drawn as done.

// How long a finished trace stays fully expanded before folding away.
const HOLD_BEFORE_COLLAPSE_MS = 1400
// Must match the .fb-trace-out animation duration in globals.css.
const FADE_MS = 200

interface Props {
  trace: AssistantTrace
}

export default function RetrievalTrace({ trace }: Props): JSX.Element | null {
  const [revealedCount, setRevealedCount] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [exiting, setExiting] = useState(false)
  // Set once the user re-opens a collapsed trace, so the auto-collapse timers
  // don't immediately fold it away again under their hands.
  const [pinnedOpen, setPinnedOpen] = useState(false)

  const sourceCount = trace.sources.length

  // Reveal retrieved sources one at a time. Self-rescheduling rather than an
  // interval, so a source list that grows mid-flight picks up seamlessly.
  useEffect(() => {
    if (revealedCount >= sourceCount) return
    const id = window.setTimeout(() => {
      setRevealedCount((c) => Math.min(c + 1, sourceCount))
    }, SOURCE_REVEAL_INTERVAL_MS)
    return () => window.clearTimeout(id)
  }, [sourceCount, revealedCount])

  // A trace that ended in failure stays open: it's the only thing on screen
  // explaining what went wrong.
  const fullyDone =
    trace.status === 'done' && revealedCount >= sourceCount && trace.completedAt !== null

  useEffect(() => {
    if (!fullyDone || pinnedOpen) return
    const fadeId = window.setTimeout(() => setExiting(true), HOLD_BEFORE_COLLAPSE_MS)
    const collapseId = window.setTimeout(
      () => setCollapsed(true),
      HOLD_BEFORE_COLLAPSE_MS + FADE_MS
    )
    return () => {
      window.clearTimeout(fadeId)
      window.clearTimeout(collapseId)
    }
  }, [fullyDone, pinnedOpen])

  // Nothing retrieved, nothing prepared, nothing failed — so nothing to say.
  if (!hasTraceContent(trace)) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          setExiting(false)
          setCollapsed(false)
          setPinnedOpen(true)
        }}
        data-testid="trace-collapsed"
        className="fb-trace-in flex items-center gap-1 text-[10.5px] text-[var(--ink-40)] hover:text-[var(--ink-70)] transition-colors"
        title="Show what the assistant did"
      >
        <Icon name="chevron_right" size={12} />
        <span>{traceSummary(trace)}</span>
      </button>
    )
  }

  const { completed, active, error } = getTraceView(trace, revealedCount)

  return (
    <div
      data-testid="assistant-trace"
      className={`text-[11px] flex flex-col gap-0.5 ${exiting ? 'fb-trace-out pointer-events-none' : ''}`}
    >
      {completed.map((line) => (
        <div key={line.key} className="flex flex-col gap-0.5">
          <div className="fb-trace-in flex items-center gap-1.5 text-[var(--ink-40)]">
            <Icon name="check_circle" size={12} className="text-emerald-500/80 shrink-0" filled />
            <Icon name={line.icon} size={11} className="shrink-0 opacity-70" />
            <span className="truncate">{line.label}</span>
          </div>
          {line.leaves && line.leaves.length > 0 && (
            <ul className="ml-[18px] pl-3 border-l border-dashed border-[var(--edge-soft)] flex flex-col gap-0.5">
              {line.leaves.map((leaf) => (
                <li
                  key={leaf.key}
                  data-testid="trace-leaf"
                  className="fb-trace-in flex items-center gap-1.5 text-[var(--ink-50)]"
                  title={leaf.label}
                >
                  {leaf.n !== undefined && (
                    <span className="w-3 shrink-0 text-right font-mono text-[9px] text-[var(--ink-40)]">
                      {leaf.n}
                    </span>
                  )}
                  <Icon name={leaf.icon} size={11} className="shrink-0 opacity-70" />
                  <span className="truncate">{leaf.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* The live region is mounted unconditionally with only its contents
          swapping. A region created at the same moment as its content does not
          announce — screen readers have nothing to diff it against. */}
      <div aria-live="polite" aria-atomic="true">
        {active && (
          <div key={active.key} className="fb-trace-in flex items-center gap-1.5">
            <span className="w-3 h-3 grid place-items-center shrink-0" aria-hidden="true">
              <span className="w-1.5 h-1.5 rounded-[1px] bg-accent fb-trace-blink" />
            </span>
            <Icon name={active.icon} size={11} className="shrink-0 text-[var(--ink-50)]" />
            <span className="italic text-[var(--ink-70)]">{active.label}</span>
          </div>
        )}
        {error && (
          <div
            key={error.key}
            data-testid="trace-error"
            className="fb-trace-in flex items-start gap-1.5 text-rose-600 dark:text-rose-400"
          >
            <Icon name={error.icon} size={12} className="shrink-0 mt-[1px]" />
            <span>{error.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
