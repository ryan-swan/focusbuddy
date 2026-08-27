import { useEffect, useRef, useState } from 'react'
import { useWorkItemStore } from '../stores/workItems'
import { CLASS_CHOICES, CLASS_LABEL, QUEUE_ICON } from '../lib/attentionQueues'
import Icon from './Icon'
import TagMentionInput from './TagMentionInput'
import { URGENCY_LEVELS } from '../lib/itemTags'
import { CAPTURE_STATES } from '@shared/workItems'
import { serializeTags } from '../lib/itemTags'
import { serializeMentions, type ItemMention } from '../lib/itemMentions'
import { parseSelectionList, normalizeSelectionText } from '../lib/selectionList'

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
    /** DEC-046: -1 = grouped under the primary; n ≥ 0 = under secondary n;
     *  undefined = a plain sibling (typed-compound behavior unchanged). */
    parentIdx?: number
    /** List-derived rows follow the primary's class chip at filing time —
     *  one highlighted list is one kind of work. */
    listDerived?: boolean
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
  const updateFieldsStore = useWorkItemStore((s) => s.updateFields)
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
  // DEC-039 — chosen context at CAPTURE time: urgency + tags/mentions ride
  // the preview screen, so an item can arrive in the queue already tagged.
  const [urgency, setUrgency] = useState<string>('normal')
  // DEC-047 D-5: an ACTIVE birth state ("waiting on Bob" is real at capture
  // time). Terminal states stay with the closing verbs.
  const [birthState, setBirthState] = useState<string>('open')
  const [capTags, setCapTags] = useState<string[]>([])
  const [capMentions, setCapMentions] = useState<ItemMention[]>([])
  // DEC-040: notes are editable ON the preview. The chat's inline card and
  // every prefilled console open render the card directly — the console's
  // notes stage never appears on those paths, which is where the operator
  // "lost the ability to add a note". Card-typed notes are HIS words: both
  // Enter and "Enter as is" keep them.
  const [notesEdited, setNotesEdited] = useState(false)
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
    setUrgency('normal')
    setBirthState('open')
    setCapTags([])
    setCapMentions([])
    setNotesEdited(false)
    tidyPending.current = null
    // A MARKED object already knows what it is — the preset table decided,
    // so the classifier is skipped entirely (no latency, no model, works with
    // the key removed). Typed captures still classify.
    if (source?.intentClass) {
      // DEC-046: a marked SELECTION that is a LIST becomes several items —
      // deterministically (markers/indentation only; flattened lists split
      // as siblings; prose never splits) and always PREVIEWED here as the
      // pre-checked chips before anything files. Headers become primaries,
      // sub-bullets group under them via DEC-035's sibling grouping.
      const list = parseSelectionList(rawNotes.trim() || text)
      if (list && list.lines.length >= 2) {
        const [head, ...rest] = list.lines
        let lastPrimary = -1 // -1 = the head item
        setConfirm({
          picked: source.intentClass,
          confidence: 1,
          title: head.text.length > 120 ? `${head.text.slice(0, 117)}…` : head.text,
          notes: '',
          dueAt: null,
          needsDate: false,
          phrase: null,
          secondaries: rest.map((l, idx) => {
            const parentIdx = l.depth === 1 ? lastPrimary : undefined
            if (l.depth === 0) lastPrimary = idx
            return {
              text: l.text,
              intentClass: source.intentClass!,
              title: l.text.length > 120 ? `${l.text.slice(0, 117)}…` : l.text,
              dueAt: null,
              checked: true,
              parentIdx,
              listDerived: true
            }
          })
        })
        return () => {
          alive = false
        }
      }
      const markedTitle = text.length > 120 ? `${text.slice(0, 117)}…` : text
      setConfirm({
        picked: source.intentClass,
        confidence: 1,
        title: markedTitle,
        notes: normalizeSelectionText(rawNotes),
        dueAt: null,
        needsDate: false,
        phrase: null,
        secondaries: []
      })
      // DEC-046: a marked capture with SUBSTANTIAL prose notes (the chat
      // summary case) still gets the tidy — for its FORMATTING: the model
      // breaks a paragraph into bullet lines. The preset title stands; only
      // the notes land, and only if the operator has not edited them.
      const prose = normalizeSelectionText(rawNotes)
      if (prose.length >= 80) {
        const seq = ++cleanupSeq.current
        const tidy = window.api.workItems
          .proposeCleanup(markedTitle, prose)
          .then((p) => {
            if (alive && p && p.note && cleanupSeq.current === seq) {
              setCleanup({ title: markedTitle, note: p.note, originalTitle: markedTitle })
              setCleanupUsed(true)
              setConfirm((prev) =>
                prev && !notesEdited ? { ...prev, notes: p.note } : prev
              )
            }
            return p
          })
          .catch(() => null)
          .finally(() => {
            if (tidyPending.current === tidy) tidyPending.current = null
          })
        tidyPending.current = tidy
      }
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
                prev
                  ? {
                      ...prev,
                      title: p.title,
                      // Never overwrite notes the operator typed in the card —
                      // the tidy proposes; his words stand.
                      notes: notesEdited ? prev.notes : p.note || prev.notes
                    }
                  : prev
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
      // (extras counts the summary; the filing loop below walks the full
      // secondary list so parentIdx indexing stays stable.)
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
        ? // "Enter as is" reverts the AI's rewording — but notes typed in the
          // CARD are the operator's own words and stand on every path.
          (notesEdited ? confirm.notes : ownNotes) ||
          (typed === rawTitle ? undefined : typed)
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
        wiUrgency: urgency === 'normal' ? null : urgency,
        state: birthState === 'open' ? undefined : birthState,
        tags: serializeTags(capTags),
        mentions: serializeMentions(capMentions),
        confidence: confirm.confidence,
        approvalState: 'auto', // user-authored: submitting IS the approval
        sourceType: source?.sourceType ?? 'note',
        sourceRef: source?.sourceRef ?? null,
        wiOrigin: 'human'
      })
      // DEC-046: filing preserves the previewed structure. createdBySecIdx
      // maps each secondary's ORIGINAL index to its created id, so a child
      // groups under the item its header actually produced — and a child
      // whose header was UNCHECKED stands alone rather than vanishing.
      const createdBySecIdx = new Map<number, string>()
      for (const s of confirm.secondaries) {
        if (!s.checked) continue
        const idx = confirm.secondaries.indexOf(s)
        const parentId =
          s.parentIdx === undefined
            ? null
            : s.parentIdx === -1
              ? item.id
              : (createdBySecIdx.get(s.parentIdx) ?? null)
        const child = await createItem({
          title: s.title,
          notes: s.text.trim() === s.title ? undefined : s.text.trim(),
          parentId: deskCtx?.id ?? null,
          intentClass: s.listDerived ? confirm.picked : s.intentClass,
          dueAt: s.dueAt,
          confidence: s.listDerived ? 1 : 0.95,
          approvalState: 'auto',
          sourceType: s.listDerived ? (source?.sourceType ?? 'note') : 'note',
          sourceRef: s.listDerived ? (source?.sourceRef ?? null) : null,
          wiOrigin: 'human'
        })
        createdBySecIdx.set(idx, child.id)
        if (parentId) await updateFieldsStore(child.id, { groupId: parentId })
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
            <textarea
              value={confirm.notes}
              onChange={(e) => {
                setNotesEdited(true)
                setConfirm({ ...confirm, notes: e.target.value })
              }}
              onKeyDown={(e) => {
                // Enter here makes a NEWLINE; only ⌘/Ctrl+Enter bubbles up to
                // file. Without the stop, typing a note would file the item.
                if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.stopPropagation()
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation()
              }}
              rows={confirm.notes ? Math.min(5, confirm.notes.split('\n').length + 1) : 1}
              placeholder="Add notes — context worth keeping with it…"
              className="mt-1 w-full bg-transparent outline-none resize-y text-[12px] text-[var(--ink-60)] placeholder:text-[var(--ink-30)]"
            />
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
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-[var(--ink-40)] mr-1">Status</span>
        {CAPTURE_STATES.map((st) => (
          <button
            key={st}
            onClick={() => setBirthState(st)}
            className={`px-2 h-6 fb-t-label fb-press rounded-full ${
              birthState === st
                ? 'bg-[var(--surface-sunken)] text-[var(--ink-100)] shadow-[inset_0_0_0_1px_var(--edge-soft)]'
                : 'bg-[var(--surface-raised)] text-[var(--ink-50)] hover:text-[var(--ink-100)]'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
        <span className="text-[11px] text-[var(--ink-40)] ml-2 mr-1">Urgency</span>
        {URGENCY_LEVELS.map((u) => (
          <button
            key={u}
            onClick={() => setUrgency(u)}
            className={`px-2 h-6 fb-t-label fb-press rounded-full capitalize ${
              urgency === u
                ? 'bg-[rgb(var(--accent))] text-white'
                : 'bg-[var(--surface-raised)] text-[var(--ink-50)] hover:text-[var(--ink-100)]'
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      <div className="mt-1.5">
        <TagMentionInput
          tags={capTags}
          mentions={capMentions}
          onTags={setCapTags}
          onMentions={setCapMentions}
        />
      </div>
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
