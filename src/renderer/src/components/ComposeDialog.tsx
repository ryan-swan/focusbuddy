import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMailStore, type ComposeInitial } from '../stores/mail'
import Icon from './Icon'
import Modal from './plexi/Modal'
import { useNoticeStore } from '../stores/notice'

// Compose / reply window for the user's own mailbox. One component serves new
// mail, reply, reply-all and forward — the caller just seeds the fields and the
// optional threading headers. Sends through the same account the user reads
// with (SMTP derived from their IMAP host in the main process). Portalled into
// document.body so the canvas stacking contexts can't trap it. The seed shape
// (ComposeInitial) lives in the mail store.

interface Props {
  initial?: ComposeInitial
  onClose: () => void
  onSent?: () => void
}

// Split a free-typed recipients field into clean addresses. People paste lists
// separated by commas, semicolons, spaces or newlines, so accept all of them.
function parseAddresses(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ComposeDialog({ initial, onClose, onSent }: Props): JSX.Element {
  const send = useMailStore((s) => s.send)
  const fromAddress = useMailStore((s) => s.account?.email || s.account?.user || '')

  const [to, setTo] = useState((initial?.to ?? []).join(', '))
  const [cc, setCc] = useState((initial?.cc ?? []).join(', '))
  const [bcc, setBcc] = useState((initial?.bcc ?? []).join(', '))
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [body, setBody] = useState(initial?.text ?? '')
  // Reveal Cc/Bcc only when there is something to show or the user asks — keeps
  // the common case (a quick reply) uncluttered.
  const [showCc, setShowCc] = useState(
    (initial?.cc?.length ?? 0) > 0 || (initial?.bcc?.length ?? 0) > 0
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // DEC-091 — the recipient stop (operator ruling: "recipient confirmation").
  // The first Send validates and ARMS: the footer states exactly who will
  // receive it and the button asks for the second press. Editing any field
  // disarms. Mail has no undo — the one honest moment to catch a wrong
  // address is BEFORE the wire, so the stop lives there.
  const [armed, setArmed] = useState(false)

  // Escape and backdrop close are handled by the Modal wrapper (guarded below so
  // a send in flight is not interrupted). This listener only carries the
  // Cmd/Ctrl+Enter send shortcut, the universal mail shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleSend()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, to, cc, bcc, subject, body])

  async function handleSend(): Promise<void> {
    if (busy) return
    const toList = parseAddresses(to)
    const ccList = parseAddresses(cc)
    const bccList = parseAddresses(bcc)
    if (toList.length === 0) {
      setError('Add at least one recipient in the To field.')
      return
    }
    const bad = [...toList, ...ccList, ...bccList].find((a) => !EMAIL_RE.test(a))
    if (bad) {
      setError(`That does not look like an email address: ${bad}`)
      return
    }
    // First press arms; the second, with the recipients stated, sends.
    if (!armed) {
      setArmed(true)
      setError(null)
      return
    }
    setBusy(true)
    setError(null)
    const r = await send({
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject,
      text: body,
      inReplyTo: initial?.inReplyTo ?? null,
      references: initial?.references ?? []
    })
    if (r.ok) {
      // DEC-091 — send-state feedback: the dialog used to just vanish on
      // success, which read as "did that go?". The notice states the fact.
      const extra = ccList.length + bccList.length
      useNoticeStore.getState().show({
        text: `Sent to ${toList.join(', ')}${extra ? ` (+${extra} cc/bcc)` : ''}`,
        icon: 'send'
      })
      onSent?.()
      onClose()
      return
    }
    setError(r.error ?? 'Sending failed — nothing left your mailbox.')
    setBusy(false)
  }

  /** Any edit to who gets it (or what they get) disarms the confirm. */
  function disarm(): void {
    if (armed) setArmed(false)
  }

  const inputCls =
    'fb-card w-full text-[13px] px-2.5 py-1.5 text-[var(--ink-100)] focus:border-accent'

  return createPortal(
    <Modal
      onClose={() => {
        if (!busy) onClose()
      }}
      label={initial?.subject?.toLowerCase().startsWith('re:') ? 'Reply' : 'New message'}
      z={260}
      className="fb-card w-[560px] max-w-[92vw] max-h-[88vh] flex flex-col"
    >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--edge-soft)]">
          <Icon name="edit" size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-[var(--ink-100)]">
            {initial?.subject?.toLowerCase().startsWith('re:') ? 'Reply' : 'New message'}
          </h2>
          <span className="ml-auto text-[11px] text-[var(--ink-40)] truncate max-w-[240px]">
            from {fromAddress}
          </span>
        </div>

        <div className="p-4 space-y-2 overflow-auto">
          {initial?.aiDrafted && (
            <div className="flex items-start gap-2 rounded-md border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/20 px-2.5 py-1.5 text-[11px] text-violet-800 dark:text-violet-300">
              <Icon name="auto_awesome" size={13} className="mt-0.5 shrink-0" />
              <span>
                Drafted by AI in your voice. Read it over and edit anything before you send.
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="w-10 text-[11px] uppercase tracking-wider text-[var(--ink-50)] shrink-0">
              To
            </label>
            <input
              autoFocus
              value={to}
              onChange={(e) => { disarm(); setTo(e.target.value) }}
              placeholder="name@example.com"
              className={inputCls}
            />
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-[11px] text-[var(--ink-50)] hover:text-[var(--ink-70)] shrink-0"
              >
                Cc/Bcc
              </button>
            )}
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-10 text-[11px] uppercase tracking-wider text-[var(--ink-50)] shrink-0">
                  Cc
                </label>
                <input value={cc} onChange={(e) => { disarm(); setCc(e.target.value) }} className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-10 text-[11px] uppercase tracking-wider text-[var(--ink-50)] shrink-0">
                  Bcc
                </label>
                <input value={bcc} onChange={(e) => { disarm(); setBcc(e.target.value) }} className={inputCls} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <label className="w-10 text-[11px] uppercase tracking-wider text-[var(--ink-50)] shrink-0">
              Subj
            </label>
            <input
              value={subject}
              onChange={(e) => { disarm(); setSubject(e.target.value) }}
              placeholder="Subject"
              className={inputCls}
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => { disarm(); setBody(e.target.value) }}
            rows={12}
            placeholder="Write your message…"
            className="fb-field w-full text-[13px] px-2.5 py-2 bg-[var(--surface-raised)] text-[var(--ink-100)] resize-none leading-relaxed"
          />
          {error && <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>}
        </div>

        {armed && !busy && (
          <div
            data-testid="send-confirm-strip"
            className="mx-4 mb-1 rounded-md bg-accent/10 border border-accent/40 px-2.5 py-1.5 text-[11.5px] text-[var(--ink-90)]"
          >
            Sending to{' '}
            <span className="font-semibold">{parseAddresses(to).join(', ')}</span>
            {parseAddresses(cc).length > 0 && <> · cc {parseAddresses(cc).join(', ')}</>}
            {parseAddresses(bcc).length > 0 && <> · bcc {parseAddresses(bcc).join(', ')}</>}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--edge-soft)]">
          <button
            onClick={() => void handleSend()}
            disabled={busy}
            data-testid="mail-send"
            className="text-[13px] px-4 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Icon name={busy ? 'hourglass_top' : 'send'} size={14} />
            {busy ? 'Sending…' : armed ? 'Confirm send' : 'Send'}
          </button>
          <span className="text-[10px] text-[var(--ink-40)]">
            {armed ? '⌘↵ again to confirm' : '⌘↵ to send'}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            className="ml-auto text-[13px] px-3 py-1.5 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            Discard
          </button>
        </div>
    </Modal>,
    document.body
  )
}
