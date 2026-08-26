import { useEffect, useRef, useState } from 'react'
import { useCaptureConsole } from '../stores/captureConsole'
import { useWorkItemStore } from '../stores/workItems'
import { useAssistantChrome } from '../stores/assistantChrome'
import { useViewStore } from '../stores/view'
import { useNodeStore } from '../stores/nodes'
import { deskCaptureContext } from '../lib/captureContext'
import { promptText } from './plexi/PromptDialog'
import Icon from './Icon'

const CLASS_CHOICES = [
  { value: 'action', label: 'Task', hint: 'Something to do' },
  { value: 'review', label: 'Review', hint: 'Needs judgment or sign-off' },
  { value: 'scheduling', label: 'Scheduling', hint: 'Time and calendar' },
  { value: 'fyi', label: 'FYI', hint: 'Worth knowing' },
  { value: 'acknowledgment', label: 'Acknowledgment', hint: 'Needs only receipt' },
  { value: 'discussion', label: 'Discussion', hint: 'Talk it through live' },
  { value: 'loose_thought', label: 'Loose thought', hint: 'Idle capture, may fade' }
]

// The capture console (Attention S5, SPEC-007–013). One box, three modes:
//   Routed   — the classifier files the text as the right work object
//              (deterministic hard rules first; model only for ambiguity;
//              loose-thought floor — a capture is never lost or blocked).
//   Unrouted — no AI touch at all: filed verbatim as a loose thought.
//   Expand   — hands the text to the assistant panel (the existing
//              chat-to-desk promotion path formalized).
// The composer owns DEC-016's ONE clarifying question: an unanchored deadline
// phrase on an actionable class asks for a date once — never more, never for
// anything else. House dialog shell (fb-scrim / fb-card / fb-field).

type Mode = 'routed' | 'unrouted' | 'expand'

const CLASS_LABEL: Record<string, string> = {
  action: 'Task',
  review: 'Review',
  scheduling: 'Scheduling',
  fyi: 'FYI',
  acknowledgment: 'Acknowledgment',
  discussion: 'Discussion',
  loose_thought: 'Loose thought',
  direct: 'Message'
}

