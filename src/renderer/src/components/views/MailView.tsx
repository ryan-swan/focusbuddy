import { useEffect, useMemo, useState } from 'react'
import { useMailStore, selectMailUnread } from '../../stores/mail'
import { useViewStore } from '../../stores/view'
import type { MailAccountInput } from '@shared/types'
import Icon from '../Icon'
import ComposeDialog from '../ComposeDialog'
import EmailTaskDialog from '../mail/EmailTaskDialog'

// Mail — the IMAP email inbox. The user connects their own mailbox (Gmail,
// Outlook, iCloud, Fastmail, any IMAP host) and reads it here, inside the
// workspace, next to their tasks. No Google/Azure app registration is needed;
// it is plain IMAP with an app password, set up in under a minute. Any message
// can become a PlexiDesk task in one click.

interface Preset {
  label: string
  host: string
  port: number
  secure: boolean
  note?: string
}

// Common providers. The note nudges users toward an app-specific password,
// which is the single most common reason a first connection fails.
const PRESETS: Preset[] = [
  { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true, note: 'Needs an app password (Google account → Security → App passwords).' },
  { label: 'Outlook', host: 'outlook.office365.com', port: 993, secure: true },
  { label: 'iCloud', host: 'imap.mail.me.com', port: 993, secure: true, note: 'Needs an app-specific password from appleid.apple.com.' },
  { label: 'Fastmail', host: 'imap.fastmail.com', port: 993, secure: true, note: 'Needs an app password from Settings → Privacy & Security.' },
  { label: 'Yahoo', host: 'imap.mail.yahoo.com', port: 993, secure: true, note: 'Needs an app password from Account Security.' }
]

function fmtTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const thisYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' })
  })
}

