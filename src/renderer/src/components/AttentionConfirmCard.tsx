import { useEffect, useRef, useState } from 'react'
import { useWorkItemStore } from '../stores/workItems'
import Icon from './Icon'

// The ONE confirm stop (DEC-019), extracted so every capture surface renders
// the SAME flow (DEC-028): the console overlay and the chat's inline card are
// two hosts of this single component — classify, the pre-highlighted class
// chips (←/→ cycle, Enter files), DEC-025's secondary chips, DEC-026's tidy
// offer, and the Q1 date question all live here and nowhere else.

export const CLASS_CHOICES = [
  { value: 'action', label: 'Task', hint: 'Something to do' },
  { value: 'review', label: 'Review', hint: 'Needs judgment or sign-off' },
  { value: 'scheduling', label: 'Scheduling', hint: 'Time and calendar' },
  { value: 'fyi', label: 'FYI', hint: 'Worth knowing' },
  { value: 'acknowledgment', label: 'Acknowledgment', hint: 'Needs only receipt' },
  { value: 'discussion', label: 'Discussion', hint: 'Talk it through live' },
  { value: 'loose_thought', label: 'Loose thought', hint: 'Idle capture, may fade' }
]

export const CLASS_LABEL: Record<string, string> = {
  action: 'Task',
  review: 'Review',
  scheduling: 'Scheduling',
  fyi: 'FYI',
  acknowledgment: 'Acknowledgment',
  discussion: 'Discussion',
  loose_thought: 'Loose thought',
  direct: 'Message'
}

interface ConfirmState {
  picked: string
  confidence: number
  title: string
  dueAt: string | null
  needsDate: boolean
  phrase: string | null
  secondaries: Array<{
    text: string
    intentClass: string
    title: string
    dueAt: string | null
    checked: boolean
  }>
}

