import { useEffect, useRef, useState } from 'react'
import { useCaptureConsole } from '../stores/captureConsole'
import { useWorkItemStore } from '../stores/workItems'
import { useAssistantChrome } from '../stores/assistantChrome'
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
  // The at-most-one Q1 question, held between classify and create.
  const [clarify, setClarify] = useState<{
    phrase: string
    pending: { intentClass: string; confidence: number; title: string }
  } | null>(null)
  const [clarifyDate, setClarifyDate] = useState('')
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) {
      setText(initialText)
      setMode('routed')
      setError(null)
      setFiled(null)
      setFiledId(null)
      setClarify(null)
      setClarifyDate('')
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
    setClarify(null)
    // Long enough to read the class and hit "Wrong?" — corrections are the
    // trust mechanism, so the window stays open a beat.
    setTimeout(close, 4000)
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
        await file('loose_thought', 1, t.length > 120 ? `${t.slice(0, 117)}…` : t, null)
        return
      }
      const c = await window.api.workItems.classify(t)
      if (c.clarify) {
        // DEC-016 Q1: the one question — anchor the deadline or skip.
        setClarify({ phrase: c.clarify.phrase, pending: c })
        return
      }
      await file(c.intentClass, c.confidence, c.title, c.dueAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function resolveClarify(skip: boolean): Promise<void> {
    if (!clarify) return
    setBusy(true)
    try {
      const dueAt = !skip && clarifyDate ? new Date(`${clarifyDate}T17:00:00`).toISOString() : null
      await file(clarify.pending.intentClass, clarify.pending.confidence, clarify.pending.title, dueAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file that. Try again.')
    } finally {
      setBusy(false)
    }
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
          <div className="text-[14px] font-semibold text-[var(--ink-100)]">Capture</div>
          <div className="flex items-center gap-1">
            {modeBtn('routed', 'Routed', 'Plexii files it as the right work object')}
            {modeBtn('unrouted', 'Unrouted', 'No AI touch — saved verbatim as a loose thought')}
            {modeBtn('expand', 'Expand', 'Hand it to the assistant to develop')}
          </div>
        </div>
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
        {clarify && (
          <div className="mt-3 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-2.5">
            <div className="text-[12px] text-[var(--ink-70)]">
              When is “{clarify.phrase}”? One question, then it files.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={clarifyDate}
                onChange={(e) => setClarifyDate(e.target.value)}
                className="fb-field bg-[var(--surface-raised)] px-2 py-1 text-[12px]"
              />
              <button
                onClick={() => void resolveClarify(false)}
                disabled={busy || !clarifyDate}
                className="h-7 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
              >
                Set date
              </button>
              <button
                onClick={() => void resolveClarify(true)}
                disabled={busy}
                className="h-7 px-3 fb-t-label text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press"
              >
                No date
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
        {!clarify && (
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[11px] text-[var(--ink-30)]">⌘↵ to file · Esc to close</div>
            <button
              onClick={() => void submit()}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
            >
              {busy ? 'Filing…' : mode === 'expand' ? 'Open in assistant' : 'File it'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
