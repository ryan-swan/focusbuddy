import { useEffect, useMemo, useRef, useState } from 'react'
import type { SnapshotMeta, Widget } from '@shared/types'
import DeskMiniature from './DeskMiniature'
import Icon from './Icon'
import { useWidgetStore } from '../stores/widgets'
import { useNodeStore } from '../stores/nodes'
import { useLinksStore } from '../stores/links'

// Desk time-travel. Scrub the recorded history of this desk, preview any past
// state, then restore it (reversibly — a "Before restore" snapshot is taken
// first) or branch it into a fresh task.

function when(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  if (s < 90) return 'a minute ago'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

interface Props {
  taskId: string
  onClose: () => void
}

export default function HistoryPanel({ taskId, onClose }: Props): JSX.Element {
  const reloadWidgets = useWidgetStore((s) => s.loadForTask)
  const reloadLinks = useLinksStore((s) => s.loadForTask)
  const setActive = useNodeStore((s) => s.setActive)
  const taskTitle = useNodeStore((s) => s.nodes.find((n) => n.id === taskId)?.title) || 'this desk'

  const [snaps, setSnaps] = useState<SnapshotMeta[]>([])
  const [index, setIndex] = useState(0)
  const [preview, setPreview] = useState<Widget[] | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.api.snapshots.list(taskId).then((list) => {
      setSnaps(list)
      setIndex(0)
    })
  }, [taskId])

  const selected = snaps[index] ?? null
  useEffect(() => {
    if (!selected) {
      setPreview(null)
      return
    }
    let alive = true
    void window.api.snapshots.get(selected.id).then((s) => {
      if (alive) setPreview(s?.widgets ?? [])
    })
    return () => {
      alive = false
    }
  }, [selected])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The scrubber runs oldest → newest left-to-right, but `snaps` is newest-first;
  // map the slider value to the array index accordingly.
  const sliderMax = Math.max(0, snaps.length - 1)
  const sliderValue = sliderMax - index
  const onSlider = (v: number): void => setIndex(sliderMax - v)

  async function restore(): Promise<void> {
    if (!selected || busy) return
    setBusy(true)
    const res = await window.api.snapshots.restore(selected.id)
    if (res) {
      await reloadWidgets(taskId)
      await reloadLinks(taskId)
    }
    setBusy(false)
    onClose()
  }

  async function branch(): Promise<void> {
    if (!selected || busy) return
    setBusy(true)
    const res = await window.api.snapshots.branch(selected.id, `${taskTitle} (branch)`)
    setBusy(false)
    if (res) {
      // Refresh the node tree so the new task is known, then dive into it.
      await useNodeStore.getState().refresh()
      setActive(res.taskId)
    }
    onClose()
  }

  const previewBox = useMemo(() => ({ w: 460, h: 300 }), [])

  return (
    <div className="fb-scrim fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div
        ref={ref}
        className="w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-xl fb-glass-pillow border border-[color:var(--glass-pillow-border)] bg-[var(--surface-sunken)]/95 flex flex-col"
        data-testid="history-panel"
      >
        <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="history" size={18} className="text-accent" />
            <div>
              <div className="text-sm font-semibold text-[var(--ink-100)]">
                Time travel
              </div>
              <div className="text-[10px] text-[var(--ink-50)]">
                Scrub {taskTitle}&rsquo;s history, then restore or branch a past state.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close time travel">
            <Icon name="close" size={16} />
          </button>
        </div>

        {snaps.length === 0 ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-2 p-10 text-[var(--ink-40)]"
            data-testid="history-empty"
          >
            <Icon name="history_toggle_off" size={28} />
            <div className="text-[12px]">No history yet. Edits to this desk are recorded as you work.</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            {/* Timeline list */}
            <div className="w-56 shrink-0 border-r border-[var(--edge-soft)] overflow-y-auto">
              {snaps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setIndex(i)}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--edge-soft)] transition-colors ${
                    i === index
                      ? 'bg-accent/10'
                      : 'hover:bg-[var(--surface-sunken)]'
                  }`}
                  data-testid={`history-snap-${s.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[var(--ink-90)]">
                      {when(s.at)}
                    </span>
                    <span className="text-[10px] text-[var(--ink-40)]">
                      {s.widgetCount} item{s.widgetCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {s.label && (
                    <div className="text-[10px] text-[var(--ink-50)] mt-0.5">
                      {s.label}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Preview + actions */}
            <div className="flex-1 min-w-0 flex flex-col p-4 gap-3">
              <div
                className="flex-1 min-h-0 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden flex items-center justify-center"
                data-testid="history-preview"
              >
                {preview ? (
                  <DeskMiniature widgets={preview} width={previewBox.w} height={previewBox.h} />
                ) : (
                  <span className="text-[11px] text-[var(--ink-40)]">Loading…</span>
                )}
              </div>

              {/* Scrubber */}
              <div className="px-1">
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  value={sliderValue}
                  onChange={(e) => onSlider(Number(e.target.value))}
                  className="w-full h-1 accent-accent cursor-pointer"
                  data-testid="history-scrubber"
                />
                <div className="flex items-center justify-between text-[9px] text-[var(--ink-40)] mt-1">
                  <span>oldest</span>
                  <span className="text-[var(--ink-70)]">
                    {selected ? when(selected.at) : ''}
                  </span>
                  <span>now</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void restore()}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12px] font-medium disabled:opacity-60"
                  data-testid="history-restore"
                >
                  <Icon name="restore" size={14} />
                  Restore this state
                </button>
                <button
                  onClick={() => void branch()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--edge-firm)] text-[var(--ink-70)] text-[12px] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
                  data-testid="history-branch"
                >
                  <Icon name="alt_route" size={14} />
                  Branch
                </button>
              </div>
              <p className="text-[10px] text-[var(--ink-40)] leading-snug -mt-1">
                Restoring first saves your current desk as a snapshot, so you can always come back.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
