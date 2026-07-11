import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FbNode, NodePatch, TaskItemCategory, TaskStatus, TaskUrgency } from '@shared/types'
import Icon from './Icon'

export interface TaskDetailPanelProps {
  node: FbNode
  onUpdate: (patch: NodePatch) => void
  onDelete: (id: string) => void
  defaultExpanded?: boolean
  onNavigate?: (deskId: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: TaskItemCategory[] = [
  'action',
  'review',
  'deliverable',
  'decision',
  'wait',
  'research',
  'misc'
]

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'parked', label: 'Parked' }
]

const URGENCY_OPTIONS: Array<{ value: TaskUrgency; label: string; dot: string }> = [
  { value: 'high', label: 'High', dot: 'bg-rose-500' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-400' },
  { value: 'low', label: 'Low', dot: 'bg-[var(--ink-20)]' }
]

const CATEGORY_COLORS: Partial<Record<TaskItemCategory, string>> = {
  action: 'bg-blue-500/15 text-blue-600',
  review: 'bg-amber-500/15 text-amber-600',
  deliverable: 'bg-emerald-500/15 text-emerald-600',
  decision: 'bg-purple-500/15 text-purple-600',
  wait: 'bg-slate-500/15 text-slate-500',
  research: 'bg-cyan-500/15 text-cyan-600',
  misc: 'bg-[var(--surface-sunken)] text-[var(--ink-60)]'
}

function urgencyDot(urgency: TaskUrgency | undefined): string {
  if (urgency === 'high') return 'bg-rose-500'
  if (urgency === 'medium') return 'bg-amber-400'
  return 'bg-[var(--ink-20)]'
}

// ── Collapsed row ─────────────────────────────────────────────────────────────

interface CollapsedRowProps {
  node: FbNode
  expanded: boolean
  onToggle: () => void
  onStatusToggle: () => void
  onNavigate?: (deskId: string) => void
}

function CollapsedRow({ node, expanded, onToggle, onStatusToggle, onNavigate }: CollapsedRowProps): JSX.Element {
  const isDone = node.status === 'done'
  const canNavigate = onNavigate != null && node.parentId != null

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--surface-sunken)] transition-colors rounded-lg group"
      onClick={onToggle}
    >
      {/* Status checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onStatusToggle() }}
        className={`shrink-0 h-4 w-4 inline-flex items-center justify-center rounded border transition-colors ${
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : node.status === 'in_progress'
              ? 'border-sky-500 text-sky-500 hover:bg-sky-500/10'
              : 'border-[var(--edge-firm)] text-transparent hover:border-[var(--ink-50)]'
        }`}
        aria-label={isDone ? 'Mark undone' : 'Mark done'}
      >
        {isDone && <Icon name="check" size={9} />}
        {!isDone && node.status === 'in_progress' && <Icon name="play_arrow" size={9} />}
      </button>

      {/* Title */}
      <span
        className={`flex-1 min-w-0 text-[13px] truncate ${
          isDone ? 'line-through text-[var(--ink-50)]' : 'text-[var(--ink-100)]'
        }`}
      >
        {node.title || '(untitled)'}
      </span>

      {/* Category badge */}
      {node.category && (
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium capitalize ${CATEGORY_COLORS[node.category] ?? ''}`}
        >
          {node.category}
        </span>
      )}

      {/* Urgency dot */}
      {node.urgency && (
        <span
          className={`shrink-0 h-2 w-2 rounded-full ${urgencyDot(node.urgency)}`}
          title={`${node.urgency} urgency`}
        />
      )}

      {/* Due date chip */}
      {node.taskDueDate && (
        <span className="shrink-0 text-[10px] text-[var(--ink-60)] bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-full px-1.5 py-0.5">
          {node.taskDueDate}
        </span>
      )}

      {/* Go-to-desk navigation button — visible on hover, before expand chevron */}
      {canNavigate && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate!(node.parentId!)
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-5 w-5 rounded text-[var(--ink-50)] hover:text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.1)] transition-all"
          aria-label="Go to desk"
          title="Go to desk"
        >
          <Icon name="open_in_new" size={14} />
        </button>
      )}

      {/* Expand chevron */}
      <Icon
        name={expanded ? 'expand_less' : 'expand_more'}
        size={14}
        className="shrink-0 text-[var(--ink-40)] group-hover:text-[var(--ink-70)] transition-colors ml-auto"
      />
    </div>
  )
}

// ── Inline title editor ───────────────────────────────────────────────────────

interface InlineTitleProps {
  value: string
  onChange: (v: string) => void
}

function InlineTitle({ value, onChange }: InlineTitleProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(): void {
    setDraft(value)
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  function commit(): void {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onChange(trimmed)
    else setDraft(value)
  }

  function cancel(): void {
    setEditing(false)
    setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        className="w-full bg-transparent outline-none border-b border-[rgb(var(--accent))] text-[14px] font-semibold text-[var(--ink-100)] py-0.5"
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      className="block w-full text-[14px] font-semibold text-[var(--ink-100)] cursor-text hover:text-[rgb(var(--accent))] transition-colors py-0.5"
      title="Click to edit title"
    >
      {value || '(untitled)'}
    </span>
  )
}

// ── Tag chip input ─────────────────────────────────────────────────────────────

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
    <div className="flex flex-wrap gap-1 items-center min-h-[28px] rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]"
        >
          {tag}
          <button
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
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none"
      />
    </div>
  )
}

// ── Auto-grow textarea ────────────────────────────────────────────────────────

interface AutoTextareaProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function AutoTextarea({ value, onChange, placeholder }: AutoTextareaProps): JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg px-2.5 py-2 text-[12.5px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors"
      style={{ minHeight: '72px', fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}

// ── Segmented control ─────────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string }>
  value: T | undefined
  onChange: (v: T) => void
  size?: 'sm' | 'xs'
}

function Segmented<T extends string>({ options, value, onChange, size = 'sm' }: SegmentedProps<T>): JSX.Element {
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-[11px]'
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-1.5 py-0.5 rounded-md ${textSize} font-medium transition-colors ${
            value === opt.value
              ? 'bg-[var(--surface-raised)] text-[var(--ink-100)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
              : 'text-[var(--ink-60)] hover:text-[var(--ink-90)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskDetailPanel({
  node,
  onUpdate,
  onDelete,
  defaultExpanded = false,
  onNavigate
}: TaskDetailPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Local urgency state so clicks update the UI immediately even if the parent
  // re-render is async. Keeps in sync with node.urgency via key-based reset
  // (the parent should re-mount or pass updated node when the store updates).
  const [localUrgency, setLocalUrgency] = useState<TaskUrgency | undefined>(node.urgency)

  const isDone = node.status === 'done'

  function toggleStatus(): void {
    onUpdate({ status: isDone ? 'open' : 'done' })
  }

  function handleUrgencyClick(value: TaskUrgency): void {
    const next = localUrgency === value ? undefined : value
    setLocalUrgency(next)
    onUpdate({ urgency: next })
  }

  return (
    <div className="rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <CollapsedRow
        node={node}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onStatusToggle={toggleStatus}
        onNavigate={onNavigate}
      />

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[var(--edge-soft)] px-3 py-3 space-y-3">
              {/* Title */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Title
                </label>
                <InlineTitle
                  value={node.title}
                  onChange={(title) => onUpdate({ title })}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Status
                </label>
                <Segmented<TaskStatus>
                  options={STATUS_OPTIONS}
                  value={node.status}
                  onChange={(status) => onUpdate({ status })}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Category
                </label>
                <div className="flex flex-wrap gap-1">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => onUpdate({ category: node.category === cat ? undefined : cat })}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize transition-colors border ${
                        node.category === cat
                          ? `${CATEGORY_COLORS[cat] ?? ''} border-transparent`
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
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Urgency
                </label>
                <div className="flex items-center gap-1.5">
                  {URGENCY_OPTIONS.map(({ value, label, dot }) => {
                    const isActive = localUrgency === value
                    return (
                      <button
                        key={value}
                        onClick={() => handleUrgencyClick(value)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          isActive
                            ? 'bg-[var(--surface-raised)] border-[rgb(var(--accent)/0.6)] text-[var(--ink-100)] shadow-[0_0_0_2px_rgb(var(--accent)/0.15),0_1px_3px_rgba(0,0,0,0.1)]'
                            : 'bg-[var(--surface-sunken)] border-[var(--edge-soft)] text-[var(--ink-60)] hover:border-[var(--edge-firm)]'
                        }`}
                        aria-pressed={isActive}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Due date
                </label>
                <input
                  type="date"
                  value={node.taskDueDate ?? ''}
                  onChange={(e) => onUpdate({ taskDueDate: e.target.value || undefined })}
                  className="bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg px-2.5 py-1.5 text-[12.5px] text-[var(--ink-100)] outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Tags
                </label>
                <TagInput
                  tags={node.tags ?? []}
                  onChange={(tags) => onUpdate({ tags })}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-40)] mb-1">
                  Notes
                </label>
                <AutoTextarea
                  value={node.taskNotes ?? ''}
                  onChange={(taskNotes) => onUpdate({ taskNotes: taskNotes || undefined })}
                  placeholder="Add notes…"
                />
              </div>

              {/* Delete */}
              <div className="pt-1 border-t border-[var(--edge-soft)]">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--ink-70)]">Delete this task?</span>
                    <button
                      onClick={() => onDelete(node.id)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-500/15 text-rose-600 hover:bg-rose-500/25 transition-colors"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--ink-50)] hover:text-rose-500 hover:bg-rose-500/8 transition-colors"
                  >
                    <Icon name="delete" size={13} />
                    Delete task
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
