import { useEffect } from 'react'
import type { FbNode } from '@shared/types'
import Icon from './Icon'

interface Props {
  task: FbNode
  elapsedMin: number
  totalEstimateMin: number
  onExtend: (minutes: number) => void
  onMarkDone: () => void
  onSnooze: () => void
}

const EXTENSIONS = [
  { label: '+15 min', minutes: 15 },
  { label: '+30 min', minutes: 30 },
  { label: '+1 hour', minutes: 60 }
]

export default function ExtensionPrompt({
  task,
  elapsedMin,
  totalEstimateMin,
  onExtend,
  onMarkDone,
  onSnooze
}: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onSnooze()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSnooze])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/55 backdrop-blur-md p-6">
      <div className="bg-white rounded-lg shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 bg-red-50 flex items-center gap-2">
          <Icon name="alarm" size={20} className="text-red-700" />
          <h3 className="text-sm font-semibold text-stone-900">Time's up on this task</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-stone-800">
            <strong className="font-semibold">{task.title}</strong> has been running for{' '}
            <strong>{Math.floor(elapsedMin)} min</strong> against an estimate of{' '}
            <strong>{totalEstimateMin} min</strong>.
          </p>
          <p className="text-xs text-stone-600">
            Need more time, or call it done? You can always extend — but each extension is logged so
            you can see your real time vs. estimates.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-end gap-2">
          <button onClick={onSnooze} className="btn-ghost">
            <Icon name="close" size={14} />
            <span>Snooze 5 min</span>
          </button>
          <button onClick={onMarkDone} className="btn-ghost border border-stone-300">
            <Icon name="check" size={14} />
            <span>Mark done</span>
          </button>
          {EXTENSIONS.map((e) => (
            <button key={e.minutes} onClick={() => onExtend(e.minutes)} className="btn-primary">
              <Icon name="add_alarm" size={14} />
              <span>{e.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
