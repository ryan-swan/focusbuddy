import { useEffect, useMemo, useRef, useState } from 'react'
import type { FbNode, TimeBlock } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useTimeBlockStore } from '../../stores/timeBlocks'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { futuristicPowerOn } from '../../lib/audioBeep'
import Icon from '../Icon'

// Week time-grid — the time-blocking surface. Seventeen hour rows × seven day
// columns. Click an empty slot to book a block (tie it to a task or leave it as
// generic focus time), drag a block to reschedule, drag its bottom edge to
// change its length, and start a focus session straight from a block.

const START_HOUR = 6
const END_HOUR = 23 // exclusive-ish; we render rows START_HOUR..END_HOUR-1
const HOUR_PX = 44
const SNAP_MIN = 15
const DAY_MS = 86_400_000
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayStartMs(weekStart: Date, dayIndex: number): number {
  const d = new Date(weekStart)
  d.setDate(weekStart.getDate() + dayIndex)
  return d.getTime()
}

function snapMs(ms: number): number {
  const snap = SNAP_MIN * 60000
  return Math.round(ms / snap) * snap
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface Composer {
  dayIndex: number
  startMs: number
  prefillTaskId?: string | null
  prefillTitle?: string
}

export default function WeekTimeGrid({ weekStart }: { weekStart: Date }): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const blocks = useTimeBlockStore((s) => s.blocks)
  const loadRange = useTimeBlockStore((s) => s.loadRange)
  const createBlock = useTimeBlockStore((s) => s.create)
  const updateBlock = useTimeBlockStore((s) => s.update)
  const removeBlock = useTimeBlockStore((s) => s.remove)
  const startSession = useFocusSessionStore((s) => s.start)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)

  const weekFrom = weekStart.getTime()
  const weekTo = weekFrom + 7 * DAY_MS

  useEffect(() => {
    void loadRange(weekFrom, weekTo)
  }, [weekFrom, weekTo, loadRange])

  const tasksById = useMemo(() => {
    const m = new Map<string, FbNode>()
    for (const n of nodes) if (n.kind === 'task') m.set(n.id, n)
    return m
  }, [nodes])

  const [composer, setComposer] = useState<Composer | null>(null)
  const [drag, setDrag] = useState<{ id: string; previewStart: number; previewDur: number } | null>(
    null
  )
  const dragRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    startClientY: number
    origStartMs: number
    origDur: number
    dayTop: number
  } | null>(null)

  // Convert a y offset within a day column to an absolute time for that day.
  function yToMs(dayIndex: number, y: number): number {
    const base = dayStartMs(weekStart, dayIndex) + START_HOUR * 3_600_000
    return base + (y / HOUR_PX) * 3_600_000
  }

  function onColumnClick(e: React.MouseEvent, dayIndex: number): void {
    // Ignore clicks that landed on a block (those stopPropagation).
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    setComposer({ dayIndex, startMs: snapMs(yToMs(dayIndex, y)) })
  }

  // Dragging a task or folder from the sidebar onto a day column opens the
  // composer pre-filled at the dropped time, so you book it by just confirming
  // how long. The sidebar already publishes the node id as `text/fb-node`.
  function onColumnDragOver(e: React.DragEvent): void {
    if (e.dataTransfer.types.includes('text/fb-node')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function onColumnDrop(e: React.DragEvent, dayIndex: number): void {
    const id = e.dataTransfer.getData('text/fb-node')
    if (!id) return
    e.preventDefault()
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const startMs = snapMs(yToMs(dayIndex, y))
    if (node.kind === 'task') {
      setComposer({ dayIndex, startMs, prefillTaskId: node.id })
    } else {
      // A folder isn't a focusable task, so book it as a labelled focus block
      // named after the folder.
      setComposer({ dayIndex, startMs, prefillTitle: node.title })
    }
  }

  function beginDrag(
    e: React.PointerEvent,
    block: TimeBlock,
    mode: 'move' | 'resize'
  ): void {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      id: block.id,
      mode,
      startClientY: e.clientY,
      origStartMs: block.startMs,
      origDur: block.durationMin,
      dayTop: 0
    }
    setDrag({ id: block.id, previewStart: block.startMs, previewDur: block.durationMin })
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd, { once: true })
  }

  function onDragMove(e: PointerEvent): void {
    const d = dragRef.current
    if (!d) return
    const deltaY = e.clientY - d.startClientY
    const deltaMs = (deltaY / HOUR_PX) * 3_600_000
    if (d.mode === 'move') {
      setDrag({ id: d.id, previewStart: snapMs(d.origStartMs + deltaMs), previewDur: d.origDur })
    } else {
      const dur = Math.max(SNAP_MIN, Math.round((d.origDur + deltaMs / 60000) / SNAP_MIN) * SNAP_MIN)
      setDrag({ id: d.id, previewStart: d.origStartMs, previewDur: dur })
    }
  }

  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    const d = dragRef.current
    dragRef.current = null
    setDrag((cur) => {
      if (d && cur && cur.id === d.id) {
        if (cur.previewStart !== d.origStartMs || cur.previewDur !== d.origDur) {
          void updateBlock(d.id, { startMs: cur.previewStart, durationMin: cur.previewDur })
        }
      }
      return null
    })
  }

  function focusBlock(block: TimeBlock): void {
    futuristicPowerOn()
    void startSession(block.taskId, block.durationMin * 60, 'planned')
    if (block.taskId) {
      setActive(block.taskId)
      goTask(block.taskId)
    }
  }

  const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX
  const now = Date.now()

  return (
    <div className="flex" data-testid="week-time-grid">
      {/* Hour gutter */}
      <div className="w-12 shrink-0 select-none" style={{ paddingTop: 22 }}>
        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
          <div
            key={i}
            style={{ height: HOUR_PX }}
            className="text-[10px] font-mono text-stone-400 dark:text-stone-500 text-right pr-1.5 -translate-y-1.5"
          >
            {START_HOUR + i}:00
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-1 flex-1">
        {DAY_LABELS.map((label, dayIndex) => {
          const dStart = dayStartMs(weekStart, dayIndex)
          const isToday = new Date(dStart).toDateString() === new Date().toDateString()
          const dayBlocks = blocks.filter(
            (b) => b.startMs >= dStart && b.startMs < dStart + DAY_MS
          )
          return (
            <div key={dayIndex} className="flex flex-col min-w-0">
              <div
                className={`text-center text-[11px] font-semibold py-1 rounded ${
                  isToday
                    ? 'text-accent'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {label} {new Date(dStart).getDate()}
              </div>
              <div
                className={`relative rounded-lg border ${
                  isToday
                    ? 'border-accent/40 bg-accent/[0.03]'
                    : 'border-stone-200 dark:border-stone-700 bg-white/50 dark:bg-stone-900/40'
                }`}
                style={{ height: gridHeight }}
                onClick={(e) => onColumnClick(e, dayIndex)}
                onDragOver={onColumnDragOver}
                onDrop={(e) => onColumnDrop(e, dayIndex)}
                data-testid={`day-col-${dayIndex}`}
              >
                {/* hour lines */}
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    style={{ top: i * HOUR_PX, height: HOUR_PX }}
                    className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800 pointer-events-none"
                  />
                ))}

                {dayBlocks.map((block) => {
                  const preview = drag && drag.id === block.id ? drag : null
                  const startMs = preview ? preview.previewStart : block.startMs
                  const durMin = preview ? preview.previewDur : block.durationMin
                  const top =
                    ((startMs - (dStart + START_HOUR * 3_600_000)) / 3_600_000) * HOUR_PX
                  const height = (durMin / 60) * HOUR_PX
                  const task = block.taskId ? tasksById.get(block.taskId) : null
                  const done = block.status === 'done'
                  const isPast = startMs + durMin * 60000 < now
                  return (
                    <div
                      key={block.id}
                      data-testid="time-block"
                      onPointerDown={(e) => beginDrag(e, block, 'move')}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-[10px] overflow-hidden cursor-grab active:cursor-grabbing group/block border ${
                        done
                          ? 'bg-emerald-100/90 dark:bg-emerald-950/50 border-emerald-300/50 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                          : isPast
                            ? 'bg-stone-100/90 dark:bg-stone-800/80 border-stone-300/50 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                            : 'bg-accent/15 border-accent/40 text-stone-800 dark:text-stone-100'
                      }`}
                      style={{ top: Math.max(0, top), height: Math.max(16, height) }}
                      title={`${block.title || task?.title || 'Focus time'} · ${fmtTime(startMs)}`}
                    >
                      <div className={`font-medium truncate ${done ? 'line-through' : ''}`}>
                        {block.title || task?.title || 'Focus time'}
                      </div>
                      <div className="text-[9px] opacity-70 tabular-nums">{fmtTime(startMs)}</div>

                      {/* hover actions */}
                      <div className="absolute top-0.5 right-0.5 hidden group-hover/block:flex items-center gap-0.5">
                        {!done && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              focusBlock(block)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 inline-flex items-center justify-center rounded text-white"
                            style={{ backgroundColor: 'rgb(var(--accent))' }}
                            title="Start a focus session for this block"
                            data-testid="block-focus"
                          >
                            <Icon name="bolt" size={9} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void updateBlock(block.id, { status: done ? 'planned' : 'done' })
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="h-4 w-4 inline-flex items-center justify-center rounded bg-white/70 dark:bg-stone-900/70 text-stone-600 dark:text-stone-300"
                          title={done ? 'Mark not done' : 'Mark done'}
                        >
                          <Icon name={done ? 'undo' : 'check'} size={9} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void removeBlock(block.id)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="h-4 w-4 inline-flex items-center justify-center rounded bg-white/70 dark:bg-stone-900/70 text-stone-600 hover:text-red-600 dark:text-stone-300"
                          title="Delete block"
                          data-testid="block-delete"
                        >
                          <Icon name="close" size={9} />
                        </button>
                      </div>

                      {/* resize handle */}
                      <div
                        onPointerDown={(e) => beginDrag(e, block, 'resize')}
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize"
                        title="Drag to change length"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {composer && (
        <BlockComposer
          startMs={composer.startMs}
          tasks={[...tasksById.values()].filter((t) => t.status !== 'done')}
          initialTaskId={composer.prefillTaskId ?? ''}
          initialTitle={composer.prefillTitle ?? ''}
          onCancel={() => setComposer(null)}
          onCreate={async (taskId, title, durationMin) => {
            await createBlock({ taskId, title, startMs: composer.startMs, durationMin })
            setComposer(null)
          }}
        />
      )}
    </div>
  )
}

function BlockComposer({
  startMs,
  tasks,
  initialTaskId = '',
  initialTitle = '',
  onCancel,
  onCreate
}: {
  startMs: number
  tasks: FbNode[]
  initialTaskId?: string
  initialTitle?: string
  onCancel: () => void
  onCreate: (taskId: string | null, title: string, durationMin: number) => Promise<void>
}): JSX.Element {
  const [taskId, setTaskId] = useState<string>(initialTaskId)
  const [title, setTitle] = useState(initialTitle)
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function submit(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await onCreate(taskId || null, taskId ? '' : title.trim() || 'Focus time', duration)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[340px] rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4 space-y-3"
        data-testid="block-composer"
      >
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Book time</h3>
          <span className="ml-auto text-[11px] font-mono text-stone-500 dark:text-stone-400">
            {fmtTime(startMs)}
          </span>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
            Task
          </span>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="mt-1 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-2 py-1.5 text-sm"
            data-testid="composer-task"
          >
            <option value="">Focus time (no task)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        {!taskId && (
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
              Label (optional)
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Focus time"
              className="mt-1 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
            Length
          </span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-2 py-1.5 text-sm"
          >
            {[15, 25, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="btn-primary"
            data-testid="composer-create"
          >
            <Icon name="add" size={14} />
            <span>Book it</span>
          </button>
        </div>
      </div>
    </div>
  )
}