export default function CaptureConsole(): JSX.Element | null {
  const open = useCaptureConsole((s) => s.open)
  const initialText = useCaptureConsole((s) => s.initialText)
  const close = useCaptureConsole((s) => s.close)
  const createItem = useWorkItemStore((s) => s.create)
  const openAssistant = useAssistantChrome((s) => s.openPanel)

  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('routed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filed, setFiled] = useState<string | null>(null)
  const [filedId, setFiledId] = useState<string | null>(null)
  // DEC-019(b): routed capture ALWAYS stops at ONE confirmation screen — the
  // classifier's pick pre-highlighted (Enter = confirm), any other class one
  // click or arrow away, and the deadline question inline on the same screen
  // when an unanchored phrase triggered it. One stop, never more.
  const [confirm, setConfirm] = useState<{
    picked: string
    confidence: number
    title: string
    dueAt: string | null
    needsDate: boolean
    phrase: string | null
  } | null>(null)
  const [confirmDate, setConfirmDate] = useState('')
  // V2 (DEC-023): when the console opens over a desk view, the capture files
  // ONTO that desk (origin lens + detach semantics). Clearable with one ✕ —
  // then it files standalone like before. Snapshot at open time, so
  // navigation underneath never re-targets a capture mid-thought.
  const [deskCtx, setDeskCtx] = useState<{ id: string; title: string } | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) {
      setText(initialText)
      setMode('routed')
      setError(null)
      setFiled(null)
      setFiledId(null)
      setConfirm(null)
      setConfirmDate('')
      setDeskCtx(
        deskCaptureContext(useViewStore.getState().view, useNodeStore.getState().nodes)
      )
      setTimeout(() => fieldRef.current?.focus(), 0)
    }
  }, [open, initialText])

  if (!open) return null

  async function file(
    intentClass: string,
    confidence: number,
    title: string,
    dueAt: string | null
  ): Promise<void> {
    const item = await createItem({
      title,
      notes: text.trim() === title ? undefined : text.trim(),
      parentId: deskCtx?.id ?? null,
      intentClass,
      dueAt,
      confidence,
      approvalState: 'auto', // user-authored: submitting IS the approval
      sourceType: 'note',
      wiOrigin: 'human'
    })
    setFiled(`${CLASS_LABEL[intentClass] ?? intentClass} — “${item.title}”`)
    setFiledId(item.id)
    setText('')
    setConfirm(null)
    // The class was confirmed on-screen; a short beat to see it land, plus the
    // belt-and-braces reclassify link.
    setTimeout(close, 2500)
  }

  async function reclassifyFiled(): Promise<void> {
    if (!filedId) return
    const next = await promptText({
      title: 'Reclassify',
      label: 'Where does it belong?',
      choices: CLASS_CHOICES
    })
    if (next) {
      await useWorkItemStore.getState().reclassify(filedId, next)
      setFiled(`${CLASS_LABEL[next] ?? next} — moved`)
      setTimeout(close, 900)
    }
  }

  async function submit(): Promise<void> {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'expand') {
        // Formalized chat-to-desk promotion — the house path the suggestion
        // rows use: land on the CHAT tab, open the panel, stage the text in
        // the composer WITHOUT sending (fb:composer-stage). The second
        // dispatch covers a panel that had to mount first.
        useAssistantChrome.getState().setTab('chat')
        openAssistant()
        window.dispatchEvent(new CustomEvent('fb:composer-stage', { detail: t }))
        setTimeout(
          () => window.dispatchEvent(new CustomEvent('fb:composer-stage', { detail: t })),
          400
        )
        close()
        return
      }
      if (mode === 'unrouted') {
        // No AI touch by contract — verbatim, no confirmation stop.
        await file('loose_thought', 1, t.length > 120 ? `${t.slice(0, 117)}…` : t, null)
        return
      }
      // DEC-019(b): classify, then ALWAYS confirm — pre-highlighted, one Enter.
      const c = await window.api.workItems.classify(t)
      setConfirm({
        picked: c.intentClass,
        confidence: c.confidence,
        title: c.title,
        dueAt: c.dueAt,
        needsDate: c.clarify != null,
        phrase: c.clarify?.phrase ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file that. Try again.')
    } finally {
      setBusy(false)
    }
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
      await file(confirm.picked, confirm.confidence, confirm.title, dueAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function cycleClass(dir: 1 | -1): void {
    if (!confirm) return
    const idx = CLASS_CHOICES.findIndex((c) => c.value === confirm.picked)
    const next = CLASS_CHOICES[(idx + dir + CLASS_CHOICES.length) % CLASS_CHOICES.length]
    setConfirm({ ...confirm, picked: next.value })
  }

  const modeBtn = (m: Mode, label: string, hint: string): JSX.Element => (
    <button
      key={m}
      onClick={() => setMode(m)}
      title={hint}
      className={`px-2.5 h-7 fb-t-label fb-press rounded-[var(--radius-field)] ${
        mode === m
          ? 'bg-[var(--surface-sunken)] text-[var(--ink-100)]'
          : 'text-[var(--ink-50)] hover:text-[var(--ink-100)]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fb-scrim fixed inset-0 z-[300] flex items-start justify-center pt-[18vh]"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Capture"
        onMouseDown={(e) => e.stopPropagation()}
        className="fb-card w-[min(560px,92vw)] p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-[14px] font-semibold text-[var(--ink-100)]">Attention</div>
            <button
              onClick={() => {
                useViewStore.getState().goAttention()
                close()
              }}
              className="text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press"
              title="Open the Attention page"
            >
              Open page →
            </button>
          </div>
          <div className="flex items-center gap-1">
            {modeBtn('routed', 'Routed', 'Plexii files it as the right work object')}
            {modeBtn('unrouted', 'Unrouted', 'No AI touch — saved verbatim as a loose thought')}
            {modeBtn('expand', 'Expand', 'Hand it to the assistant to develop')}
          </div>
        </div>
        {deskCtx && mode !== 'expand' && (
          <div className="mt-2 inline-flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-full bg-[var(--surface-sunken)] fb-t-caption text-[var(--ink-70)]">
            <Icon name="desk" size={12} className="text-[var(--ink-40)]" />
            <span className="truncate max-w-[220px]">on {deskCtx.title}</span>
            <button
              onClick={() => setDeskCtx(null)}
              title="File standalone instead"
              className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--surface-raised)] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press"
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        )}
        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
            if (e.key === 'Escape') close()
          }}
          placeholder={
            mode === 'unrouted'
              ? 'Saved exactly as typed…'
              : 'Remind me to… / Review the… / Schedule a… / fyi:…'
          }
          rows={3}
          className="fb-field mt-3 w-full bg-[var(--surface-raised)] px-3 py-2 text-[13px] resize-y"
        />
        {confirm && (
          <div
            className="mt-3 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-2.5"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') cycleClass(1)
              if (e.key === 'ArrowLeft') cycleClass(-1)
              if (e.key === 'Enter') void fileConfirmed()
            }}
          >
            <div className="text-[12px] text-[var(--ink-70)]">
              File as <strong>{CLASS_LABEL[confirm.picked]}</strong>? Enter confirms — or pick
              another.
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
                onClick={() => setConfirm(null)}
                className="text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press"
              >
                ← Edit text
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
        )}
        {error && <div className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</div>}
        {filed && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-70)]">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check_circle" size={14} /> Filed to Attention · {filed}
            </span>
            {filedId && (
              <button
                onClick={() => void reclassifyFiled()}
                className="text-[var(--ink-40)] hover:text-[var(--ink-100)] underline underline-offset-2 fb-press"
              >
                Wrong? Reclassify
              </button>
            )}
          </div>
        )}
        {!confirm && (
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[11px] text-[var(--ink-30)]">⌘↵ to file · Esc to close</div>
            <button
              onClick={() => void submit()}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
            >
              {busy
                ? 'Working…'
                : mode === 'expand'
                  ? 'Open in assistant'
                  : mode === 'unrouted'
                    ? 'File it'
                    : 'Classify'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
