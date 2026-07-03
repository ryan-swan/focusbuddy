import { useEffect, useState } from 'react'
import type { FbNode, WidgetSuggestion } from '@shared/types'
import { catalogFor } from '../lib/widgetCatalog'
import Icon from './Icon'
import Modal from './plexi/Modal'

interface Props {
  task: FbNode
  onClose: () => void
  onAccept: (selected: WidgetSuggestion[]) => Promise<void>
}

type State =
  | { stage: 'loading' }
  | { stage: 'ready'; suggestions: WidgetSuggestion[]; selected: Set<number> }
  | { stage: 'error'; message: string; needsApiKey?: boolean }
  | { stage: 'spawning' }

export default function AISetupDialog({ task, onClose, onAccept }: Props): JSX.Element {
  const [state, setState] = useState<State>({ stage: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const result = await window.api.setup.suggest(task.id)
      if (cancelled) return
      if (result.ok && result.suggestions && result.suggestions.length > 0) {
        setState({
          stage: 'ready',
          suggestions: result.suggestions,
          selected: new Set(result.suggestions.map((_, i) => i))
        })
      } else {
        setState({
          stage: 'error',
          message: result.error ?? 'No suggestions returned',
          needsApiKey: result.needsApiKey
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [task.id])

  function toggle(i: number): void {
    if (state.stage !== 'ready') return
    const next = new Set(state.selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setState({ ...state, selected: next })
  }

  async function handleAccept(): Promise<void> {
    if (state.stage !== 'ready') return
    const chosen = state.suggestions.filter((_, i) => state.selected.has(i))
    if (chosen.length === 0) {
      onClose()
      return
    }
    setState({ stage: 'spawning' })
    await onAccept(chosen)
    onClose()
  }

  const selectedCount = state.stage === 'ready' ? state.selected.size : 0

  return (
    <Modal
      onClose={onClose}
      label="Let me set up your desk"
      z={60}
      className="bg-white dark:bg-stone-900 rounded-lg shadow-2xl border border-stone-200 dark:border-stone-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
    >
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex items-center gap-2">
          <Icon name="auto_awesome" size={20} className="text-accent" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Let me set up your desk
            </h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              for: {task.title}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" title="Close (Esc)">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[200px]">
          {state.stage === 'loading' && (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <div className="animate-pulse mb-3">
                <Icon name="auto_awesome" size={36} className="text-accent" />
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300">
                Looking at your task…
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                Picking the widgets you'll need to start
              </p>
            </div>
          )}

          {state.stage === 'error' && (
            <div className="py-6 text-center">
              <Icon
                name={state.needsApiKey ? 'key' : 'error_outline'}
                size={28}
                className="text-amber-700 dark:text-amber-400 mb-2"
              />
              <p className="text-sm text-stone-800 dark:text-stone-200">
                {state.needsApiKey
                  ? 'Open Settings → AI · API keys and paste your Anthropic API key. No restart needed.'
                  : state.message}
              </p>
            </div>
          )}

          {state.stage === 'ready' && (
            <div className="space-y-2">
              <p className="text-[12px] text-stone-600 dark:text-stone-400 mb-3 leading-relaxed">
                Based on your task, here's what I think you'll need. Uncheck anything you don't
                want — defaults are tuned to give you a complete start.
              </p>
              {state.suggestions.map((s, i) => {
                const entry = catalogFor(s.kind)
                const checked = state.selected.has(i)
                return (
                  <label
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      checked
                        ? 'border-accent/40 bg-accent/5 dark:bg-accent/10'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(i)}
                      className="mt-0.5 h-4 w-4 rounded cursor-pointer accent-violet-600"
                    />
                    <span
                      className="h-9 w-9 rounded inline-flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: checked ? 'rgb(var(--accent) / 0.15)' : undefined
                      }}
                    >
                      <Icon
                        name={entry?.icon ?? 'apps'}
                        size={18}
                        className={checked ? 'text-accent' : 'text-stone-500 dark:text-stone-400'}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                          {s.title || entry?.label || s.kind}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 shrink-0">
                          {entry?.label ?? s.kind}
                        </span>
                      </div>
                      {s.reason && (
                        <p className="text-[12px] text-stone-600 dark:text-stone-400 mt-0.5 leading-snug">
                          {s.reason}
                        </p>
                      )}
                      {s.content && (
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 truncate font-mono">
                          {s.content}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {state.stage === 'spawning' && (
            <div className="h-full flex flex-col items-center justify-center py-8">
              <div className="animate-pulse mb-3">
                <Icon name="grid_view" size={36} className="text-accent" />
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300">
                Setting up your desk…
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          {state.stage === 'ready' && (
            <button
              onClick={() => void handleAccept()}
              disabled={selectedCount === 0}
              className="btn-primary"
            >
              <Icon name="auto_awesome" size={14} />
              <span>
                {selectedCount === 0
                  ? 'Pick at least one'
                  : `Set up ${selectedCount} widget${selectedCount === 1 ? '' : 's'} →`}
              </span>
            </button>
          )}
        </div>
    </Modal>
  )
}
