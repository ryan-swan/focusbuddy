import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { FbNode, NodeDraft, TaskItemCategory, TaskUrgency } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import Icon from './Icon'
import Modal from './plexi/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewTaskModalProps {
  open: boolean
  onClose: () => void
  defaultDeskId?: string
  defaultRoomId?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: TaskItemCategory[] = [
  'action',
  'review',
  'deliverable',
  'decision',
  'wait',
  'research',
  'misc'
]

const CATEGORY_COLORS: Partial<Record<TaskItemCategory, string>> = {
  action: 'bg-blue-500/15 text-blue-600 border-blue-300/40',
  review: 'bg-amber-500/15 text-amber-600 border-amber-300/40',
  deliverable: 'bg-emerald-500/15 text-emerald-600 border-emerald-300/40',
  decision: 'bg-purple-500/15 text-purple-600 border-purple-300/40',
  wait: 'bg-slate-500/15 text-slate-500 border-slate-300/40',
  research: 'bg-cyan-500/15 text-cyan-600 border-cyan-300/40',
  misc: 'bg-[var(--surface-sunken)] text-[var(--ink-60)] border-[var(--edge-soft)]'
}

const URGENCY_OPTIONS: Array<{ value: TaskUrgency; label: string; dot: string }> = [
  { value: 'high', label: 'High', dot: 'bg-rose-500' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-400' },
  { value: 'low', label: 'Low', dot: 'bg-[var(--ink-20)]' }
]

// ── Sub-components ────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

function TagInput({ tags, onChange }: TagInputProps): JSX.Element {
  const [inputVal, setInputVal] = useState('')

  function addTag(raw: string): void {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean)
    const next = Array.from(new Set([...tags, ...parts]))
    if (next.length !== tags.length) onChange(next)
    setInputVal('')
  }

  function removeTag(tag: string): void {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap gap-1 items-center min-h-[32px] rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-0.5 text-[rgb(var(--accent)/0.7)] hover:text-[rgb(var(--accent))] leading-none"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            if (inputVal.trim()) addTag(inputVal)
          }
          if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
            removeTag(tags[tags.length - 1])
          }
        }}
        onBlur={() => { if (inputVal.trim()) addTag(inputVal) }}
        placeholder={tags.length === 0 ? 'Add tags, press Enter or comma…' : ''}
        className="flex-1 min-w-[120px] bg-transparent text-[12px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none"
      />
    </div>
  )
}

// ── Main modal inner content ──────────────────────────────────────────────────

interface InnerProps {
  onClose: () => void
  defaultDeskId?: string
  defaultRoomId?: string
  nodes: FbNode[]
  onCreate: (draft: NodeDraft) => Promise<void>
}

