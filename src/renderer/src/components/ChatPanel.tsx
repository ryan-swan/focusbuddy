import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppliedProposal, ChatMessage } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useChatStore, appliedKey } from '../stores/chat'
import { deriveAssistantBlocks } from '../lib/chatBlocks'
import ChatBlockView from './focus/ChatBlockView'
import { useAssistantContext } from '../lib/assistantContext'
import { useWidgetStore } from '../stores/widgets'
import { chimeIn } from '../lib/audioBeep'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import { FLOATING_MENU_ASIDE, FLOATING_MENU_STYLE } from './chrome/floatingMenu'
import { useModelMode } from '../lib/modelPrefs'
import { useBodyDouble } from '../lib/bodyDouble'
import Icon from './Icon'

// Window for the "What was I doing?" lookback — last 30 minutes covers most context switches.
const TRAIL_LOOKBACK_MS = 30 * 60 * 1000

const EMPTY_MESSAGES: ChatMessage[] = []

interface Props {
  onCollapse?: () => void
}

export default function ChatPanel({ onCollapse }: Props = {}): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const send = useChatStore((s) => s.send)
  const sending = useChatStore((s) => s.sending)
  const hasApiKey = useChatStore((s) => s.hasApiKey)
  const checkApiKey = useChatStore((s) => s.checkApiKey)
  const messagesByTask = useChatStore((s) => s.messagesByTask)
  const proposalsByMessage = useChatStore((s) => s.proposalsByMessage)
  const appliedProposals = useChatStore((s) => s.appliedProposals)
  const markProposalApplied = useChatStore((s) => s.markProposalApplied)
  const consumeProposal = useChatStore((s) => s.consumeProposal)
  const clear = useChatStore((s) => s.clear)
  // The assistant is one panel that adapts to the current screen (desk / room /
  // doc / chat / meet / design / focused widget). ctx.key threads the
  // conversation per context; ctx.serverTaskId is the real task handed to the
  // server for task-scoped context (null off a desk).
  const ctx = useAssistantContext()
  const messages = useMemo(
    () => messagesByTask[ctx.key] ?? EMPTY_MESSAGES,
    [messagesByTask, ctx.key]
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

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    await send(ctx.serverTaskId, content, ctx.key)
  }

  return (
    // The assistant is a floating rounded card, the same chrome the desk
    // sidebar / segment / PlexiOffice menus use — not a panel welded to the
    // window edge with a one-sided border. See components/chrome/floatingMenu.
    // The wrapping column in App.tsx supplies the inset that detaches it.
    <aside
      className={FLOATING_MENU_ASIDE}
      style={FLOATING_MENU_STYLE}
      data-testid="assistant-panel"
    >
      <div className="px-3 py-3 border-b border-[var(--edge-soft)] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon name={ctx.icon} size={16} className="text-[var(--ink-70)]" />
            <h2 className="text-[13px] font-semibold tracking-tight text-[var(--ink-100)] uppercase">
              Assistant
            </h2>
          </div>
          <p className="text-[11px] text-[var(--ink-50)] truncate flex items-center gap-1.5">
            <span className="truncate" title={`Assistant is focused on ${ctx.label}${ctx.title ? ` — ${ctx.title}` : ''}`}>
              {ctx.label}
              {ctx.title ? ` · ${ctx.title}` : ''}
            </span>
            {/* Only surface the model when it is locked to something specific; in
                the default auto mode the chip is just noise in a narrow header. */}
            {modelMode !== 'auto' && (
              <span
                className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--ink-70)] shrink-0"
                title={`Locked to ${modelMode}. Change in Settings.`}
              >
                {modelMode}
              </span>
            )}
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
            <button onClick={() => clear(ctx.key)} className="icon-btn" title="Clear chat">
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
        <div className="m-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-xs text-[var(--ink-90)] leading-relaxed flex gap-2">
          <Icon name="key" size={16} className="text-amber-700 dark:text-amber-400 mt-0.5" />
          <div>
            <strong className="text-[var(--ink-100)]">No API key yet.</strong> Open{' '}
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
          <div className="mt-1 px-0.5">
            <p className="text-[12.5px] text-[var(--ink-50)] leading-relaxed mb-3">
              {ctx.intro} Try one of these to start:
            </p>
            <div className="space-y-1.5">
              {ctx.suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setDraft(s.text)}
                  data-testid="chat-suggestion"
                  className="w-full text-left text-[12.5px] px-3 py-2 rounded-lg border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:bg-[var(--surface-sunken)] transition-colors flex items-center gap-2"
                >
                  <Icon name={s.icon} size={14} className="text-accent shrink-0" />
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          // The user's own turn stays a plain bubble.
          if (m.role === 'user') {
            return (
              <div
                key={i}
                className="ml-auto max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 whitespace-pre-wrap"
              >
                {m.content}
              </div>
            )
          }
          // Each assistant turn renders as an ordered list of typed blocks
          // rather than one markdown lump: the reply text, then one block per
          // proposal — connector-branded (Gmail / Calendar / Message) when the
          // action maps to an integration. Blocks are derived on this side from
          // the existing {reply, actions} response, so the backend contract is
          // untouched. Same path the Focus chat already uses.
          const proposals = proposalsByMessage[String(m.ts)] ?? []
          const blocks = deriveAssistantBlocks(m, proposals)
          // Slice the composite-keyed applied-state down to THIS message,
          // re-keyed by plain proposalId, so ProposalCards stays store-shape
          // agnostic (the Focus chat passes the same shape).
          const appliedForMsg: Record<string, AppliedProposal> = {}
          for (const p of proposals) {
            const a = appliedProposals[appliedKey(m.ts, p.id)]
            if (a) appliedForMsg[p.id] = a
          }
          return (
            <div key={i} className="flex flex-col gap-1.5" data-testid="assistant-turn">
              {blocks.map((block, bi) => (
                <ChatBlockView
                  key={bi}
                  block={block}
                  activeTaskId={activeTaskId}
                  appliedProposals={appliedForMsg}
                  onApplied={(id, applied) => markProposalApplied(m.ts, id, applied)}
                  onConsumeProposal={(id) => consumeProposal(m.ts, id)}
                />
              ))}
            </div>
          )
        })}
        {sending && (
          <div className="bg-[var(--surface-raised)] text-[var(--ink-50)] text-sm italic rounded-xl px-3 py-2 border border-[var(--edge-soft)] w-fit flex items-center gap-1.5">
            <Icon name="more_horiz" size={16} />
            <span>thinking</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-[var(--edge-soft)]">
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
          placeholder={`${ctx.placeholder} (⌘⏎ to send)`}
          className="w-full resize-none bg-[var(--surface-raised)] text-[var(--ink-100)] border border-[var(--edge-firm)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--edge-firm)] focus:ring-2 focus:ring-[var(--edge-firm)]"
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
