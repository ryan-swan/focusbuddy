import { useEffect, useState } from 'react'
import type { ChatSource } from '@shared/types'
import Icon from '../Icon'
import PlexiiThinking from './PlexiiThinking'
import { isOpenable } from '../../lib/sourceTarget'
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
  // Remembered open/shut state for this turn, or undefined if the user has never
  // been asked. Held by the caller (the store) because this component unmounts
  // on every navigation — see onDisclosureChange.
  disclosure?: 'open' | 'closed'
  onDisclosureChange?: (state: 'open' | 'closed') => void
  // Open a retrieved source. Every source leaf is a link, not just the ones the
  // answer cited — retrieved-but-uncited material appears nowhere else, so this
  // is the only route to it.
  onOpenSource?: (source: ChatSource) => void
}

// Total wall time of a finished trace, as a quiet suffix for the summary
// line: "2 sources · 3.2s". Sub-second traces stay silent — a duration that
// reads 0.3s is noise dressed as information.
function traceDuration(trace: AssistantTrace): string | null {
  if (trace.completedAt === null) return null
  const s = (trace.completedAt - trace.startedAt) / 1000
  if (s < 1) return null
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
}

export default function RetrievalTrace({
  trace,
  disclosure,
  onDisclosureChange,
  onOpenSource
}: Props): JSX.Element | null {
  const sourceCount = trace.sources.length
  // Live elapsed seconds while the work runs (P6): the machine narrates AND
  // keeps time, in tabular numerals so the line never jitters. Appears only
  // after 2s — fast answers never flash a stopwatch.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (trace.status !== 'running') return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [trace.status])
  const liveElapsedS = Math.floor((nowTick - trace.startedAt) / 1000)
  // A finished trace starts fully revealed. The staggered reveal exists to show
  // work happening; replaying it for a request that completed minutes ago is a
  // re-enactment, not progress — and it fired again every time the panel
  // remounted, which is on every navigation.
  const [revealedCount, setRevealedCount] = useState(() =>
    trace.status === 'running' ? 0 : trace.sources.length
  )
  const [collapsed, setCollapsed] = useState(disclosure === 'closed')
  const [exiting, setExiting] = useState(false)
  // True once the disclosure has an owner — either the user has toggled it, or a
  // remembered state says they already have. The auto-collapse timers stand down
  // from then on, so a trace you deliberately opened is not folded away behind
  // your back when you come back to the page.
  const [userControlled, setUserControlled] = useState(disclosure !== undefined)

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
    if (!fullyDone || userControlled) return
    const fadeId = window.setTimeout(() => setExiting(true), HOLD_BEFORE_COLLAPSE_MS)
    const collapseId = window.setTimeout(() => {
      setCollapsed(true)
      // Record it, so returning to this page finds the trace as it was left
      // rather than expanded and mid-animation again.
      onDisclosureChange?.('closed')
    }, HOLD_BEFORE_COLLAPSE_MS + FADE_MS)
    return () => {
      window.clearTimeout(fadeId)
      window.clearTimeout(collapseId)
    }
  }, [fullyDone, userControlled, onDisclosureChange])

  // Nothing retrieved, nothing prepared, nothing failed — so nothing to say.
  if (!hasTraceContent(trace)) return null

  const setOpen = (open: boolean): void => {
    setExiting(false)
    setCollapsed(!open)
    setUserControlled(true)
    onDisclosureChange?.(open ? 'open' : 'closed')
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="trace-collapsed"
        className="fb-trace-in flex items-center gap-1 text-[10.5px] text-[var(--ink-40)] hover:text-[var(--ink-70)] transition-colors"
        title="Show what the assistant did"
      >
        <Icon name="chevron_right" size={12} />
        <span>
          {traceSummary(trace)}
          {traceDuration(trace) && (
            <span className="fb-tabular"> · {traceDuration(trace)}</span>
          )}
        </span>
      </button>
    )
  }

  const { completed, active, error } = getTraceView(trace, revealedCount)

  // The way back. Without it, re-opening a collapsed trace is a one-way door —
  // it stays expanded for the rest of the conversation with no affordance to put
  // it away. Shown only when the trace won't fold itself away: while it is still
  // running there is nothing settled to collapse, and a trace that is about to
  // auto-collapse doesn't need a control that flashes up first.
  const showCollapseControl = userControlled || trace.status === 'error'

  return (
    <div
      data-testid="assistant-trace"
      className={`text-[11px] flex flex-col gap-0.5 ${exiting ? 'fb-trace-out pointer-events-none' : ''}`}
    >
      {showCollapseControl && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          data-testid="trace-collapse"
          className="flex items-center gap-1 self-start text-[10.5px] text-[var(--ink-40)] hover:text-[var(--ink-70)] transition-colors"
          title="Hide what the assistant did"
        >
          <Icon name="expand_more" size={12} />
          <span>
            {traceSummary(trace)}
            {traceDuration(trace) && (
              <span className="fb-tabular"> · {traceDuration(trace)}</span>
            )}
          </span>
        </button>
      )}
      {completed.map((line) => (
        <div key={line.key} data-trace-line={line.key} className="flex flex-col gap-0.5">
          <div className="fb-trace-in flex items-center gap-1.5 text-[var(--ink-40)]">
            <Icon name="check_circle" size={12} className="text-emerald-500/80 shrink-0" filled />
            <Icon name={line.icon} size={11} className="shrink-0 opacity-70" />
            <span className="truncate">{line.label}</span>
          </div>
          {line.leaves && line.leaves.length > 0 && (
            <ul className="ml-[18px] pl-3 border-l border-dashed border-[var(--edge-soft)] flex flex-col gap-0.5">
              {line.leaves.map((leaf) => {
                const body = (
                  <>
                    {leaf.n !== undefined && (
                      <span className="w-3 shrink-0 text-right font-mono text-[9px] text-[var(--ink-40)]">
                        {leaf.n}
                      </span>
                    )}
                    <Icon name={leaf.icon} size={11} className="shrink-0 opacity-70" />
                    <span className="truncate">{leaf.label}</span>
                  </>
                )
                const rowClass = 'flex items-center gap-1.5 text-[var(--ink-50)] w-full text-left'
                const openable = leaf.source && onOpenSource && isOpenable(leaf.source)
                return (
                  <li key={leaf.key} data-testid="trace-leaf" className="fb-trace-in">
                    {openable ? (
                      <button
                        type="button"
                        data-testid="trace-leaf-link"
                        title={`Open ${leaf.label}${leaf.source?.snippet ? ` — ${leaf.source.snippet}` : ''}`}
                        onClick={() => leaf.source && onOpenSource?.(leaf.source)}
                        className={`${rowClass} rounded hover:text-[var(--ink-100)] transition-colors`}
                      >
                        {body}
                      </button>
                    ) : (
                      <span className={rowClass} title={leaf.label}>
                        {body}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}

      {/* The live region is mounted unconditionally with only its contents
          swapping. A region created at the same moment as its content does not
          announce — screen readers have nothing to diff it against. */}
      <div aria-live="polite" aria-atomic="true">
        {active && (
          // The live line (P4): the breathing double-i is the thinking
          // indicator — the mark itself, not a spinner — and the status label
          // carries a light shimmer sweep while the work it names is running.
          <div key={active.key} className="fb-trace-in flex items-center gap-1.5">
            <span className="w-4 h-4 grid place-items-center shrink-0 text-accent" aria-hidden="true">
              <PlexiiThinking size={14} />
            </span>
            <Icon name={active.icon} size={11} className="shrink-0 text-[var(--ink-50)]" />
            <span className="fb-status-shimmer">{active.label}</span>
            {trace.status === 'running' && liveElapsedS >= 2 && (
              <span className="fb-tabular text-[var(--ink-40)]">{liveElapsedS}s</span>
            )}
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
