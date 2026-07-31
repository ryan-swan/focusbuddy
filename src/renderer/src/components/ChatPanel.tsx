import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppliedProposal, ChatMessage, ChatSource } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { targetForSource } from '../lib/sourceTarget'
import { useChatStore, appliedKey } from '../stores/chat'
import { deriveAssistantBlocks } from '../lib/chatBlocks'
import ChatBlockView from './focus/ChatBlockView'
import RetrievalTrace from './assistant/RetrievalTrace'
import QuestionCard from './assistant/QuestionCard'
import { activeQuestionFor } from '../lib/assistantQuestion'
import { useAssistantContext } from '../lib/assistantContext'
import { useWidgetStore } from '../stores/widgets'
import { chimeIn } from '../lib/audioBeep'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import { FLOATING_MENU_ASIDE, FLOATING_MENU_STYLE } from './chrome/floatingMenu'
import { useModelMode } from '../lib/modelPrefs'
import { useBodyDouble } from '../lib/bodyDouble'
import { useAssistantChrome, type AssistantMode } from '../stores/assistantChrome'
import Icon from './Icon'

// The three display modes, in Notion's order and with Notion's labels. The
// header's mode button shows the current mode's icon; the dropdown lists all
// three with a check on the active one.
const MODE_OPTIONS: Array<{ mode: AssistantMode; label: string; icon: string }> = [
  { mode: 'sidebar', label: 'Sidebar', icon: 'vertical_split' },
  { mode: 'floating', label: 'Floating', icon: 'picture_in_picture_alt' },
  { mode: 'fullscreen', label: 'Full screen', icon: 'fullscreen' }
]

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
  const sourcesByMessage = useChatStore((s) => s.sourcesByMessage)
  const liveTraceByThread = useChatStore((s) => s.liveTraceByThread)
  const traceByMessage = useChatStore((s) => s.traceByMessage)
  const traceDisclosureByMessage = useChatStore((s) => s.traceDisclosureByMessage)
  const setTraceDisclosure = useChatStore((s) => s.setTraceDisclosure)
  const questionByMessage = useChatStore((s) => s.questionByMessage)
  const dismissQuestion = useChatStore((s) => s.dismissQuestion)
  const markProposalApplied = useChatStore((s) => s.markProposalApplied)
  const consumeProposal = useChatStore((s) => s.consumeProposal)
  const rewindTo = useChatStore((s) => s.rewindTo)
  const clear = useChatStore((s) => s.clear)
  // The assistant is one panel that adapts to the current screen (desk / room /
  // doc / chat / meet / design / focused widget). ctx.key threads the
  // conversation per context; ctx.serverTaskId is the real task handed to the
  // server for task-scoped context (null off a desk).
  const ctx = useAssistantContext()
  // The conversation on screen. Normally the current screen's, but a thread
  // pinned by following a citation keeps its place until the user picks this
  // page instead — otherwise the assistant sends you somewhere and then loses
  // the conversation that sent you, which makes its own links unusable.
  const pinnedThread = useChatStore((s) => s.pinnedThread)
  const unpinThread = useChatStore((s) => s.unpinThread)
  const pinThread = useChatStore((s) => s.pinThread)
  // The clicked-to-pin primary reference (Phase 3a.1). Shown only on the
  // thread it was pinned to; lifecycle (auto-pin on widget click, clear on
  // thread switch / widget deletion) runs in useAssistantWidgetPin, mounted by
  // AssistantOverlay. This panel just renders the chip and its ×.
  const pinnedWidget = useChatStore((s) => s.pinnedWidget)
  const unpinWidget = useChatStore((s) => s.unpinWidget)
  const thread = pinnedThread ?? {
    key: ctx.key,
    label: ctx.label,
    title: ctx.title,
    icon: ctx.icon,
    serverTaskId: ctx.serverTaskId
  }
  const followingElsewhere = pinnedThread !== null && pinnedThread.key !== ctx.key
  const activePin = pinnedWidget && pinnedWidget.threadKey === thread.key ? pinnedWidget : null
  const messages = useMemo(
    () => messagesByTask[thread.key] ?? EMPTY_MESSAGES,
    [messagesByTask, thread.key]
  )
  // The trace for the send currently in flight on THIS thread. Scoped by
  // the active thread, not by the global `sending` flag, so a request started in another
  // context can't draw its progress here.
  const liveTrace = liveTraceByThread[thread.key]
  // The follow-up question that is live for the displayed thread, if any —
  // attached to the last message and neither answered nor dismissed. Derived
  // by a pure, tested rule (lib/assistantQuestion).
  const activeQuestion = activeQuestionFor(messages, questionByMessage)
  const [draft, setDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  // Which turn most recently had its text copied — drives the ✓ confirmation on
  // the copy button, then clears itself.
  const [copiedTs, setCopiedTs] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const createWidget = useWidgetStore((s) => s.create)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const pushAssistantMessage = useChatStore((s) => s.pushAssistantMessage)
  const [modelMode] = useModelMode()
  const bodyDouble = useBodyDouble()
  // Display mode (sidebar / floating / fullscreen) — chrome state, not
  // conversation state. Switching re-dresses this same panel over the same
  // thread; the AssistantOverlay wrapper does the actual re-containering.
  const chromeMode = useAssistantChrome((s) => s.mode)
  const setChromeMode = useAssistantChrome((s) => s.setMode)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!modeMenuOpen) return
    function onPointerDown(e: PointerEvent): void {
      if (!modeMenuRef.current?.contains(e.target as Node)) setModeMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [modeMenuOpen])
  const activeModeMeta =
    MODE_OPTIONS.find((o) => o.mode === chromeMode) ?? MODE_OPTIONS[1]

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

  // Grow the composer with its content instead of pinning it to a fixed 3 rows.
  // Reset to auto first so it shrinks back when text is deleted; the max-height
  // in the class caps it and hands over to scrolling.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    await send(thread.serverTaskId, content, thread.key)
  }

  // Open the thing a citation points at.
  //
  // Where it goes is decided by targetForSource (pure, tested); this only
  // performs it. Two of the five kinds need a lookup first: a source names a
  // widget or a table, not the desk it sits on, so the canvas has to be resolved
  // before we can navigate to it. Routing matches PlexiSearchView's openHit, so
  // a citation and a search result for the same thing land in the same place.
  async function openSource(source: ChatSource): Promise<void> {
    const target = targetForSource(source)
    if (!target) return
    // Following a citation is the assistant moving you, not you changing screen.
    // Pin the conversation first so it survives the navigation — otherwise the
    // panel re-threads to wherever it just sent you and the thread that produced
    // the link is gone.
    pinThread(thread)
    const view = useViewStore.getState()
    const openDesk = (taskId: string): void => {
      useNodeStore.getState().setActive(taskId)
      view.goTask(taskId)
    }
    switch (target.kind) {
      case 'document':
        view.goDocument(target.documentId)
        break
      case 'knowledge':
        view.goKnowledge(target.entryId)
        break
      case 'desk':
        openDesk(target.taskId)
        break
      case 'widget': {
        // widgets.get is newer than the rest of this bridge, so an Electron
        // process still running an older preload won't have it. Say so rather
        // than throwing a TypeError into a click handler — a silent dead link is
        // exactly the kind of thing that costs an hour to track down.
        if (typeof window.api.widgets.get !== 'function') {
          console.warn(
            '[assistant] window.api.widgets.get is missing, so a cited widget cannot be ' +
              'resolved to its desk. Restart the Electron process (npm run dev) to pick up ' +
              'the current preload bundle.'
          )
          return
        }
        const widget = await window.api.widgets.get(target.widgetId)
        if (!widget?.taskId) return
        openDesk(widget.taskId)
        // Select it so the desk opens with the cited widget picked out rather
        // than leaving you to find it among everything else on the canvas.
        useWidgetStore.getState().setSelection([target.widgetId])
        break
      }
      case 'table': {
        const table = await window.api.tables.get(target.tableId)
        if (!table?.taskId) return
        openDesk(table.taskId)
        break
      }
    }
  }

  async function copyTurn(content: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(content)
      const stamp = Date.now()
      setCopiedTs(stamp)
      // Clear the ✓ only if nothing else has been copied since.
      setTimeout(() => setCopiedTs((c) => (c === stamp ? null : c)), 1600)
    } catch {
      /* clipboard can be denied; failing to copy is not worth an error state */
    }
  }

  // Regenerate an assistant turn: drop it (and anything after) and re-send the
  // user message that produced it. Getting a bad answer should not mean
  // retyping the question.
  async function retryFrom(assistantIndex: number): Promise<void> {
    if (sending) return
    // Walk back to the user turn that produced this answer.
    let userIndex = -1
    for (let k = assistantIndex - 1; k >= 0; k--) {
      if (messages[k].role === 'user') {
        userIndex = k
        break
      }
    }
    if (userIndex < 0) return
    const question = messages[userIndex].content
    // Rewind to just before that question, then re-send it, so the request is
    // rebuilt with exactly the history it had the first time.
    rewindTo(thread.key, userIndex)
    await send(thread.serverTaskId, question, thread.key)
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
          {/* Sentence case, not shouted. The uppercase treatment made a 13px
              label read as a system banner rather than a product surface. */}
          <div className="flex items-center gap-1.5">
            <Icon name={thread.icon} size={15} className="text-[var(--ink-70)]" />
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink-100)]">
              Assistant
            </h2>
          </div>
          <p
            className="text-[10.5px] text-[var(--ink-50)] truncate"
            title={`Assistant is focused on ${thread.label}${thread.title ? ` — ${thread.title}` : ''}`}
          >
            {thread.title ? `${thread.title} · ` : ''}
            {thread.label}
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
            <button onClick={() => clear(thread.key)} className="icon-btn" title="Clear chat">
              <Icon name="delete_sweep" size={16} />
            </button>
          )}
          {/* Display mode — Notion's ⌄ menu: Sidebar / Floating / Full screen,
              check on the active one. Chrome only; the conversation persists
              across switches. */}
          <div className="relative" ref={modeMenuRef}>
            <button
              onClick={() => setModeMenuOpen((v) => !v)}
              className="icon-btn"
              title={`Display mode — ${activeModeMeta.label}`}
              aria-label="Display mode"
              aria-expanded={modeMenuOpen}
              data-testid="assistant-mode-toggle"
            >
              <Icon name={activeModeMeta.icon} size={16} />
            </button>
            {modeMenuOpen && (
              <div
                data-testid="assistant-mode-menu"
                className="absolute right-0 top-full mt-1.5 z-30 min-w-[172px] rounded-[12px] border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-1"
                style={{ boxShadow: 'var(--shadow-cast)' }}
              >
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => {
                      setChromeMode(opt.mode)
                      setModeMenuOpen(false)
                    }}
                    data-testid={`assistant-mode-${opt.mode}`}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Icon name={opt.icon} size={15} className="text-[var(--ink-60)]" />
                    <span className="flex-1 text-left">{opt.label}</span>
                    {opt.mode === chromeMode && (
                      <Icon name="check" size={14} className="text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="icon-btn"
              title="Minimize to pill"
              aria-label="Minimize to pill"
              data-testid="assistant-minimize"
            >
              <Icon name="remove" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Why this panel is showing a conversation that isn't this page's, and
          the way back. Without it a pinned thread is indistinguishable from the
          assistant simply ignoring where you are. */}
      {followingElsewhere && (
        <div
          data-testid="assistant-pinned-banner"
          className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--edge-soft)] px-2 py-1"
        >
          <Icon name="push_pin" size={12} className="text-accent shrink-0" filled />
          <span className="text-[10.5px] text-[var(--ink-70)] truncate flex-1 min-w-0">
            Still on your {thread.label} conversation
          </span>
          <button
            onClick={unpinThread}
            data-testid="assistant-unpin"
            className="text-[10.5px] text-accent hover:underline shrink-0"
            title={`Switch to the assistant for ${ctx.label}`}
          >
            Switch to {ctx.label}
          </button>
        </div>
      )}

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
          // Notion-mirror empty state: avatar, "How can I help you today?",
          // the per-screen intro, then iconed suggestion ROWS — the reference
          // layout. (The earlier wrap-chips predate the mirror direction.)
          // Content still comes from ctx per screen — no curated static list,
          // no invented "New" badges (plan D4).
          <div className="mt-2 px-1 flex flex-col" data-testid="assistant-empty-state">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-100)] mb-1">
              How can I help you today?
            </h3>
            <p className="text-[11.5px] text-[var(--ink-60)] leading-relaxed mb-4">{ctx.intro}</p>
            <div className="flex flex-col -mx-1">
              {ctx.suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setDraft(s.text)}
                  data-testid="chat-suggestion"
                  className="flex items-center gap-2.5 text-left text-[12.5px] px-2 py-2 rounded-lg text-[var(--ink-80)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Icon name={s.icon} size={15} className="text-accent shrink-0" />
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          // The user's turn is a quiet accent-tinted block, built from tokens so
          // it follows every theme. It used to be hardcoded stone-900/stone-100
          // — the one element in the panel that ignored the token system and so
          // stayed the same slab under futuristic and atelier.
          if (m.role === 'user') {
            return (
              <div
                key={i}
                data-testid="user-turn"
                className="ml-auto max-w-[88%] rounded-xl rounded-br-[3px] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap bg-[rgb(var(--accent)/0.10)] border border-[rgb(var(--accent)/0.18)] text-[var(--ink-100)]"
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
          const sources = sourcesByMessage[String(m.ts)] ?? []
          const blocks = deriveAssistantBlocks(m, proposals, sources)
          // The sources this turn actually cites, read back off the derived
          // blocks rather than recomputed — so an inline [n] resolves to exactly
          // the chip below it, and the two can't disagree about what was cited.
          const citedSources =
            blocks.find((b): b is Extract<typeof b, { kind: 'sources' }> => b.kind === 'sources')
              ?.sources ?? []
          // Slice the composite-keyed applied-state down to THIS message,
          // re-keyed by plain proposalId, so ProposalCards stays store-shape
          // agnostic (the Focus chat passes the same shape).
          const appliedForMsg: Record<string, AppliedProposal> = {}
          for (const p of proposals) {
            const a = appliedProposals[appliedKey(m.ts, p.id)]
            if (a) appliedForMsg[p.id] = a
          }
          const finishedTrace = traceByMessage[String(m.ts)]
          return (
            <div key={i} className="group/turn flex flex-col gap-1.5" data-testid="assistant-turn">
              {/* Identity row. With the prose unbubbled, this is what marks the
                  speaker — the research is explicit that sender must not be
                  carried by colour alone. */}
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-[5px] grid place-items-center bg-accent/15 text-accent shrink-0">
                  <Icon name="auto_awesome" size={10} filled />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.09em] text-[var(--ink-50)]">
                  Plexi
                </span>
              </div>
              {/* What produced this answer, above it — collapsed to a single
                  summary line once it has been read, absent entirely when
                  retrieval found nothing and no action was prepared. */}
              {finishedTrace && (
                <RetrievalTrace
                  trace={finishedTrace}
                  disclosure={traceDisclosureByMessage[String(m.ts)]}
                  onDisclosureChange={(state) => setTraceDisclosure(m.ts, state)}
                  onOpenSource={(s) => void openSource(s)}
                />
              )}
              {blocks.map((block, bi) => (
                <ChatBlockView
                  key={bi}
                  block={block}
                  activeTaskId={activeTaskId}
                  appliedProposals={appliedForMsg}
                  onApplied={(id, applied) => markProposalApplied(m.ts, id, applied)}
                  onConsumeProposal={(id) => consumeProposal(m.ts, id)}
                  onOpenSource={(s) => void openSource(s)}
                  citedSources={citedSources}
                />
              ))}
              {/* Per-turn actions. Always present — they were hover-only, which
                  meant you had to already know they were there and land the
                  pointer on the prose to find them. They sit at low contrast and
                  come up to full on hover, so the thread stays calm without the
                  controls being a secret. */}
              <div className="flex items-center gap-0.5 opacity-55 group-hover/turn:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  onClick={() => void copyTurn(m.content)}
                  title="Copy this reply"
                  className="icon-btn !h-6 !w-6"
                  data-testid="turn-copy"
                >
                  <Icon name={copiedTs === m.ts ? 'check' : 'content_copy'} size={12} />
                </button>
                <button
                  onClick={() => void retryFrom(i)}
                  disabled={sending}
                  title="Ask again — regenerate this reply"
                  className="icon-btn !h-6 !w-6"
                  data-testid="turn-retry"
                >
                  <Icon name="refresh" size={12} />
                </button>
              </div>
            </div>
          )
        })}
        {/* While a send is in flight the trace IS the pending indicator: it says
            what is actually happening instead of a generic "Working…". The dots
            remain for the non-streaming path, which reports nothing until it
            returns and so has nothing truer to show. */}
        {sending && liveTrace && (
          <RetrievalTrace trace={liveTrace} onOpenSource={(s) => void openSource(s)} />
        )}
        {sending && !liveTrace && (
          <div className="flex items-center gap-1.5 text-[var(--ink-50)]" data-testid="chat-pending">
            <span className="flex gap-[3px]" aria-hidden="true">
              <span className="w-1 h-1 rounded-full bg-current fb-dot" />
              <span className="w-1 h-1 rounded-full bg-current fb-dot" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-current fb-dot" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="text-[11.5px]">Working…</span>
          </div>
        )}
      </div>

      {/* The composer is one container that holds the field AND its actions,
          rather than a bare textarea with a detached Send button underneath.
          The whole box carries the focus ring, so it reads as a single control. */}
      <form onSubmit={handleSend} className="p-3 border-t border-[var(--edge-soft)]">
        {/* The assistant's follow-up question, when it asked one, sits directly
            above the composer — pick an option and Send, or just type below
            (any send on this thread is the answer). */}
        {activeQuestion && (
          <QuestionCard
            question={activeQuestion.question}
            disabled={sending}
            onDismiss={() => dismissQuestion(activeQuestion.messageTs)}
            onAnswer={(option) => {
              if (sending) return
              void send(thread.serverTaskId, option, thread.key)
            }}
          />
        )}
        <div className="rounded-[13px] border border-[var(--edge-firm)] bg-[var(--surface-raised)] px-2.5 pt-2 pb-1.5 flex flex-col gap-2 transition-shadow focus-within:border-[rgb(var(--accent)/0.55)] focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.13)]">
          {/* Context chip — names the surface this conversation is scoped to,
              restated at the point of typing (Notion's 📄-chip pattern). Same
              fact as the header subtitle; in floating and fullscreen modes the
              header is far from the composer. While a widget is pinned as the
              primary reference (click-to-pin, 3a.1), the pin chip replaces it —
              the pin is the sharper statement of what this conversation is
              about, and it renders exactly what will ride the next request. */}
          <div>
            {activePin ? (
              <span
                data-testid="composer-pin-chip"
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.10)] px-2 py-0.5 text-[10px] text-[var(--ink-80)]"
                title={`Pinned as the primary reference: ${activePin.title}. The assistant reads it first on every message in this conversation.`}
              >
                <Icon name="push_pin" size={11} filled className="shrink-0 text-accent" />
                <Icon name={activePin.icon} size={11} className="shrink-0" />
                <span className="truncate">{activePin.title}</span>
                <button
                  type="button"
                  onClick={unpinWidget}
                  aria-label={`Unpin ${activePin.title}`}
                  title="Unpin — back to the whole surface"
                  data-testid="composer-pin-clear"
                  className="shrink-0 grid place-items-center rounded-full hover:text-[var(--ink-100)] transition-colors"
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ) : (
              <span
                data-testid="composer-context-chip"
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] text-[var(--ink-60)]"
                title={`This conversation is scoped to ${thread.title || thread.label}`}
              >
                <Icon name={thread.icon} size={11} className="shrink-0" />
                <span className="truncate">{thread.title || thread.label}</span>
              </span>
            )}
          </div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a newline — the convention every
              // comparable panel uses. ⌘/Ctrl+Enter still works for muscle memory.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend(e as unknown as React.FormEvent)
              }
            }}
            rows={1}
            placeholder={ctx.placeholder}
            data-testid="chat-composer"
            className="w-full resize-none bg-transparent text-[var(--ink-100)] placeholder:text-[var(--ink-50)] text-[13px] leading-[1.45] max-h-[160px] focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            {modelMode !== 'auto' && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[var(--edge-soft)] px-2 py-0.5 text-[10px] font-mono text-[var(--ink-60)]"
                title={`Locked to ${modelMode}. Change in Settings.`}
              >
                {modelMode}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              title="Send"
              aria-label="Send"
              className="w-[26px] h-[26px] rounded-full grid place-items-center shrink-0 transition-colors bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] disabled:bg-[var(--surface-sunken)] disabled:text-[var(--ink-40)] disabled:border disabled:border-[var(--edge-soft)]"
            >
              <Icon name="arrow_upward" size={14} />
            </button>
          </div>
        </div>
        <div className="flex justify-end mt-1.5">
          <span className="text-[9.5px] font-mono text-[var(--ink-40)]">
            ↵ send · ⇧↵ newline
          </span>
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
