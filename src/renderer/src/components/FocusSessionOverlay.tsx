import { useEffect, useState } from 'react'
import { useFocusSessionStore } from '../stores/focusSession'
import { useNodeStore } from '../stores/nodes'
import { chimeIn, chimeOut, alarm } from '../lib/audioBeep'
import Icon from './Icon'

function fmt(sec: number): string {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

// Renders three layered pieces while a focus session is active:
//   1. A class hook on <html> that dims the shell (sidebar, chat, footer) — applied via CSS
//   2. A floating timer pill on the canvas
//   3. The end-of-session choice modal when the timer hits zero
//
// Plays a soft chime at start, an alarm at zero, a soft tone on completion choice.
export default function FocusSessionOverlay(): JSX.Element | null {
  const active = useFocusSessionStore((s) => s.active)
  const remaining = useFocusSessionStore((s) => s.remainingSec)
  const activeSeconds = useFocusSessionStore((s) => s.activeSeconds)
  const renewedCount = useFocusSessionStore((s) => s.renewedCount)
  const isEngaged = useFocusSessionStore((s) => s.isEngaged)
  const pausedSeconds = useFocusSessionStore((s) => s.pausedSeconds)
  const finish = useFocusSessionStore((s) => s.finish)
  const renew = useFocusSessionStore((s) => s.renew)
  const nodes = useNodeStore((s) => s.nodes)

  const [zeroFired, setZeroFired] = useState(false)
  const [showChoice, setShowChoice] = useState(false)

  // Pulse the chime + dim class while a session is live
  useEffect(() => {
    if (!active) {
      document.documentElement.classList.remove('focus-session-active')
      setZeroFired(false)
      setShowChoice(false)
      return
    }
    document.documentElement.classList.add('focus-session-active')
    // Start chime is fired by the trigger button (not here), to keep audio gestures
    // tied to user input for autoplay policies.
    return () => {
      document.documentElement.classList.remove('focus-session-active')
    }
  }, [active])

  // When the timer hits zero, fire alarm once and reveal the choice modal
  useEffect(() => {
    if (!active) return
    if (remaining === 0 && !zeroFired) {
      setZeroFired(true)
      alarm()
      setShowChoice(true)
    }
  }, [active, remaining, zeroFired])

  if (!active) return null

  const task = active.taskId ? nodes.find((n) => n.id === active.taskId) ?? null : null
  const taskTitle = task?.title ?? 'this task'

  async function handleDone(): Promise<void> {
    chimeIn()
    await finish('done')
  }
  async function handleKeepGoing(seconds: number): Promise<void> {
    chimeIn()
    setShowChoice(false)
    setZeroFired(false)
    await renew(seconds)
  }
  async function handleAbandon(): Promise<void> {
    chimeOut()
    await finish('abandoned')
  }

  // Total engaged minutes across this whole session (incl. any renewals).
  // Must use the store's activeSeconds — NOT Date.now() - startedAt — because
  // the user might have stepped away. The "(Xm on TaskName)" hint in the
  // choice modal is the user's record of focused time, so wall-clock would
  // overstate it and give a false sense of progress.
  const elapsedTotal = activeSeconds + renewedCount * active.plannedSeconds

  return (
    <>
      {/* Objective banner — task title rendered prominently while a session
          is live. Sits just under the timer pill, in a glass strip. Reads
          as the "current objective" callout the brief asks for. Hidden
          when the session has no task (rare: only happens for global
          timers). */}
      {task && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 z-[148] pointer-events-none">
          <div
            className="pointer-events-auto fb-glass-chrome px-4 py-1.5 rounded-full border border-[color:var(--glass-chrome-border)] inline-flex items-center gap-2 max-w-[420px]"
            title={`Current objective: ${taskTitle}`}
          >
            <Icon name="my_location" size={11} className="text-accent shrink-0" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400 font-semibold shrink-0">
              Objective
            </span>
            <span className="text-[12px] text-stone-800 dark:text-stone-100 truncate">
              {taskTitle}
            </span>
          </div>
        </div>
      )}
      {/* Floating timer pill — top of canvas */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[150] pointer-events-none">
        <div
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full select-none fb-spring-soft ${
            remaining === 0
              ? 'bg-emerald-500/90 border border-emerald-300 text-white animate-pulse'
              : 'fb-glass-panel text-stone-900 dark:text-stone-100'
          } ${!isEngaged && remaining > 0 ? 'opacity-70' : ''}`}
          title={
            !isEngaged && remaining > 0
              ? `Paused — focus window not active. Switch back to "${taskTitle}" to resume.`
              : `Focus session on "${taskTitle}"${renewedCount > 0 ? ` · renewed ${renewedCount}×` : ''}`
          }
          style={
            remaining === 0
              ? undefined
              : {
                  borderColor: isEngaged
                    ? 'rgb(var(--accent) / 0.35)'
                    : 'rgb(var(--accent) / 0.18)'
                }
          }
        >
          {/* Engaged: breathing accent dot. Paused: a muted "pause" glyph
              that stays still — visual cue that the timer isn't counting. */}
          {remaining === 0 ? (
            <span className="h-2 w-2 rounded-full bg-white" />
          ) : isEngaged ? (
            <span className="h-2 w-2 rounded-full bg-accent fb-breathing" />
          ) : (
            <span className="inline-flex gap-[2px] items-center justify-center h-2 w-2">
              <span className="block h-[8px] w-[2px] bg-stone-400 dark:bg-stone-500 rounded-sm" />
              <span className="block h-[8px] w-[2px] bg-stone-400 dark:bg-stone-500 rounded-sm" />
            </span>
          )}
          <span className="fb-mono fb-tabular text-[13px] font-semibold tracking-tight">
            {remaining === 0 ? '5 minutes done' : fmt(remaining)}
          </span>
          {!isEngaged && remaining > 0 && (
            <span className="text-[10px] text-stone-500 dark:text-stone-400 fb-mono">
              paused{pausedSeconds >= 60 ? ` · ${Math.floor(pausedSeconds / 60)}m away` : ''}
            </span>
          )}
          {renewedCount > 0 && remaining > 0 && (
            <span className="text-[10px] text-stone-500 dark:text-stone-400">
              · renewed {renewedCount}×
            </span>
          )}
          {remaining > 0 && (
            <button
              onClick={handleAbandon}
              className="ml-1 h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200"
              title="End session early (no shame)"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      </div>

      {/* End-of-session choice modal */}
      {showChoice && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-stone-900/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 w-full max-w-sm mx-4 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="px-5 py-4 text-center">
              <div className="text-3xl mb-1">✨</div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
                {renewedCount === 0
                  ? 'Five minutes done.'
                  : `${renewedCount + 1} × five minutes done.`}
              </h3>
              <p className="text-[13px] text-stone-600 dark:text-stone-400 leading-relaxed">
                You showed up — that's the win.{' '}
                <span className="text-stone-500 dark:text-stone-500">
                  ({Math.floor(elapsedTotal / 60)}m on {taskTitle})
                </span>
              </p>
            </div>
            <div className="px-5 pb-4 space-y-2">
              <button
                onClick={handleDone}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                <Icon name="check_circle" size={16} />
                Done for now
              </button>
              <button
                onClick={() => void handleKeepGoing(5 * 60)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg btn-primary"
              >
                <Icon name="play_arrow" size={16} />
                Keep going · 5 more
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleKeepGoing(15 * 60)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs text-stone-700 dark:text-stone-300 transition-colors"
                >
                  <Icon name="timer" size={13} />
                  15 min
                </button>
                <button
                  onClick={() => void handleKeepGoing(25 * 60)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs text-stone-700 dark:text-stone-300 transition-colors"
                >
                  <Icon name="timer" size={13} />
                  25 min (pomodoro)
                </button>
              </div>
            </div>
            <p className="px-5 pb-4 text-[11px] text-stone-500 dark:text-stone-500 text-center">
              No streak to break. Both choices count as a win.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