// ── Setup form ──────────────────────────────────────────────────────────────
function SetupForm({ onConnected }: { onConnected: () => void }): JSX.Element {
  const account = useMailStore((s) => s.account)
  const save = useMailStore((s) => s.saveAccount)
  const test = useMailStore((s) => s.testAccount)

  const [email, setEmail] = useState(account?.email || account?.user || '')
  const [password, setPassword] = useState('')
  const [host, setHost] = useState(account?.host || '')
  const [port, setPort] = useState(account?.port || 993)
  const [secure, setSecure] = useState(account?.secure ?? true)
  const [advanced, setAdvanced] = useState(false)
  const [presetNote, setPresetNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'idle' | 'testing' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState(false)

  function applyPreset(p: Preset): void {
    setHost(p.host)
    setPort(p.port)
    setSecure(p.secure)
    setPresetNote(p.note ?? null)
    setTested(false)
  }

  function buildConfig(): MailAccountInput {
    return { host: host.trim(), port, secure, user: email.trim(), password, email: email.trim() }
  }

  const canSubmit = email.trim() && password && host.trim()

  async function onTest(): Promise<void> {
    setError(null)
    setBusy('testing')
    const r = await test(buildConfig())
    setBusy('idle')
    if (r.ok) {
      setTested(true)
    } else {
      setTested(false)
      setError(r.error ?? 'Connection failed.')
    }
  }

  async function onConnect(): Promise<void> {
    setError(null)
    setBusy('saving')
    const r = await save(buildConfig())
    setBusy('idle')
    if (r.ok) onConnected()
    else setError(r.error ?? 'Could not connect.')
  }

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm">
            <Icon name="mail" size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              Connect your email
            </h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Read your inbox here, next to your work. Plain IMAP, no Google or Microsoft sign-in
              required.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-5 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors ${
                host === p.host
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {presetNote && (
          <div className="mb-4 text-[12px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2 flex gap-2">
            <Icon name="info" size={14} className="shrink-0 mt-0.5" />
            <span>{presetNote}</span>
          </div>
        )}

        <label className="block text-[12px] font-medium text-stone-700 dark:text-stone-300 mb-1">
          Email address
        </label>
        <input
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setTested(false)
          }}
          placeholder="you@example.com"
          className="w-full mb-3 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        />

        <label className="block text-[12px] font-medium text-stone-700 dark:text-stone-300 mb-1">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setTested(false)
          }}
          placeholder="App password (recommended) or mailbox password"
          className="w-full mb-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        />
        <p className="text-[11px] text-stone-400 dark:text-stone-500 mb-3">
          Stored encrypted on this device with your OS keychain. It never leaves your machine.
        </p>

        <button
          onClick={() => setAdvanced((v) => !v)}
          className="text-[12px] text-stone-500 dark:text-stone-400 hover:text-accent inline-flex items-center gap-1 mb-2"
        >
          <Icon name={advanced ? 'expand_more' : 'chevron_right'} size={14} />
          IMAP server settings
        </button>

        {advanced && (
          <div className="mb-3 grid grid-cols-[1fr_88px] gap-2">
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">IMAP host</label>
              <input
                value={host}
                onChange={(e) => {
                  setHost(e.target.value)
                  setTested(false)
                }}
                placeholder="imap.example.com"
                className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => {
                  setPort(Number(e.target.value))
                  setTested(false)
                }}
                className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
              />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-[12px] text-stone-600 dark:text-stone-300">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => {
                  setSecure(e.target.checked)
                  setTested(false)
                }}
              />
              Use SSL/TLS (port 993). Uncheck for STARTTLS on 143.
            </label>
          </div>
        )}

        {!advanced && host && (
          <p className="text-[11px] text-stone-400 dark:text-stone-500 mb-3">
            Connecting to {host}:{port} {secure ? 'over SSL' : ''}
          </p>
        )}

        {error && (
          <div className="mb-3 text-[12px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => void onConnect()}
            disabled={!canSubmit || busy !== 'idle'}
            className="btn-primary"
          >
            {busy === 'saving' ? 'Connecting…' : 'Connect'}
          </button>
          <button
            onClick={() => void onTest()}
            disabled={!canSubmit || busy !== 'idle'}
            className="text-[13px] px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent disabled:opacity-50"
          >
            {busy === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          {tested && (
            <span className="text-[12px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <Icon name="check_circle" size={14} /> Connection works
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reading pane ─────────────────────────────────────────────────────────────
function ReadingPane(): JSX.Element {
  const open = useMailStore((s) => s.open)
  const loading = useMailStore((s) => s.loadingOpen)
  const startCompose = useMailStore((s) => s.startCompose)
  const replyToOpen = useMailStore((s) => s.replyToOpen)
  const replyDraft = useMailStore((s) => s.replyDraft)
  const loadingDraft = useMailStore((s) => s.loadingDraft)
  const suggestReply = useMailStore((s) => s.suggestReply)
  const [taskState, setTaskState] = useState<'idle' | 'making' | 'done'>('idle')
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [draftDismissed, setDraftDismissed] = useState(false)

  useEffect(() => {
    setTaskState('idle')
    setTaskError(null)
    setTaskDialogOpen(false)
    setDraftDismissed(false)
  }, [open?.uid])

  // Open the composer with the AI draft on top of the quoted original.
  function applyDraft(replyText: string): void {
    const seed = replyToOpen(false)
    startCompose({
      ...(seed ?? {}),
      text: `${replyText}\n${seed?.text ?? ''}`,
      aiDrafted: true
    })
  }

  if (loading && !open) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-stone-400">
        Loading message…
      </div>
    )
  }
  if (!open) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-stone-400 dark:text-stone-500">
        Select an email to read it.
      </div>
    )
  }

  // The "Make a task" button now opens a dialog (choose destination / new
  // folder, due date, urgency) instead of creating a bare top-level task.

  function forwardOpen(): void {
    if (!open) return
    const when = open.date ? new Date(open.date).toLocaleString() : ''
    const header = `---------- Forwarded message ----------\nFrom: ${open.fromName} <${open.fromAddress}>\nDate: ${when}\nSubject: ${open.subject}\n\n`
    startCompose({
      subject: /^fwd:/i.test(open.subject) ? open.subject : `Fwd: ${open.subject}`,
      text: `\n\n${header}${open.text}`
    })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-5 pt-4 pb-3 border-b border-stone-200 dark:border-stone-800">
        <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-100 mb-1">
          {open.subject}
        </h2>
        <div className="flex items-center gap-2 text-[12px] text-stone-500 dark:text-stone-400">
          <span className="font-medium text-stone-700 dark:text-stone-300">{open.fromName}</span>
          {open.fromAddress && <span className="text-stone-400">&lt;{open.fromAddress}&gt;</span>}
          <span className="ml-auto">{fmtTime(open.date)}</span>
        </div>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <button
            onClick={() => startCompose(replyToOpen(false) ?? undefined)}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent inline-flex items-center gap-1.5"
          >
            <Icon name="reply" size={13} />
            Reply
          </button>
          <button
            onClick={() => startCompose(replyToOpen(true) ?? undefined)}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent inline-flex items-center gap-1.5"
          >
            <Icon name="reply_all" size={13} />
            Reply all
          </button>
          <button
            onClick={forwardOpen}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent inline-flex items-center gap-1.5"
          >
            <Icon name="forward" size={13} />
            Forward
          </button>
          <button
            onClick={() => setTaskDialogOpen(true)}
            data-testid="mail-make-task"
            className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-accent inline-flex items-center gap-1.5"
          >
            <Icon name={taskState === 'done' ? 'check' : 'add_task'} size={13} />
            {taskState === 'done' ? 'Task created' : 'Make a task'}
          </button>
          {open.attachments.length > 0 && (
            <span className="text-[12px] text-stone-500 dark:text-stone-400 inline-flex items-center gap-1">
              <Icon name="attach_file" size={13} />
              {open.attachments.length} attachment{open.attachments.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {taskError && (
          <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{taskError}</div>
        )}
      </div>

      {!draftDismissed && (loadingDraft || replyDraft) && (
        <div className="border-b border-stone-200 dark:border-stone-800 px-5 py-3 bg-violet-50/50 dark:bg-violet-950/10">
          {loadingDraft ? (
            <div className="flex items-center gap-2 text-[12px] text-violet-700 dark:text-violet-300">
              <Icon name="auto_awesome" size={14} className="animate-pulse" />
              Drafting a reply in your voice…
            </div>
          ) : replyDraft?.ok && replyDraft.reply ? (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon name="auto_awesome" size={14} className="text-violet-600 dark:text-violet-400" />
                <span className="text-[11px] uppercase tracking-wider font-medium text-violet-700 dark:text-violet-300">
                  Suggested reply
                </span>
                {typeof replyDraft.confidence === 'number' && (
                  <span className="text-[10px] text-stone-400">
                    {Math.round(replyDraft.confidence * 100)}% confident
                  </span>
                )}
              </div>
              <p className="text-[13px] text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto">
                {replyDraft.reply}
              </p>
              {replyDraft.note && (
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 italic">
                  {replyDraft.note}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => applyDraft(replyDraft.reply as string)}
                  className="text-[12px] px-2.5 py-1 rounded-lg bg-accent text-white hover:brightness-110 inline-flex items-center gap-1.5"
                >
                  <Icon name="edit" size={13} />
                  Edit and send
                </button>
                <button
                  onClick={() => open && void suggestReply(open)}
                  className="text-[12px] px-2 py-1 rounded-lg text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                >
                  Redraft
                </button>
                <button
                  onClick={() => setDraftDismissed(true)}
                  className="ml-auto text-[12px] px-2 py-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : replyDraft?.skip ? (
            <div className="flex items-center gap-2 text-[12px] text-stone-500 dark:text-stone-400">
              <Icon name="auto_awesome" size={13} />
              <span>AI saw no reply needed{replyDraft.skipReason ? ` — ${replyDraft.skipReason}` : ''}.</span>
              <button
                onClick={() => setDraftDismissed(true)}
                className="ml-auto text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ) : replyDraft?.needsApiKey ? (
            <div className="text-[12px] text-stone-500 dark:text-stone-400">
              Add an Anthropic API key in Settings to get AI reply suggestions.
            </div>
          ) : replyDraft?.error ? (
            <div className="flex items-center gap-2 text-[12px] text-stone-500 dark:text-stone-400">
              <span>Could not draft a reply. {replyDraft.error}</span>
              <button
                onClick={() => open && void suggestReply(open)}
                className="text-accent hover:underline"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {open.html ? (
          // Sandboxed: scripts are disabled, so a message can render its own
          // styles and images but cannot run code or reach the app.
          <iframe
            title="Email body"
            sandbox=""
            srcDoc={open.html}
            className="w-full h-full bg-white"
          />
        ) : (
          <pre className="px-5 py-4 text-[13px] text-stone-800 dark:text-stone-200 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {open.text || '(This message has no text body.)'}
          </pre>
        )}
      </div>

      {open.attachments.length > 0 && (
        <div className="border-t border-stone-200 dark:border-stone-800 px-5 py-2.5 flex flex-wrap gap-2">
          {open.attachments.map((a, i) => (
            <span
              key={i}
              className="text-[11px] inline-flex items-center gap-1 rounded-md border border-stone-200 dark:border-stone-700 px-2 py-1 text-stone-600 dark:text-stone-300"
            >
              <Icon name="description" size={12} />
              {a.filename}
            </span>
          ))}
        </div>
      )}
      {taskDialogOpen && open && (
        <EmailTaskDialog
          email={{ subject: open.subject, fromName: open.fromName, fromAddress: open.fromAddress, text: open.text }}
          onClose={() => setTaskDialogOpen(false)}
          onCreated={() => {
            setTaskState('done')
            setTaskDialogOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function MailView(): JSX.Element {
  const view = useViewStore((s) => s.view)
  const account = useMailStore((s) => s.account)
  const loaded = useMailStore((s) => s.loadedAccount)
  const messages = useMailStore((s) => s.messages)
  const openUid = useMailStore((s) => s.openUid)
  const loadingList = useMailStore((s) => s.loadingList)
  const error = useMailStore((s) => s.error)
  const unread = useMailStore(selectMailUnread)
  const loadAccount = useMailStore((s) => s.loadAccount)
  const refresh = useMailStore((s) => s.refresh)
  const openMessage = useMailStore((s) => s.openMessage)
  const disconnect = useMailStore((s) => s.disconnect)
  const composing = useMailStore((s) => s.composing)
  const startCompose = useMailStore((s) => s.startCompose)
  const closeCompose = useMailStore((s) => s.closeCompose)

  const [reconfiguring, setReconfiguring] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // First mount: learn whether an account is connected.
  useEffect(() => {
    if (!loaded) void loadAccount()
  }, [loaded, loadAccount])

  // Honour a deep link from the Inbox feed (open a specific email).
  const deepUid = view.kind === 'mail' ? view.openUid : undefined
  useEffect(() => {
    if (deepUid && account) void openMessage(deepUid)
  }, [deepUid, account, openMessage])

  const sorted = useMemo(() => messages, [messages])

  if (loaded && !account) {
    return <SetupForm onConnected={() => undefined} />
  }
  if (reconfiguring) {
    return <SetupForm onConnected={() => setReconfiguring(false)} />
  }

  return (
    <div className="h-full flex desk-paper no-tod">
      {/* List */}
      <div className="w-80 shrink-0 border-r border-stone-200 dark:border-stone-800 flex flex-col">
        <div className="px-3 py-3 flex items-center gap-2 border-b border-stone-100 dark:border-stone-800/60">
          <Icon name="mail" size={16} className="text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
              Mail{unread > 0 ? ` · ${unread} unread` : ''}
            </h1>
            <p className="text-[11px] text-stone-400 dark:text-stone-500 truncate">
              {account?.email}
            </p>
          </div>
          <button
            onClick={() => startCompose()}
            className="icon-btn"
            title="Compose a new message"
          >
            <Icon name="edit_square" size={15} />
          </button>
          <button onClick={() => void refresh()} className="icon-btn" title="Refresh">
            <Icon name="refresh" size={15} className={loadingList ? 'animate-spin' : ''} />
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="icon-btn" title="Account">
              <Icon name="more_vert" size={15} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1 text-[12px]"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setReconfiguring(true)
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200"
                >
                  Account settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    void disconnect()
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-red-600 dark:text-red-400"
                >
                  Disconnect mailbox
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {error && (
            <div className="m-2 text-[12px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {sorted.length === 0 && !loadingList ? (
            <p className="text-[12px] text-stone-500 dark:text-stone-400 px-3 py-4">
              {error ? 'Could not load your inbox.' : 'No messages.'}
            </p>
          ) : (
            sorted.map((m) => (
              <button
                key={m.uid}
                onClick={() => void openMessage(m.uid)}
                className={`w-full text-left px-3 py-2.5 border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800/50 transition-colors ${
                  m.uid === openUid ? 'bg-accent/[0.06]' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {!m.seen && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                  <span
                    className={`text-[13px] truncate flex-1 ${
                      m.seen
                        ? 'text-stone-600 dark:text-stone-300'
                        : 'font-semibold text-stone-900 dark:text-stone-100'
                    }`}
                  >
                    {m.fromName}
                  </span>
                  {m.hasAttachments && (
                    <Icon name="attach_file" size={12} className="text-stone-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-stone-400 shrink-0">{fmtTime(m.date)}</span>
                </div>
                <div
                  className={`text-[12px] truncate mt-0.5 ${
                    m.seen
                      ? 'text-stone-500 dark:text-stone-400'
                      : 'text-stone-700 dark:text-stone-200'
                  }`}
                >
                  {m.subject}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <ReadingPane />

      {composing && (
        <ComposeDialog initial={composing} onClose={closeCompose} onSent={() => void refresh()} />
      )}
    </div>
  )
}
