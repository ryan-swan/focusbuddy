import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ActionProposal, ChatMessage } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useChatStore } from '../stores/chat'
import { useWidgetStore } from '../stores/widgets'
import { useActionHistory } from '../stores/actionHistory'
import { chimeIn } from '../lib/audioBeep'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import { useModelMode, AUTO_ROUTING_DISPLAY } from '../lib/modelPrefs'
import { useBodyDouble } from '../lib/bodyDouble'
import { applyProposal, describeProposal } from '../lib/actionExecutor'
import Icon from './Icon'

// Window for the "What was I doing?" lookback — last 30 minutes covers most context switches.
const TRAIL_LOOKBACK_MS = 30 * 60 * 1000

const EMPTY_MESSAGES: ChatMessage[] = []

interface Props {
  onCollapse?: () => void
}

export default function ChatPanel({ onCollapse }: Props = {}): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const nodes = useNodeStore((s) => s.nodes)
  const send = useChatStore((s) => s.send)
  const sending = useChatStore((s) => s.sending)
  const hasApiKey = useChatStore((s) => s.hasApiKey)
  const checkApiKey = useChatStore((s) => s.checkApiKey)
  const messagesByTask = useChatStore((s) => s.messagesByTask)
  const proposalsByMessage = useChatStore((s) => s.proposalsByMessage)
  const consumeProposal = useChatStore((s) => s.consumeProposal)
  const clear = useChatStore((s) => s.clear)
  const messages = useMemo(
    () => messagesByTask[activeTaskId ?? '__global__'] ?? EMPTY_MESSAGES,
    [messagesByTask, activeTaskId]
  )
  const [draft, setDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const createWidget = useWidgetStore((s) => s.create)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const pushAssistantMessage = useChatStore((s) => s.pushAssistantMessage)
  const [modelMode] = useModelMode()
  const bodyDouble = useBodyDouble()

  async function handleWhatWasIDoing(): Promise<void> {
    if (summarizing) return
    if (hasApiKey === false) {
      pushAssistantMessage(
        activeTaskId,
        'Open Settings → AI · API keys and paste your Anthropic API key to use "What was I doing?".'
      )
      return
    }
    setSummarizing(true)
    const sinceMs = Date.now() - TRAIL_LOOKBACK_MS
    const result = await window.api.trail.summarize(activeTaskId, sinceMs)
    setSummarizing(false)
    if (result.ok && result.summary) {
      const stamp = result.eventCount
        ? `_(from ${result.eventCount} events in the last 30 min)_\n\n`
        : ''
      pushAssistantMessage(activeTaskId, `${stamp}${result.summary}`)
    } else {
      pushAssistantMessage(
        activeTaskId,
        result.error ?? "Couldn't summarize — try again in a moment."
      )
    }
  }
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    selection: string
  } | null>(null)

  async function saveSelection(kind: 'sticky' | 'note', text: string): Promise<void> {
    if (!activeTaskId) {
      alert('Pick a task first — the saved note attaches to whichever task is on the desk.')
      return
    }
    const trimmed = text.trim()
    if (!trimmed) return
    // Place near the canvas origin with a small random jitter so multiple saves don't overlap exactly.
    const jitterX = Math.floor(Math.random() * 40)
    const jitterY = Math.floor(Math.random() * 40)
    await createWidget({
      taskId: activeTaskId,
      kind,
      title: kind === 'sticky' ? '' : 'From assistant',
      content: trimmed,
      x: 80 + jitterX,
      y: 80 + jitterY,
      width: kind === 'sticky' ? 240 : 360,
      height: kind === 'sticky' ? 200 : 280,
      color: kind === 'sticky' ? '#fef08a' : null
    })
    chimeIn()
    bumpLayout()
    // Drop the browser selection so the right-click feels resolved
    window.getSelection()?.removeAllRanges()
  }

  function handleMessagesContextMenu(e: React.MouseEvent): void {
    const selection = window.getSelection()?.toString() ?? ''
    if (!selection.trim()) return // let the default browser menu show (or nothing)
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, selection })
  }

  function ctxMenuItems(): CtxMenuItem[] {
    if (!ctxMenu) return []
    const text = ctxMenu.selection
    const noTask = !activeTaskId
    return [
      {
        label: 'Save selection as sticky',
        icon: 'sticky_note_2',
        disabled: noTask,
        onClick: () => void saveSelection('sticky', text)
      },
      {
        label: 'Save selection as note',
        icon: 'description',
        disabled: noTask,
        onClick: () => void saveSelection('note', text)
      },
      { separator: true },
      {
        label: 'Copy',
        icon: 'content_copy',
        onClick: () => void navigator.clipboard?.writeText(text)
      }
    ]
  }

  useEffect(() => {
    void checkApiKey()
  }, [checkApiKey])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, sending])

  const activeTask = activeTaskId ? nodes.find((n) => n.id === activeTaskId) ?? null : null

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    await send(activeTaskId, content)
  }

  return (
    <aside className="h-full flex flex-col fb-glass-chrome border-l border-[color:var(--glass-chrome-border)]">
      <div className="px-3 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon name="smart_toy" size={16} className="text-stone-600 dark:text-stone-400" />
            <h2 className="text-[13px] font-semibold tracking-tight text-stone-900 dark:text-stone-100 uppercase">
              Assistant
            </h2>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate flex items-center gap-1.5">
            <span className="truncate">
              {activeTask ? activeTask.title : 'no task selected'}
            </span>
            <span
              className="font-mono text-[9px] px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 shrink-0"
              title={
                modelMode === 'auto'
                  ? `Auto — chat uses ${AUTO_ROUTING_DISPLAY.chat.model}, trail summaries use ${AUTO_ROUTING_DISPLAY.trail_summary.model}. Change in Settings.`
                  : `Locked to ${modelMode}. Change in Settings.`
              }
            >
              {modelMode === 'auto' ? 'auto' : modelMode}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={bodyDouble.toggle}
            className={`icon-btn relative ${bodyDouble.enabled ? '!text-accent' : ''}`}
            title={
              bodyDouble.enabled
                ? `Body double ON — quiet check-in every ~10 min (next in ~${bodyDouble.minutesUntilNext ?? '?'} min). Click to turn off.`
                : 'Body double OFF — turn on for a quiet AI presence sitting beside you while you work'
            }
          >
            <Icon
              name={bodyDouble.enabled ? 'group' : 'group_off'}
              size={16}
              filled={bodyDouble.enabled}
            />
            {bodyDouble.enabled && (
              <span
                className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                aria-label="active"
              />
            )}
          </button>
          <button
            onClick={handleWhatWasIDoing}
            disabled={summarizing}
            className="icon-btn"
            title={
              summarizing
                ? 'Reading the trail…'
                : 'What was I doing? — replay the last 30 minutes as a narrative'
            }
          >
            <Icon
              name={summarizing ? 'hourglass_top' : 'replay'}
              size={16}
              className={summarizing ? 'animate-spin' : ''}
            />
          </button>
          {messages.length > 0 && (
            <button onClick={() => clear(activeTaskId)} className="icon-btn" title="Clear chat">
              <Icon name="delete_sweep" size={16} />
            </button>
          )}
          {onCollapse && (
            <button onClick={onCollapse} className="icon-btn" title="Hide assistant panel">
              <Icon name="keyboard_double_arrow_right" size={16} />
            </button>
          )}
        </div>
      </div>

      {hasApiKey === false && (
        <div className="m-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-xs text-stone-800 dark:text-stone-200 leading-relaxed flex gap-2">
          <Icon name="key" size={16} className="text-amber-700 dark:text-amber-400 mt-0.5" />
          <div>
            <strong className="text-stone-900 dark:text-stone-100">No API key yet.</strong> Open{' '}
            <strong>Settings → AI · API keys</strong> and paste your Anthropic API key.
            It's encrypted with your system keychain and only this Mac can read it.
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onContextMenu={handleMessagesContextMenu}
        className="flex-1 overflow-auto px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 text-center leading-relaxed">
            Ask anything about your task — research, plan, break it down, draft text.<br/>
            <span className="text-stone-400 dark:text-stone-500">The assistant sees the active task.</span>
          </p>
        )}
        {messages.map((m, i) => {
          // Per-message proposals: rendered as cards below the assistant bubble.
          // Cards are individually clickable to apply or dismiss; an "apply all"
          // shortcut runs every remaining proposal in one click.
          const proposalsForMsg =
            m.role === 'assistant' ? proposalsByMessage[String(m.ts)] : undefined
          return (
            <div key={i} className="flex flex-col gap-1.5">
              <div
                className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 whitespace-pre-wrap'
                    : 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 md-rendered'
                }`}
              >
                {m.role === 'assistant' ? (
                  // Rich text rendering: headings, lists, bold, code, links,
                  // tables (GFM). The `md-rendered` class above provides the
                  // typography styles (same as MarkdownWidget). Select+copy
                  // preserves formatting when pasted into Notion/Docs.
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children, ...rest }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...rest}
                        >
                          {children}
                        </a>
                      )
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
              {proposalsForMsg && proposalsForMsg.length > 0 && (
                <ProposalCards
                  proposals={proposalsForMsg}
                  messageTs={m.ts}
                  activeTaskId={activeTaskId}
                  onConsume={(id) => consumeProposal(m.ts, id)}
                />
              )}
            </div>
          )
        })}
        {sending && (
          <div className="bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-sm italic rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-700 w-fit flex items-center gap-1.5">
            <Icon name="more_horiz" size={16} />
            <span>thinking</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-stone-200 dark:border-stone-700">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend(e as unknown as React.FormEvent)
            }
          }}
          rows={3}
          placeholder="Ask the assistant… (⌘⏎ to send)"
          className="w-full resize-none bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
        />
        <div className="flex justify-end mt-2">
          <button type="submit" disabled={!draft.trim() || sending} className="btn-primary">
            <Icon name="send" size={14} />
            <span>Send</span>
          </button>
        </div>
      </form>
      {ctxMenu && (
        <CanvasContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </aside>
  )
}

// ── Inline action-proposal cards ────────────────────────────────────────────
//
// Each ActionProposal renders as a clickable card with apply / dismiss
// affordances. On apply, the executor mutates the workspace; on success the
// card flashes a confirmation chip + the proposal disappears from the list.
// Multiple cards can be applied in sequence; an "apply all" runs them.

interface ProposalCardsProps {
  proposals: ActionProposal[]
  messageTs: number
  activeTaskId: string | null
  onConsume: (proposalId: string) => void
}

function ProposalCards({
  proposals,
  activeTaskId,
  onConsume
}: ProposalCardsProps): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  )

  // resolvedIds threads newly-created entity ids (today: tables) through a
  // batch so a follow-up proposal (today: add-table-row) can reference what
  // an earlier one created via "$<proposalId>" symbolic refs. Held in a ref
  // so a per-card click survives outside of a single applyAll() loop —
  // without this, clicking Apply on an add-table-row card after manually
  // applying its parent create-table card would still fail because the
  // resolution map was local to applyAll's stack frame.
  const batchResolvedIds = useRef<Map<string, string>>(new Map())

  // Detect "I depend on a proposal that hasn't been applied yet" cases.
  // When the user clicks Apply on a single dependent card (e.g. an
  // add-table-row pointing at $tbl-1), we look up the parent in the
  // current proposals array and run it first, threading the resolved id
  // into the batch map so the child's apply succeeds. Today only
  // add-table-row → create-table exists; the helper is structured so
  // new dependent kinds slot in by adding a case to the switch.
  async function ensureDependencies(
    p: ActionProposal,
    resolvedIds: Map<string, string>
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (p.kind === 'add-table-row' && p.tableId.startsWith('$')) {
      const refKey = p.tableId.slice(1)
      if (resolvedIds.has(refKey)) return { ok: true }
      const parent = proposals.find(
        (x) => x.id === refKey && x.kind === 'create-table'
      )
      if (!parent) {
        return {
          ok: false,
          message:
            'Row references a table that was never proposed alongside it — try regenerating the request.'
        }
      }
      const parentResult = await applyProposal(parent, { activeTaskId, resolvedIds })
      if (!parentResult.ok) {
        return {
          ok: false,
          message: `Couldn't auto-create parent table: ${parentResult.message}`
        }
      }
      // Parent landed — drop it from the visible list too so the user
      // doesn't see a duplicate "create table" card sitting around.
      onConsume(parent.id)
    }
    return { ok: true }
  }

  async function applyOne(
    p: ActionProposal,
    resolvedIds?: Map<string, string>
  ): Promise<void> {
    if (busy) return
    const ids = resolvedIds ?? batchResolvedIds.current
    setBusy(p.id)
    const dep = await ensureDependencies(p, ids)
    if (!dep.ok) {
      setBusy(null)
      setToast({ id: p.id, ok: false, message: dep.message })
      setTimeout(() => setToast((t) => (t?.id === p.id ? null : t)), 2800)
      return
    }
    const result = await applyProposal(p, { activeTaskId, resolvedIds: ids })
    setBusy(null)
    setToast({ id: p.id, ok: result.ok, message: result.message })
    // Only remove from the list if it succeeded. Failures stay so the user
    // can read the message + try again.
    if (result.ok) onConsume(p.id)
    // Auto-dismiss the toast — bottom-right chip behaviour, ~2s.
    setTimeout(() => setToast((t) => (t?.id === p.id ? null : t)), 2200)
  }

  async function applyAll(): Promise<void> {
    if (busy) return
    // Confirm before a batch that destroys anything — undo exists as a backstop,
    // but a one-click bulk delete deserves a heads-up.
    const destructive = proposals.filter((p) => p.kind === 'delete-widget')
    if (destructive.length > 0) {
      const ok = window.confirm(
        `This will delete ${destructive.length} item${destructive.length > 1 ? 's' : ''} from your canvas. You can undo it afterwards. Apply all ${proposals.length} change${proposals.length > 1 ? 's' : ''}?`
      )
      if (!ok) return
    }
    const resolvedIds = batchResolvedIds.current
    // Coalesce the whole batch into one undo entry, so a single Cmd-Z (or the
    // toast's Undo) reverses the entire "Apply all".
    useActionHistory.getState().beginBatch()
    try {
      for (const p of proposals) {
        // Sequential so error messages from one don't get clobbered by the
        // next, AND so symbolic-id refs resolve in order (create-table must
        // run before its add-table-row siblings).
        await applyOne(p, resolvedIds)
      }
    } finally {
      useActionHistory
        .getState()
        .endBatch(`Apply ${proposals.length} AI change${proposals.length > 1 ? 's' : ''}`)
    }
  }

  return (
    <div className="ml-0 mr-auto max-w-[92%] flex flex-col gap-1">
      {proposals.map((p) => {
        const desc = describeProposal(p)
        const isBusy = busy === p.id
        const showToast = toast?.id === p.id
        return (
          <button
            key={p.id}
            onClick={() => void applyOne(p)}
            disabled={isBusy}
            className="text-left rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/60 hover:border-accent hover:bg-accent/5 px-2.5 py-1.5 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-md inline-flex items-center justify-center bg-accent/10 text-accent shrink-0">
                <Icon name={desc.icon} size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {desc.verb}
                </div>
                <div className="text-[12px] font-medium text-stone-900 dark:text-stone-100 truncate">
                  {desc.subject}
                </div>
                {p.reason && (
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">
                    {p.reason}
                  </div>
                )}
                {showToast && (
                  <div
                    className={`text-[10px] mt-1 ${
                      toast.ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {toast.ok ? '✓ ' : '⚠ '}
                    {toast.message}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isBusy && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      onConsume(p.id)
                    }}
                    title="Dismiss this suggestion"
                    role="button"
                    className="icon-btn !h-5 !w-5"
                  >
                    <Icon name="close" size={11} />
                  </span>
                )}
                <span className="text-[10px] text-accent font-medium px-1">
                  {isBusy ? '…' : 'apply'}
                </span>
              </div>
            </div>
          </button>
        )
      })}
      {proposals.length > 1 && (
        <button
          onClick={() => void applyAll()}
          disabled={busy !== null}
          className="text-[11px] text-accent self-start px-1.5 py-0.5 hover:underline disabled:opacity-50"
        >
          Apply all {proposals.length}
        </button>
      )}
    </div>
  )
}