function NewTaskModalInner({
  onClose,
  defaultDeskId,
  defaultRoomId,
  nodes,
  onCreate
}: InnerProps): JSX.Element {
  const titleRef = useRef<HTMLInputElement>(null)

  // ── Local form state ───────────────────────────────────────────────────────

  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState(false)
  const [category, setCategory] = useState<TaskItemCategory | undefined>(undefined)
  const [urgency, setUrgency] = useState<TaskUrgency | undefined>(undefined)
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Room / Desk derivation ─────────────────────────────────────────────────

  // Rooms = kind === 'folder' nodes (top-level or any folder)
  const rooms = useMemo(
    () => nodes.filter((n) => n.kind === 'folder'),
    [nodes]
  )

  // Desks = kind === 'task' nodes that can serve as a task-item parent
  // (i.e., task nodes — in this app a "desk" is a task that holds task-items).
  // We look for nodes with kind === 'task' so task-items can be parented there.
  const desks = useMemo(
    () => nodes.filter((n) => n.kind === 'task'),
    [nodes]
  )

  // Resolve initial room selection
  const initialRoomId = useMemo((): string => {
    if (defaultRoomId && rooms.some((r) => r.id === defaultRoomId)) return defaultRoomId
    if (defaultDeskId) {
      const desk = desks.find((d) => d.id === defaultDeskId)
      if (desk?.parentId) {
        const parentIsRoom = rooms.some((r) => r.id === desk.parentId)
        if (parentIsRoom) return desk.parentId
      }
    }
    return ''
  }, [defaultRoomId, defaultDeskId, rooms, desks])

  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoomId)

  // Resolve initial desk selection
  const initialDeskId = useMemo((): string => {
    if (defaultDeskId && desks.some((d) => d.id === defaultDeskId)) return defaultDeskId
    return ''
  }, [defaultDeskId, desks])

  const [selectedDeskId, setSelectedDeskId] = useState<string>(initialDeskId)

  // Desks filtered to the selected room
  const filteredDesks = useMemo((): FbNode[] => {
    if (!selectedRoomId) {
      // "No room" — show desks with no parent (free desks)
      return desks.filter((d) => d.parentId === null)
    }
    return desks.filter((d) => d.parentId === selectedRoomId)
  }, [desks, selectedRoomId])

  // When room changes, reset desk if it no longer belongs to the new room
  useEffect(() => {
    if (selectedDeskId) {
      const deskStillValid = filteredDesks.some((d) => d.id === selectedDeskId)
      if (!deskStillValid) {
        setSelectedDeskId('')
      }
    }
  }, [filteredDesks, selectedDeskId])

  // ── Focus title on mount ───────────────────────────────────────────────────

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleCreate(): Promise<void> {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError(true)
      titleRef.current?.focus()
      return
    }

    setBusy(true)
    try {
      const draft: NodeDraft = {
        kind: 'task-item',
        title: trimmed,
        parentId: selectedDeskId || null,
        category,
        urgency,
        taskDueDate: dueDate || undefined,
        tags: tags.length > 0 ? tags : undefined,
        taskNotes: notes.trim() || undefined
      }
      await onCreate(draft)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleCreate()
    }
  }

  // ── Label styles ───────────────────────────────────────────────────────────

  const labelClass =
    'block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1.5'
  const inputClass =
    'w-full rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2.5 py-2 text-[13px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors'
  const selectClass =
    'w-full rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2.5 py-2 text-[13px] text-[var(--ink-100)] outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors appearance-none cursor-pointer'

  return (
    <div
      className="w-[520px] rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-xl overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--edge-soft)]">
        <div className="flex items-center gap-2">
          <Icon name="add_task" size={16} className="text-[rgb(var(--accent))]" />
          <h2 className="text-[14px] font-semibold text-[var(--ink-100)]">New Task</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-[var(--ink-50)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
          aria-label="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Form */}
      <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

        {/* Title */}
        <div>
          <label className={labelClass}>Title</label>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError(false)
            }}
            placeholder="What needs to happen?"
            className={`${inputClass} ${titleError ? 'border-rose-400 focus:border-rose-400' : ''}`}
            aria-invalid={titleError}
          />
          {titleError && (
            <p className="mt-1 text-[11px] text-rose-500">Title is required.</p>
          )}
        </div>

        {/* Assign to — Room then Desk */}
        <div>
          <label className={labelClass}>Assign to</label>
          <div className="grid grid-cols-2 gap-2">
            {/* Room picker */}
            <div className="relative">
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className={selectClass}
                aria-label="Room"
              >
                <option value="">No room / Free desk</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.title || '(untitled room)'}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron_right"
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-40)] rotate-90 pointer-events-none"
              />
            </div>

            {/* Desk picker */}
            <div className="relative">
              <select
                value={selectedDeskId}
                onChange={(e) => setSelectedDeskId(e.target.value)}
                className={selectClass}
                aria-label="Desk"
                disabled={filteredDesks.length === 0}
              >
                <option value="">No desk</option>
                {filteredDesks.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    {desk.title || '(untitled desk)'}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron_right"
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-40)] rotate-90 pointer-events-none"
              />
              {filteredDesks.length === 0 && (
                <p className="mt-1 text-[10px] text-[var(--ink-40)]">
                  {selectedRoomId
                    ? 'No desks in this room yet.'
                    : 'No free desks available.'}
                </p>
              )}
            </div>
          </div>
          {selectedDeskId && (
            <p className="mt-1.5 text-[10px] text-[var(--ink-50)] flex items-center gap-1">
              <Icon name="grid_view" size={10} />
              Task will appear under{' '}
              <span className="font-medium text-[var(--ink-70)]">
                {desks.find((d) => d.id === selectedDeskId)?.title ?? 'this desk'}
              </span>
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className={labelClass}>Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(category === cat ? undefined : cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors border ${
                  category === cat
                    ? `${CATEGORY_COLORS[cat] ?? ''}`
                    : 'bg-[var(--surface-sunken)] text-[var(--ink-60)] border-[var(--edge-soft)] hover:border-[var(--edge-firm)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label className={labelClass}>Urgency</label>
          <div className="flex items-center gap-2">
            {URGENCY_OPTIONS.map(({ value, label, dot }) => (
              <button
                key={value}
                type="button"
                onClick={() => setUrgency(urgency === value ? undefined : value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  urgency === value
                    ? 'bg-[var(--surface-raised)] border-[var(--edge-firm)] text-[var(--ink-100)] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'bg-[var(--surface-sunken)] border-[var(--edge-soft)] text-[var(--ink-60)] hover:border-[var(--edge-firm)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div>
          <label className={labelClass}>Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Tags */}
        <div>
          <label className={labelClass}>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context or notes…"
            rows={3}
            className="w-full resize-none bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg px-2.5 py-2 text-[12.5px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors"
            style={{ minHeight: '80px', fieldSizing: 'content' } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--edge-soft)] bg-[color-mix(in_oklab,var(--surface-raised)_96%,transparent)]">
        <p className="text-[10px] text-[var(--ink-40)]">
          <kbd className="font-mono">⌘ Enter</kbd> to create
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110"
            style={{ backgroundColor: 'rgb(var(--accent))' }}
          >
            {busy ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating…
              </>
            ) : (
              <>
                <Icon name="add" size={14} />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Exported modal shell (handles open/close animation + portal) ──────────────

export default function NewTaskModal({
  open,
  onClose,
  defaultDeskId,
  defaultRoomId
}: NewTaskModalProps): JSX.Element | null {
  const nodes = useNodeStore((s) => s.nodes)
  const create = useNodeStore((s) => s.create)

  async function handleCreate(draft: NodeDraft): Promise<void> {
    await create(draft)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <Modal
          onClose={onClose}
          label="New Task"
          z={220}
          className="outline-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <NewTaskModalInner
              onClose={onClose}
              defaultDeskId={defaultDeskId}
              defaultRoomId={defaultRoomId}
              nodes={nodes}
              onCreate={handleCreate}
            />
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>,
    document.body
  )
}
