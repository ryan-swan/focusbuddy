import { useState } from 'react'
import { clearDrift, fmtAway, useDriftState } from '../lib/driftDetector'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useChatStore } from '../stores/chat'
import { chimeIn } from '../lib/audioBeep'
import Icon from './Icon'

// Floating "Bring me back" pill that surfaces when the user returns after drifting.
// One tap → summarizes the recent trail into the chat, refocuses the last-active widget,
// plays the focus chime, and dismisses. The 60-second re-entry tax killer.
export default function BringMeBack(): JSX.Element | null {
  const drift = useDriftState()
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const widgets = useWidgetStore((s) => s.widgets)
  const focusOn = useWidgetStore((s) => s.focusOn)
  const pushAssistantMessage = useChatStore((s) => s.pushAssistantMessage)
  const [recapping, setRecapping] = useState(false)

  if (drift.driftedForMs === null) return null

  async function handleBringBack(): Promise<void> {
    if (recapping) return
    setRecapping(true)
    chimeIn()

    // Summarize the last 30 min of trail into the chat (reuses the External Brain function)
    const sinceMs = Date.now() - 30 * 60 * 1000
    const taskId = activeTaskId
    const result = await window.api.trail.summarize(taskId, sinceMs)
    if (result.ok && result.summary) {
      pushAssistantMessage(taskId, `_(welcome back — here's where you were)_\n\n${result.summary}`)
    } else if (!result.ok && result.error) {
      pushAssistantMessage(taskId, `Welcome back. (Couldn't load the trail: ${result.error})`)
    }

    // Refocus the most recently-updated visible widget on the canvas
    const candidate = [...widgets]
      .filter((w) => !w.archived && w.taskId === taskId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (candidate) {
      focusOn(candidate.id)
    }

    setRecapping(false)
    clearDrift()
  }

  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[160] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-stone-900 border border-accent/40 shadow-2xl backdrop-blur animate-[fadeInUp_300ms_ease-out] text-sm">
        <Icon name="waving_hand" size={16} className="text-accent" />
        <span className="text-stone-700 dark:text-stone-300">
          Welcome back —{' '}
          <span className="text-stone-500 dark:text-stone-400 text-xs">
            you were away {fmtAway(drift.driftedForMs!)}
          </span>
        </span>
        <button
          onClick={handleBringBack}
          disabled={recapping}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-xs font-medium transition-colors disabled:opacity-60"
          style={{ backgroundColor: 'rgb(var(--accent))' }}
        >
          <Icon
            name={recapping ? 'hourglass_top' : 'replay'}
            size={13}
            className={recapping ? 'animate-spin' : ''}
          />
          <span>{recapping ? 'Reading…' : 'Bring me back'}</span>
        </button>
        <button
          onClick={clearDrift}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          title="Dismiss"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  )
}
