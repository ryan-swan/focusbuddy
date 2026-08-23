import { useEffect, useMemo, useRef, useState } from 'react'
import type { FbNode, TimeBlock, TimeBlockMeeting, TimeBlockRecurrence } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useTimeBlockStore } from '../../stores/timeBlocks'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { futuristicPowerOn } from '../../lib/audioBeep'
import { newMeetingRoomId, joinMeetingRoom } from '../../lib/startMeeting'
import { sendMeetingInvites } from '../../lib/meetingInvite'
import { googleCalendarUrl } from '@shared/ics'
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
  // A node (task or folder) dragged onto the grid — booked directly without
  // the picker.
  prefillNode?: { id: string; title: string; kind: FbNode['kind'] }
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
  const goProject = useViewStore((s) => s.goProject)

  const weekFrom = weekStart.getTime()
  const weekTo = weekFrom + 7 * DAY_MS

  useEffect(() => {
    void loadRange(weekFrom, weekTo)
  }, [weekFrom, weekTo, loadRange])

  // A block can link to ANY node — a task (focusable) or a folder (jump-to).
  const nodesById = useMemo(() => {
    const m = new Map<string, FbNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  const tasks = useMemo(() => nodes.filter((n) => n.kind === 'task'), [nodes])

  // Open the node a block links to: tasks open in the canvas, folders open the
  // project dashboard.
  function jumpToNode(node: FbNode): void {
    if (node.kind === 'task') {
      setActive(node.id)
      goTask(node.id)
    } else {
      goProject(node.id)
    }
  }

  const [composer, setComposer] = useState<Composer | null>(null)
  // "Add to calendar" menu for a meeting block — anchored at the click point.
  const [calMenu, setCalMenu] = useState<{ block: TimeBlock; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; previewStart: number; previewDur: number } | null>(
    null
  )
  const dragRef = useRef<{
    id: string
    mode: 'move' | 'resize' | 'resize-top'
    startClientY: number
    origStartMs: number
    origDur: number
    origDayIndex: number
  } | null>(null)
  // Live refs to each day column so a move-drag can hit-test the pointer's X and
  // reschedule a block onto another day (Google-Calendar-style cross-day drag).
  const colRefs = useRef<(HTMLDivElement | null)[]>([])

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
    setComposer({
      dayIndex,
      startMs,
      prefillNode: { id: node.id, title: node.title, kind: node.kind }
    })
  }

  function beginDrag(
    e: React.PointerEvent,
    block: TimeBlock,
    mode: 'move' | 'resize' | 'resize-top'
  ): void {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      id: block.id,
      mode,
      startClientY: e.clientY,
      origStartMs: block.startMs,
      origDur: block.durationMin,
      origDayIndex: Math.floor((block.startMs - weekFrom) / DAY_MS)
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
      // Cross-day: find the day column under the pointer's X so a block can be
      // dragged to another day, keeping its time-of-day plus the vertical delta.
      let targetDay = d.origDayIndex
      for (let i = 0; i < 7; i++) {
        const r = colRefs.current[i]?.getBoundingClientRect()
        if (r && e.clientX >= r.left && e.clientX <= r.right) {
          targetDay = i
          break
        }
      }
      const timeOfDay = d.origStartMs - dayStartMs(weekStart, d.origDayIndex)
      const newStart = snapMs(dayStartMs(weekStart, targetDay) + timeOfDay + deltaMs)
      setDrag({ id: d.id, previewStart: newStart, previewDur: d.origDur })
    } else if (d.mode === 'resize') {
      const dur = Math.max(SNAP_MIN, Math.round((d.origDur + deltaMs / 60000) / SNAP_MIN) * SNAP_MIN)
      setDrag({ id: d.id, previewStart: d.origStartMs, previewDur: dur })
    } else {
      // resize-top: drag the top edge to start earlier/later, keeping the end fixed.
      const end = d.origStartMs + d.origDur * 60000
      const newStart = Math.min(snapMs(d.origStartMs + deltaMs), end - SNAP_MIN * 60000)
      setDrag({ id: d.id, previewStart: newStart, previewDur: Math.round((end - newStart) / 60000) })
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
            className="fb-t-caption font-mono text-[var(--ink-40)] text-right pr-1.5 -translate-y-1.5"
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
          // A block being dragged is placed by its PREVIEW start, so a cross-day
          // drag relocates it into the day column under the pointer live.
          const effStart = (b: TimeBlock): number =>
            drag && drag.id === b.id ? drag.previewStart : b.startMs
          const dayBlocks = blocks.filter((b) => effStart(b) >= dStart && effStart(b) < dStart + DAY_MS)
          return (
            <div key={dayIndex} className="flex flex-col min-w-0">
              <div
                className={`text-center fb-t-caption font-semibold py-1 rounded-[var(--radius-chip)] ${
                  isToday
                    ? 'text-accent'
                    : 'text-[var(--ink-50)]'
                }`}
              >
                {label} {new Date(dStart).getDate()}
              </div>
              <div
                ref={(el) => (colRefs.current[dayIndex] = el)}
                className={`relative rounded-[var(--radius-row)] border ${
                  isToday
                    ? 'border-accent/40 bg-accent/[0.03]'
                    : 'border-[var(--edge-soft)] bg-[var(--surface-sunken)]'
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
                    className="absolute left-0 right-0 border-t border-[var(--edge-soft)] pointer-events-none"
                  />
                ))}

                {dayBlocks.map((block) => {
                  const preview = drag && drag.id === block.id ? drag : null
                  const startMs = preview ? preview.previewStart : block.startMs
                  const durMin = preview ? preview.previewDur : block.durationMin
                  const top =
                    ((startMs - (dStart + START_HOUR * 3_600_000)) / 3_600_000) * HOUR_PX
                  const height = (durMin / 60) * HOUR_PX
                  const linked = block.taskId ? nodesById.get(block.taskId) ?? null : null
                  const isTaskBlock = !block.taskId || linked?.kind === 'task'
                  const done = block.status === 'done'
                  const isPast = startMs + durMin * 60000 < now
                  return (
                    <div
                      key={block.id}
                      data-testid="time-block"
                      onPointerDown={(e) => beginDrag(e, block, 'move')}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute left-0.5 right-0.5 rounded-[var(--radius-chip)] px-1.5 py-1 fb-t-caption overflow-hidden cursor-grab active:cursor-grabbing group/block border ${
                        done
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : isPast
                            ? 'bg-[var(--surface-sunken)]/90 border-[var(--edge-firm)]/50 text-[var(--ink-50)]'
                            : 'bg-accent/15 border-accent/40 text-[var(--ink-90)]'
                      }`}
                      style={{ top: Math.max(0, top), height: Math.max(16, height) }}
                      title={`${block.title || linked?.title || 'Focus time'} · ${fmtTime(startMs)}`}
                    >
                      <div className={`font-medium truncate ${done ? 'line-through' : ''}`}>
                        {block.title || linked?.title || 'Focus time'}
                      </div>
                      <div className="text-[9px] opacity-70 tabular-nums">{fmtTime(startMs)}</div>

                      {/* hover actions */}
                      <div className="absolute top-0.5 right-0.5 hidden group-hover/block:flex items-center gap-0.5">
                        {block.meeting && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void joinMeetingRoom(block.meeting!.roomId, block.title || 'Meeting')
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-accent !text-white fb-press"
                            title="Join this meeting"
                            data-testid="block-join-meeting"
                          >
                            <Icon name="videocam" size={9} />
                          </button>
                        )}
                        {block.meeting && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setCalMenu({ block, x: e.clientX, y: e.clientY })
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-[var(--surface-raised)]/90 text-[var(--ink-70)] fb-press"
                            title="Add to my calendar"
                            data-testid="block-add-to-calendar"
                          >
                            <Icon name="event" size={9} />
                          </button>
                        )}
                        {linked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              jumpToNode(linked)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-[var(--surface-raised)]/90 text-[var(--ink-70)] fb-press"
                            title={linked.kind === 'folder' ? 'Open this folder' : 'Jump to this task'}
                            data-testid="block-jump"
                          >
                            <Icon name={linked.kind === 'folder' ? 'folder_open' : 'open_in_new'} size={9} />
                          </button>
                        )}
                        {!done && isTaskBlock && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              focusBlock(block)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-accent !text-white fb-press"
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
                          className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-[var(--surface-raised)]/90 text-[var(--ink-70)] fb-press"
                          title={done ? 'Mark not done' : 'Mark done'}
                        >
                          <Icon name={done ? 'undo' : 'check'} size={9} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            // Repeating blocks offer this-only vs this-and-future.
                            // The Undo toast covers recovery either way.
                            if (block.seriesId) {
                              const wholeSeries = confirm(
                                'This block repeats. OK deletes this and all future occurrences; Cancel deletes just this one.'
                              )
                              void removeBlock(block.id, wholeSeries ? 'series' : 'one')
                            } else {
                              void removeBlock(block.id)
                            }
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="h-4 w-4 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-[var(--surface-raised)]/90 text-[var(--ink-70)] hover:text-rose-500 fb-press"
                          title="Delete block"
                          data-testid="block-delete"
                        >
                          <Icon name="close" size={9} />
                        </button>
                      </div>

                      {/* resize handles — top edge changes the start, bottom edge
                          the end, matching Google Calendar. */}
                      <div
                        onPointerDown={(e) => beginDrag(e, block, 'resize-top')}
                        className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize"
                        title="Drag to change the start time"
                        data-testid="block-resize-top"
                      />
                      <div
                        onPointerDown={(e) => beginDrag(e, block, 'resize')}
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize"
                        title="Drag to change the end time"
                        data-testid="block-resize-bottom"
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
          tasks={tasks.filter((t) => t.status !== 'done')}
          prefillNode={composer.prefillNode}
          onCancel={() => setComposer(null)}
          onCreate={async (taskId, title, durationMin, meeting, recurrence) => {
            await createBlock({ taskId, title, startMs: composer.startMs, durationMin, meeting, recurrence })
            if (!meeting || meeting.invitees.length === 0) return { inviteNote: null }
            // Send the join details to the invitees over the connected mailbox,
            // and report the honest outcome (sent / partial / no mailbox).
            const r = await sendMeetingInvites({
              title: title || 'Meeting',
              startMs: composer.startMs,
              durationMin,
              roomId: meeting.roomId,
              invitees: meeting.invitees
            })
            if (r.noAccount) {
              return {
                inviteNote:
                  'Meeting saved. Connect a mailbox in Mail to email the invites; the join link is on the calendar block.'
              }
            }
            if (r.failed.length > 0) {
              return { inviteNote: `Meeting saved. Invited ${r.sent}; could not email ${r.failed.join(', ')}.` }
            }
            return { inviteNote: `Meeting saved and invites sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.` }
          }}
        />
      )}
      {calMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCalMenu(null)} />
          <div
            className="fixed z-50 w-52 rounded-[var(--radius-row)] fb-glass-panel fb-pop-in p-1 fb-t-label"
            style={{
              left: Math.min(calMenu.x, window.innerWidth - 220),
              top: Math.min(calMenu.y, window.innerHeight - 120)
            }}
            data-testid="add-to-calendar-menu"
          >
            <div className="px-2 py-1 fb-t-caption uppercase tracking-wide">
              Add to calendar
            </div>
            <button
              className="w-full text-left px-2 py-1.5 rounded-[var(--radius-chip)] hover:bg-[var(--surface-sunken)] fb-press flex items-center gap-2"
              onClick={() => {
                const b = calMenu.block
                void window.api.calendar.addMeetingIcs({
                  roomId: b.meeting!.roomId,
                  title: b.title || 'Meeting',
                  startMs: b.startMs,
                  durationMin: b.durationMin
                })
                setCalMenu(null)
              }}
            >
              <Icon name="event" size={13} />
              Apple Calendar / Outlook
            </button>
            <button
              className="w-full text-left px-2 py-1.5 rounded-[var(--radius-chip)] hover:bg-[var(--surface-sunken)] fb-press flex items-center gap-2"
              onClick={() => {
                const b = calMenu.block
                void window.api.files.openExternal(
                  googleCalendarUrl({
                    uid: `${b.meeting!.roomId}@plexidesk`,
                    title: b.title || 'Meeting',
                    startMs: b.startMs,
                    durationMin: b.durationMin,
                    joinUrl: `haptyx://meet?room=${encodeURIComponent(b.meeting!.roomId)}`
                  })
                )
                setCalMenu(null)
              }}
            >
              <Icon name="public" size={13} />
              Google Calendar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function BlockComposer({
  startMs,
  tasks,
  prefillNode,
  onCancel,
  onCreate
}: {
  startMs: number
  tasks: FbNode[]
  prefillNode?: { id: string; title: string; kind: FbNode['kind'] }
  onCancel: () => void
  onCreate: (
    taskId: string | null,
    title: string,
    durationMin: number,
    meeting: TimeBlockMeeting | null,
    recurrence: TimeBlockRecurrence | null
  ) => Promise<{ inviteNote: string | null }>
}): JSX.Element {
  const [taskId, setTaskId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(60)
  const [repeat, setRepeat] = useState<TimeBlockRecurrence | ''>('')
  const [busy, setBusy] = useState(false)
  const [isMeeting, setIsMeeting] = useState(false)
  const [invitees, setInvitees] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // A meeting block gets a stable room id now so the same link works for the
  // host and every invitee. Emails are split on commas, spaces, and newlines.
  function parsedInvitees(): string[] {
    return invitees
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
  }

  async function submit(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const meeting: TimeBlockMeeting | null = isMeeting
        ? { roomId: newMeetingRoomId(), invitees: parsedInvitees() }
        : null
      // A dragged node books directly against that node; otherwise use the
      // picker (a chosen task, or a labelled generic focus block).
      let result: { inviteNote: string | null }
      if (prefillNode) {
        result = await onCreate(prefillNode.id, '', duration, meeting, repeat || null)
      } else {
        const label = taskId ? '' : title.trim() || (isMeeting ? 'Meeting' : 'Focus time')
        result = await onCreate(taskId || null, label, duration, meeting, repeat || null)
      }
      // If invites went out (or couldn't), show the honest note and keep the
      // panel open so the user reads it; otherwise close straight away.
      if (result.inviteNote) {
        setInviteNote(result.inviteNote)
      } else {
        onCancel()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fb-scrim fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fb-card fb-press w-[340px] rounded-[var(--radius-card)] fb-pop-in p-4 space-y-3"
        data-testid="block-composer"
      >
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={16} className="text-accent" />
          <h3 className="fb-t-title text-[var(--ink-100)]">Book time</h3>
          <span className="ml-auto fb-t-caption font-mono">
            {fmtTime(startMs)}
          </span>
        </div>

        {prefillNode ? (
          <div
            className="flex items-center gap-2 rounded-[var(--radius-row)] bg-[var(--surface-sunken)] px-2 py-1.5"
            data-testid="composer-prefill"
          >
            <Icon
              name={prefillNode.kind === 'folder' ? 'folder' : 'task_alt'}
              size={14}
              className="text-accent shrink-0"
            />
            <span className="fb-t-body text-[var(--ink-90)] truncate">
              {prefillNode.title}
            </span>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="fb-t-caption uppercase tracking-wider font-medium">
                Task
              </span>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="fb-field fb-t-body mt-1"
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
                <span className="fb-t-caption uppercase tracking-wider font-medium">
                  Label (optional)
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Focus time"
                  className="fb-field fb-t-body mt-1"
                />
              </label>
            )}
          </>
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isMeeting}
            onChange={(e) => setIsMeeting(e.target.checked)}
            className="accent-accent"
            data-testid="composer-meeting-toggle"
          />
          <Icon name="videocam" size={14} className="text-accent" />
          <span className="fb-t-body text-[var(--ink-90)]">Video meeting</span>
        </label>

        {isMeeting && (
          <label className="block">
            <span className="fb-t-caption uppercase tracking-wider font-medium">
              Invite people (emails)
            </span>
            <textarea
              value={invitees}
              onChange={(e) => setInvitees(e.target.value)}
              placeholder="alex@acme.com, sam@acme.com"
              rows={2}
              className="fb-field fb-t-body mt-1 resize-none"
              data-testid="composer-invitees"
            />
            <span className="mt-1 block fb-t-caption">
              Each invitee gets an email with the time and a link to join in PlexiDesk.
            </span>
          </label>
        )}

        {inviteNote && (
          <div
            className="rounded-[var(--radius-row)] bg-[var(--surface-sunken)] px-2.5 py-2 fb-t-label text-[var(--ink-70)]"
            data-testid="composer-invite-note"
          >
            {inviteNote}
          </div>
        )}

        <label className="block">
          <span className="fb-t-caption uppercase tracking-wider font-medium">
            Length
          </span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="fb-field fb-t-body mt-1"
          >
            {[15, 25, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="fb-t-caption uppercase tracking-wider font-medium">
            Repeats
          </span>
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as TimeBlockRecurrence | '')}
            className="fb-field fb-t-body mt-1"
            data-testid="block-repeat"
          >
            <option value="">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          {inviteNote ? (
            <button onClick={onCancel} className="btn-primary" data-testid="composer-done">
              <Icon name="check" size={14} />
              <span>Done</span>
            </button>
          ) : (
            <>
              <button onClick={onCancel} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="btn-primary"
                data-testid="composer-create"
              >
                <Icon name={isMeeting ? 'videocam' : 'add'} size={14} />
                <span>{isMeeting ? 'Schedule meeting' : 'Book it'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
