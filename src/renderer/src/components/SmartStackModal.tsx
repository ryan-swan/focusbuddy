import { useEffect, useState } from 'react'
import type { SmartStackGroup, Widget } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import {
  computeSectionFrame,
  effectiveLayout
} from '../lib/sectionGeometry'
import {
  getCachedProposal,
  invalidateCache,
  setCachedProposal,
  signatureFor
} from '../lib/smartStackCache'
import { sectionCreate } from '../lib/audioBeep'
import Icon from './Icon'

// Auto-pick rotation — same palette as SectionWidget so the new sections look native.
// Skips colors already in use on canvas if possible.
const SECTION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#737373']

function pickColors(usedColors: string[], n: number): string[] {
  const available = SECTION_COLORS.filter((c) => !usedColors.includes(c))
  const pool = available.length >= n ? available : [...available, ...SECTION_COLORS]
  return pool.slice(0, n)
}

type State =
  | { stage: 'loading' }
  | { stage: 'ready'; groups: SmartStackGroup[]; selected: Set<number>; fromCache: boolean }
  | { stage: 'error'; message: string; needsApiKey?: boolean }
  | { stage: 'applying' }

interface Props {
  onClose: () => void
}

export default function SmartStackModal({ onClose }: Props): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const widgets = useWidgetStore((s) => s.widgets)
  const createWidget = useWidgetStore((s) => s.create)
  const updateWidget = useWidgetStore((s) => s.update)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)

  const [state, setState] = useState<State>({ stage: 'loading' })

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && state.stage !== 'applying') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, state.stage])

  useEffect(() => {
    if (!activeTaskId) {
      setState({ stage: 'error', message: 'Pick a task first.' })
      return
    }
    let cancelled = false
    void (async () => {
      const signature = signatureFor(widgets)
      const cached = getCachedProposal(activeTaskId, signature)
      if (cached) {
        if (!cancelled) {
          setState({
            stage: 'ready',
            groups: cached.groups,
            selected: new Set(cached.groups.map((_, i) => i)),
            fromCache: true
          })
        }
        return
      }
      const result = await window.api.smartStack.propose(activeTaskId)
      if (cancelled) return
      if (result.ok && result.groups && result.groups.length > 0) {
        setCachedProposal(activeTaskId, signature, result.groups)
        setState({
          stage: 'ready',
          groups: result.groups,
          selected: new Set(result.groups.map((_, i) => i)),
          fromCache: false
        })
      } else {
        setState({
          stage: 'error',
          message: result.error ?? 'No groups found.',
          needsApiKey: result.needsApiKey
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeTaskId, widgets])

  async function applyProposal(groups: SmartStackGroup[]): Promise<void> {
    if (!activeTaskId) return
    setState({ stage: 'applying' })

    // Color rotation — skip colors already in use on canvas
    const usedColors = widgets
      .filter((w) => w.kind === 'section' && w.color)
      .map((w) => w.color as string)
    const colors = pickColors(usedColors, groups.length)

    // Place new sections below existing top-level content (mirroring groupByType in Canvas)
    const PADDING = 80
    const GAP = 40
    const topLevel = widgets.filter(
      (w) => !w.parentSectionId && !w.archived && !w.pinned
    )
    let startY = PADDING
    if (topLevel.length > 0) {
      const bottom = topLevel.reduce((maxY, w) => {
        let h = w.height
        if (w.kind === 'section') {
          const ch = widgets.filter((c) => c.parentSectionId === w.id)
          h = computeSectionFrame(ch, effectiveLayout(w.layout)).height
        }
        return Math.max(maxY, w.y + h)
      }, 0)
      startY = bottom + GAP
    }

    let cursorX = PADDING
    let cursorY = startY
    let rowMaxH = 0
    const ROW_LIMIT_X = PADDING + 1600 // generous wrap width — sections wrap by row

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      // Compute the frame the new section will need given its children
      const memberWidgets = widgets.filter((w) => g.widgetIds.includes(w.id))
      if (memberWidgets.length === 0) continue
      const synthetic: Widget[] = memberWidgets.map((w) => ({
        ...w,
        parentSectionId: 'tmp',
        x: 0,
        y: 0
      }))
      const frame = computeSectionFrame(synthetic, 'grid')

      if (cursorX !== PADDING && cursorX + frame.width > ROW_LIMIT_X) {
        cursorX = PADDING
        cursorY += rowMaxH + GAP
        rowMaxH = 0
      }

      const section = await createWidget({
        taskId: activeTaskId,
        kind: 'section',
        title: g.name,
        content: '',
        x: cursorX,
        y: cursorY,
        width: frame.width,
        height: frame.height,
        color: colors[i]
      })
      await updateWidget(section.id, { layout: 'grid' })
      for (const w of memberWidgets) {
        await updateWidget(w.id, { parentSectionId: section.id, x: 0, y: 0 })
      }
      cursorX += frame.width + GAP
      rowMaxH = Math.max(rowMaxH, frame.height)
      sectionCreate()
    }

    bumpLayout()
    invalidateCache(activeTaskId)
    onClose()
  }

  function toggle(i: number): void {
    if (state.stage !== 'ready') return
    const next = new Set(state.selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setState({ ...state, selected: next })
  }

  function refreshProposal(): void {
    if (!activeTaskId) return
    invalidateCache(activeTaskId)
    setState({ stage: 'loading' })
    // Re-trigger the effect by toggling — easiest path is to call propose directly here
    void (async () => {
      const result = await window.api.smartStack.propose(activeTaskId)
      if (result.ok && result.groups && result.groups.length > 0) {
        const signature = signatureFor(widgets)
        setCachedProposal(activeTaskId, signature, result.groups)
        setState({
          stage: 'ready',
          groups: result.groups,
          selected: new Set(result.groups.map((_, i) => i)),
          fromCache: false
        })
      } else {
        setState({ stage: 'error', message: result.error ?? 'No groups found.' })
      }
    })()
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={state.stage !== 'applying' ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-stone-900 w-full max-w-lg mx-4 rounded-lg shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="hub" size={18} className="text-accent" />
            <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Smart Stack
            </h3>
            {state.stage === 'ready' && state.fromCache && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                cached
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {state.stage === 'ready' && (
              <button
                onClick={refreshProposal}
                className="icon-btn"
                title="Generate a fresh proposal"
              >
                <Icon name="refresh" size={14} />
              </button>
            )}
            <button onClick={onClose} className="icon-btn" aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {state.stage === 'loading' && (
            <div className="py-8 flex flex-col items-center justify-center text-stone-500 dark:text-stone-400">
              <Icon name="hub" size={32} className="text-accent mb-2 animate-pulse" />
              <p className="text-sm">Finding groups in your widgets…</p>
            </div>
          )}

          {state.stage === 'error' && (
            <div className="py-6 flex flex-col items-center text-center gap-2">
              <Icon name="warning" size={24} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-stone-800 dark:text-stone-200">{state.message}</p>
              {state.needsApiKey && (
                <p className="text-[12px] text-stone-500 dark:text-stone-400">
                  Open <strong>Settings → AI · API keys</strong> to paste your Anthropic key.
                </p>
              )}
            </div>
          )}

          {(state.stage === 'ready' || state.stage === 'applying') && (
            <>
              <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3 leading-relaxed">
                {state.stage === 'applying'
                  ? 'Creating sections…'
                  : 'Here\'s what I\'d group together. Uncheck any you don\'t want.'}
              </p>
              <div className="space-y-2">
                {(state.stage === 'ready' ? state.groups : []).map((g, i) => {
                  const checked = state.stage === 'ready' && state.selected.has(i)
                  const memberWidgets = widgets.filter((w) => g.widgetIds.includes(w.id))
                  const color = pickColors([], state.stage === 'ready' ? state.groups.length : 0)[i]
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'border-accent bg-accent/5'
                          : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(i)}
                        className="mt-1 h-3.5 w-3.5 accent-violet-600 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {g.name}
                          </span>
                          <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono shrink-0">
                            {memberWidgets.length} widget{memberWidgets.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        {g.reason && (
                          <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug mb-1.5">
                            {g.reason}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {memberWidgets.map((w) => (
                            <span
                              key={w.id}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 truncate max-w-[160px]"
                              title={w.title || w.content?.slice(0, 80)}
                            >
                              {w.title || <em className="not-italic text-stone-400 dark:text-stone-500">{w.kind}</em>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={state.stage === 'applying'}
            className="btn-ghost disabled:opacity-50"
          >
            Cancel
          </button>
          {state.stage === 'ready' && (
            <button
              onClick={() => {
                const accepted = state.groups.filter((_, i) => state.selected.has(i))
                if (accepted.length === 0) {
                  onClose()
                  return
                }
                void applyProposal(accepted)
              }}
              disabled={state.selected.size === 0}
              className="btn-primary"
            >
              <Icon name="hub" size={14} />
              <span>
                Create {state.selected.size} section{state.selected.size === 1 ? '' : 's'}
              </span>
            </button>
          )}
          {state.stage === 'applying' && (
            <button disabled className="btn-primary opacity-70">
              <Icon name="hourglass_top" size={14} />
              <span>Creating…</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