export default function AttentionConfirmCard({
  text,
  deskCtx,
  onFiled,
  onCancel,
  cancelLabel = '← Edit text'
}: {
  /** The capture, verbatim — classified on mount. */
  text: string
  /** DEC-023 desk-context parenting, resolved by the host at its own moment. */
  deskCtx: { id: string; title: string } | null
  /** Fired once everything is filed: a human summary + how many items. */
  onFiled: (summary: string, count: number, primaryId: string) => void
  onCancel: () => void
  cancelLabel?: string
}): JSX.Element {
  const createItem = useWorkItemStore((s) => s.create)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [confirmDate, setConfirmDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // DEC-026: the tidy — requested AFTER the screen is up, seq-guarded.
  const [cleanup, setCleanup] = useState<{ title: string; note: string; originalTitle: string } | null>(null)
  const [cleanupUsed, setCleanupUsed] = useState(false)
  const cleanupSeq = useRef(0)

  useEffect(() => {
    let alive = true
    setConfirm(null)
    setCleanup(null)
    setCleanupUsed(false)
    setConfirmDate('')
    setError(null)
    void window.api.workItems
      .classify(text)
      .then((c) => {
        if (!alive) return
        setConfirm({
          picked: c.intentClass,
          confidence: c.confidence,
          title: c.title,
          dueAt: c.dueAt,
          needsDate: c.clarify != null,
          phrase: c.clarify?.phrase ?? null,
          secondaries: (c.secondaries ?? []).map((s) => ({
            text: s.text,
            intentClass: s.intentClass,
            title: s.title,
            dueAt: s.dueAt,
            checked: true
          }))
        })
        const seq = ++cleanupSeq.current
        void window.api.workItems.proposeCleanup(text).then((p) => {
          if (alive && p && cleanupSeq.current === seq) {
            setCleanup({ title: p.title, note: p.note, originalTitle: c.title })
          }
        })
      })
      .catch(() => {
        if (alive) setError('Could not classify that. Try again.')
      })
    return () => {
      alive = false
      cleanupSeq.current++
    }
  }, [text])

  function cycleClass(dir: 1 | -1): void {
    if (!confirm) return
    const idx = CLASS_CHOICES.findIndex((c) => c.value === confirm.picked)
    const next = CLASS_CHOICES[(idx + dir + CLASS_CHOICES.length) % CLASS_CHOICES.length]
    setConfirm({ ...confirm, picked: next.value })
  }

  async function fileConfirmed(): Promise<void> {
    if (!confirm || busy) return
    setBusy(true)
    try {
      const dueAt = confirm.needsDate
        ? confirmDate
          ? new Date(`${confirmDate}T17:00:00`).toISOString()
          : null
        : confirm.dueAt
      const extras = confirm.secondaries.filter((s) => s.checked)
      const notes =
        cleanupUsed && cleanup
          ? `${cleanup.note}\n\n— as captured —\n${text.trim()}`
          : text.trim() === confirm.title
            ? undefined
            : text.trim()
      const item = await createItem({
        title: confirm.title,
        notes,
        parentId: deskCtx?.id ?? null,
        intentClass: confirm.picked,
        dueAt,
        confidence: confirm.confidence,
        approvalState: 'auto', // user-authored: submitting IS the approval
        sourceType: 'note',
        wiOrigin: 'human'
      })
      for (const s of extras) {
        await createItem({
          title: s.title,
          notes: s.text.trim() === s.title ? undefined : s.text.trim(),
          parentId: deskCtx?.id ?? null,
          intentClass: s.intentClass,
          dueAt: s.dueAt,
          confidence: 0.95,
          approvalState: 'auto',
          sourceType: 'note',
          wiOrigin: 'human'
        })
      }
      const summary =
        `${CLASS_LABEL[confirm.picked] ?? confirm.picked} — “${item.title}”` +
        (extras.length > 0 ? ` · +${extras.length} more` : '')
      onFiled(summary, 1 + extras.length, item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="text-[12px] text-red-600 dark:text-red-400 flex items-center gap-2">
        {error}
        <button onClick={onCancel} className="underline underline-offset-2 fb-press">
          Back
        </button>
      </div>
    )
  }
  if (!confirm) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--ink-40)] py-1.5">
        <Icon name="progress_activity" size={14} className="animate-spin" /> Classifying…
      </div>
    )
  }

  return (
    <div
      className="rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-2.5"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') cycleClass(1)
        if (e.key === 'ArrowLeft') cycleClass(-1)
        if (e.key === 'Enter') void fileConfirmed()
        if (e.key === 'Escape') onCancel()
      }}
    >
      <div className="text-[12px] text-[var(--ink-70)]">
        File as <strong>{CLASS_LABEL[confirm.picked]}</strong>? Enter confirms — or pick another.
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {CLASS_CHOICES.map((c) => (
          <button
            key={c.value}
            autoFocus={c.value === confirm.picked}
            onClick={() => setConfirm({ ...confirm, picked: c.value })}
            title={c.hint}
            className={`px-2.5 h-7 fb-t-label fb-press rounded-full ${
              confirm.picked === c.value
                ? 'bg-[rgb(var(--accent))] text-white'
                : 'bg-[var(--surface-raised)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {confirm.secondaries.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11px] text-[var(--ink-40)]">
            Also caught {confirm.secondaries.length === 1 ? 'another' : `${confirm.secondaries.length} more`} — filed
            together unless unchecked:
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {confirm.secondaries.map((s, idx) => (
              <button
                key={idx}
                onClick={() =>
                  setConfirm({
                    ...confirm,
                    secondaries: confirm.secondaries.map((x, i) =>
                      i === idx ? { ...x, checked: !x.checked } : x
                    )
                  })
                }
                title={s.text}
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-7 fb-t-label fb-press rounded-full ${
                  s.checked
                    ? 'bg-[rgba(var(--accent),0.12)] text-[var(--ink-100)] shadow-[0_0_0_1px_rgba(var(--accent),0.4)]'
                    : 'bg-[var(--surface-raised)] text-[var(--ink-40)] line-through'
                }`}
              >
                <Icon name={s.checked ? 'check_circle' : 'radio_button_unchecked'} size={13} />
                <span className="max-w-[200px] truncate">
                  {CLASS_LABEL[s.intentClass] ?? s.intentClass} · {s.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {cleanup && !cleanupUsed && (
        <div className="mt-2.5 flex items-start gap-2 rounded-[var(--radius-field)] bg-[var(--surface-raised)] px-2.5 py-2">
          <Icon name="auto_awesome" size={14} className="text-[var(--ink-40)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[var(--ink-40)]">Tidied version:</div>
            <div className="text-[12px] text-[var(--ink-90)] truncate" title={cleanup.note}>
              “{cleanup.title}”
            </div>
          </div>
          <button
            onClick={() => {
              setConfirm({ ...confirm, title: cleanup.title })
              setCleanupUsed(true)
            }}
            className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] shrink-0"
          >
            Use tidied
          </button>
          <button onClick={() => setCleanup(null)} title="Keep as written" className="icon-btn !h-7 !w-7 shrink-0">
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {cleanup && cleanupUsed && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-40)]">
          <Icon name="auto_awesome" size={12} /> Tidied — the original stays in the notes.
          <button
            onClick={() => {
              setConfirm({ ...confirm, title: cleanup.originalTitle })
              setCleanupUsed(false)
            }}
            className="underline underline-offset-2 hover:text-[var(--ink-100)] fb-press"
          >
            Undo
          </button>
        </div>
      )}
      {confirm.needsDate && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[12px] text-[var(--ink-70)]">When is “{confirm.phrase}”?</span>
          <input
            type="date"
            value={confirmDate}
            onChange={(e) => setConfirmDate(e.target.value)}
            className="fb-field bg-[var(--surface-raised)] px-2 py-1 text-[12px]"
          />
          <span className="text-[11px] text-[var(--ink-40)]">leave empty for no date</span>
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press"
        >
          {cancelLabel}
        </button>
        <button
          onClick={() => void fileConfirmed()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
        >
          {busy ? 'Filing…' : 'File it ↵'}
        </button>
      </div>
    </div>
  )
}
