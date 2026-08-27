import { useEffect, useRef, useState } from 'react'
import { useWorkItemStore } from '../stores/workItems'
import { CLASS_CHOICES, CLASS_LABEL, QUEUE_ICON } from '../lib/attentionQueues'
import Icon from './Icon'

// The ONE confirm stop (DEC-019), extracted so every capture surface renders
// the SAME flow (DEC-028): the console overlay and the chat's inline card are
// two hosts of this single component — classify, the pre-highlighted class
// chips (←/→ cycle, Enter files), DEC-025's secondary chips, DEC-026's tidy
// offer, and the Q1 date question all live here and nowhere else. The class
// choice set lives with the queue semantics (attentionQueues) — one copy.

export { CLASS_CHOICES, CLASS_LABEL }

/** How long Enter will wait on an in-flight tidy before filing what it has.
 *  Long enough for a normal Haiku round trip, short enough that a dead call
 *  never strands the capture. */
export const TIDY_WAIT_CAP_MS = 4000

interface ConfirmState {
  picked: string
  confidence: number
  title: string
  /** DEC-034: the operator's own notes, tidied in place when a tidy lands. */
  notes: string
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
  notes: rawNotes = '',
  deskCtx,
  source,
  onFiled,
  onCancel,
  cancelLabel = '← Edit text'
}: {
  /** The capture, verbatim — classified on mount. */
  text: string
  /** DEC-034: optional context typed into the console's notes field. */
  notes?: string
  /** DEC-023 desk-context parenting, resolved by the host at its own moment. */
  deskCtx: { id: string; title: string } | null
  /** CR-09 D-A: set when this capture came from MARKING an object. The item
   *  then points at that object (sourceType/sourceRef) and opens on the class
   *  the preset table chose — deterministic, no model call. */
  source?: { sourceType: string; sourceRef: string; intentClass?: string } | null
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
  // The Enter that OPENED this card must not also file it. The card mounts
  // with a class chip auto-focused, so that same keystroke (or its auto-repeat)
  // landed straight on the confirm handler and filed the untidied item —
  // "if I click enter it just enters as is" (operator live QA). The card arms
  // on the first keyUP, which is the release of the very key that opened it.
  const [armed, setArmed] = useState(false)
  // The tidy in flight, so Enter can WAIT for it rather than racing it.
  const tidyPending = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    let alive = true
    setConfirm(null)
    setCleanup(null)
    setCleanupUsed(false)
    setConfirmDate('')
    setError(null)
    setArmed(false)
    tidyPending.current = null
    // A MARKED object already knows what it is — the preset table decided,
    // so the classifier is skipped entirely (no latency, no model, works with
    // the key removed). Typed captures still classify.
    if (source?.intentClass) {
      setConfirm({
        picked: source.intentClass,
        confidence: 1,
        title: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        notes: rawNotes.trim(),
        dueAt: null,
        needsDate: false,
        phrase: null,
        secondaries: []
      })
      return () => {
        alive = false
      }
    }
    void window.api.workItems
      .classify(text)
      .then((c) => {
        if (!alive) return
        setConfirm({
          picked: c.intentClass,
          confidence: c.confidence,
          title: c.title,
          notes: rawNotes.trim(),
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
        // The tidy is still requested AFTER the screen is up — a capture never
        // waits on it (R011) — but it now lands INTO the preview rather than
        // sitting beside it as an offer. "Enter as is" is the escape hatch.
        const tidy = window.api.workItems
          .proposeCleanup(text, rawNotes.trim() || undefined)
          .then((p) => {
            if (alive && p && cleanupSeq.current === seq) {
              setCleanup({ title: p.title, note: p.note, originalTitle: c.title })
              setCleanupUsed(true)
              setConfirm((prev) =>
                prev ? { ...prev, title: p.title, notes: p.note || prev.notes } : prev
              )
            }
            return p
          })
          .catch(() => null)
          .finally(() => {
            if (tidyPending.current === tidy) tidyPending.current = null
          })
        tidyPending.current = tidy
      })
      .catch(() => {
        if (alive) setError('Could not classify that. Try again.')
      })
    return () => {
      alive = false
      cleanupSeq.current++
    }
  }, [text, rawNotes, source?.intentClass])

  function cycleClass(dir: 1 | -1): void {
    if (!confirm) return
    const idx = CLASS_CHOICES.findIndex((c) => c.value === confirm.picked)
    const next = CLASS_CHOICES[(idx + dir + CLASS_CHOICES.length) % CLASS_CHOICES.length]
    setConfirm({ ...confirm, picked: next.value })
  }

  /** asIs = file the operator's OWN words: no tidied title, no tidied notes. */
  async function fileConfirmed(asIs = false): Promise<void> {
    if (!confirm || busy) return
    setBusy(true)
    try {
      // "If I click enter there, it should save the TIDIED item." When the
      // tidy is still in flight, Enter waits for it rather than racing it —
      // capped, so a slow or dead call can never strand the capture. (The
      // capture path itself still never waits: this is the confirm step.)
      if (!asIs && tidyPending.current) {
        await Promise.race([
          tidyPending.current,
          new Promise((r) => setTimeout(r, TIDY_WAIT_CAP_MS))
        ])
      }
      const dueAt = confirm.needsDate
        ? confirmDate
          ? new Date(`${confirmDate}T17:00:00`).toISOString()
          : null
        : confirm.dueAt
      const extras = confirm.secondaries.filter((s) => s.checked)
      // The verbatim capture is NEVER lost (DEC-026): a tidied item keeps the
      // original under an "as captured" rule, and "Enter as is" files the
      // operator's own words as the item itself.
      const typed = text.trim()
      const rawTitle = typed.length > 120 ? `${typed.slice(0, 117)}…` : typed
      const ownNotes = rawNotes.trim()
      const title = asIs ? rawTitle : confirm.title
      // Untidied: keep BOTH the operator's notes and the verbatim capture when
      // the derived title dropped part of it (e.g. "fyi:" stripped, or only the
      // first sentence became the title). Letting notes win alone would have
      // silently discarded the rest of what was typed.
      const verbatim = typed === confirm.title ? '' : typed
      const notes = asIs
        ? // "Enter as is" IS the verbatim path — the operator's own words are
          // the item, so no marker is needed to say so.
          ownNotes || (typed === rawTitle ? undefined : typed)
        : cleanupUsed && cleanup
          ? // A tidied save is CLEAN (operator ruling): no "— as captured —"
            // block trailing the notes. The two recovery paths sit BEFORE the
            // save — "Tidied · undo" restores his wording in the preview, and
            // "Enter as is" files it untouched — so the choice is always his
            // and always visible, rather than archived into the notes.
            confirm.notes || undefined
          : [confirm.notes, verbatim].filter(Boolean).join('\n\n') || undefined
      const item = await createItem({
        title,
        notes,
        parentId: deskCtx?.id ?? null,
        intentClass: confirm.picked,
        dueAt,
        confidence: confirm.confidence,
        approvalState: 'auto', // user-authored: submitting IS the approval
        sourceType: source?.sourceType ?? 'note',
        sourceRef: source?.sourceRef ?? null,
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
      onKeyUp={(e) => {
        // The release of the Enter that opened this card arms it.
        if (e.key === 'Enter') setArmed(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') cycleClass(1)
        if (e.key === 'ArrowLeft') cycleClass(-1)
        if (e.key === 'Enter') {
          e.preventDefault()
          if (!armed) return // the keystroke that got us here
          void fileConfirmed()
        }
        if (e.key === 'Escape') onCancel()
      }}
    >
      {/* DEC-034: the second screen is a PREVIEW of the finished item, laid
          out the way it will sit in the queue — tidied title, tidied notes,
          the recommended class — so the decision is "does this look right?"
          rather than "what will this become?". Enter accepts; Enter as is
          keeps the operator's own words. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--ink-70)]">
          This is how it will file — Enter to confirm.
        </span>
        {cleanupUsed && cleanup && (
          <button
            onClick={() => {
              setConfirm({ ...confirm, title: cleanup.originalTitle, notes: rawNotes.trim() })
              setCleanupUsed(false)
            }}
            title="Put my own wording back"
            className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press shrink-0"
          >
            <Icon name="auto_awesome" size={12} /> Tidied · undo
          </button>
        )}
      </div>
      <div className="mt-2 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <Icon
            name={QUEUE_ICON[confirm.picked] ?? 'check_circle'}
            size={16}
            className="text-[var(--ink-30)] shrink-0 mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="fb-t-body font-medium text-[var(--ink-100)] break-words">
                {confirm.title}
              </span>
              {confirm.dueAt && (
                <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[11px] bg-[var(--surface-sunken)] text-[var(--ink-50)]">
                  <Icon name="schedule" size={11} />
                  {new Date(confirm.dueAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              )}
            </div>
            {confirm.notes && (
              <div className="mt-1 text-[12px] text-[var(--ink-60)] whitespace-pre-wrap break-words">
                {confirm.notes}
              </div>
            )}
            {deskCtx && (
              <div className="mt-1 text-[11px] text-[var(--ink-40)]">on {deskCtx.title}</div>
            )}
          </div>
        </div>
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
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button
          onClick={onCancel}
          className="text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press"
        >
          {cancelLabel}
        </button>
        <div className="flex items-center gap-1.5">
          {/* Only offered when the tidy actually changed something — otherwise
              "as is" and "Enter" would file the identical item. */}
          {cleanupUsed && cleanup && (
            <button
              onClick={() => void fileConfirmed(true)}
              disabled={busy}
              title="File exactly what I typed — no rewritten title, no rewritten notes"
              className="h-8 px-3 fb-press fb-t-label text-[var(--ink-60)] hover:text-[var(--ink-100)] disabled:opacity-50"
            >
              Enter as is
            </button>
          )}
          <button
            onClick={() => void fileConfirmed()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
          >
            {busy ? 'Filing…' : 'Enter ↵'}
          </button>
        </div>
      </div>
    </div>
  )
}
