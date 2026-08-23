import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppliedProposal, ChatMessage, ChatSource } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { targetForSource } from '../lib/sourceTarget'
import { useChatStore, appliedKey, NEW_CHAT_KEY } from '../stores/chat'
import { useFileManagerStore } from '../stores/fileManager'
import MentionComposer from './assistant/MentionComposer'
import MentionRefRow from './assistant/MentionRefRow'
import ConversationList from './assistant/ConversationList'
import { activeMentions, type MentionRef } from '../lib/assistantMentions'
import { docToInput, splitMentionText } from '../lib/mentionDoc'
import { usePeopleStore } from '../lib/peopleDirectory'
import { deriveAssistantBlocks } from '../lib/chatBlocks'
import ChatBlockView from './focus/ChatBlockView'
import RetrievalTrace from './assistant/RetrievalTrace'
import StreamingProse from './assistant/StreamingProse'
import { cascadeDurationMs } from '../lib/traceView'
import { useWebPanel } from '../stores/webPanel'
import { useDocumentsStore } from '../stores/documents'
import { composerOmniIntents, searchUrl, type OmniIntent, type OmniTarget } from '../lib/omniIntent'
import QuestionCard from './assistant/QuestionCard'
import { activeQuestionFor } from '../lib/assistantQuestion'
import { useAssistantContext } from '../lib/assistantContext'
import { useWidgetStore } from '../stores/widgets'
import { chimeIn } from '../lib/audioBeep'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import { FLOATING_MENU_ASIDE, FLOATING_MENU_STYLE } from './chrome/floatingMenu'
import ModelPickerChip from './assistant/ModelPickerChip'
import { ASSISTANT_CAPABILITIES } from '../lib/assistantCapabilities'
import { useBodyDouble } from '../lib/bodyDouble'
import { useAssistantChrome, type AssistantMode } from '../stores/assistantChrome'
import {
  PUSH_TO_DESK_MESSAGE,
  TURN_INTO_DESK_MESSAGE
} from '../lib/conversationDesks'
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
  // The Plexii hub renders this same panel as a real page in the main pane
  // (view.kind 'plexii'). Page mode forces the fullscreen layout regardless of
  // the overlay's chrome mode and drops the display-mode menu — a page is a
  // place you navigated to, not a dressing you switch.
  page?: boolean
}

export default function ChatPanel({ onCollapse, page }: Props = {}): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const nodes = useNodeStore((s) => s.nodes)
  const send = useChatStore((s) => s.send)
  const sending = useChatStore((s) => s.sending)
  const cancelSend = useChatStore((s) => s.cancelSend)
  const hasApiKey = useChatStore((s) => s.hasApiKey)
  const checkApiKey = useChatStore((s) => s.checkApiKey)
  const messagesByTask = useChatStore((s) => s.messagesByTask)
  const proposalsByMessage = useChatStore((s) => s.proposalsByMessage)
  const appliedProposals = useChatStore((s) => s.appliedProposals)
  const sourcesByMessage = useChatStore((s) => s.sourcesByMessage)
  const blocksByMessage = useChatStore((s) => s.blocksByMessage)
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
  // The conversation on screen (Phase 4.5/4.6). It is keyed by the conversation
  // itself, not by the screen: walking to another page no longer replaces it.
  // That also retires pinnedThread — it existed only to stop navigation from
  // swapping a conversation mid-thought after following a citation, which is
  // now simply what happens by default.
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const setPendingContext = useChatStore((s) => s.setPendingContext)
  const refreshConversations = useChatStore((s) => s.refreshConversations)
  const newConversation = useChatStore((s) => s.newConversation)
  const openConversation = useChatStore((s) => s.openConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  // History is a permanent rail in fullscreen and an overlay elsewhere (plan
  // D10) — the narrow modes have no room to give a rail without taking it from
  // the conversation, which is the thing you came for.
  const [historyOpen, setHistoryOpen] = useState(false)
  // The conversation's referenced objects (Phase 4.3) — one layer holding both
  // typed "@" mentions and clicked widgets. Shown only on the conversation they
  // belong to; the click half of the lifecycle runs in useAssistantWidgetPin,
  // mounted by AssistantOverlay. This panel renders the row and its ×.
  const mentions = useChatStore((s) => s.mentions)
  const removeMentionRef = useChatStore((s) => s.removeMentionRef)
  const addMentionRef = useChatStore((s) => s.addMentionRef)
  const mentionResolution = useChatStore((s) => s.mentionResolution)
  const mentionsByMessage = useChatStore((s) => s.mentionsByMessage)
  const conversationKey = activeConversationId ?? NEW_CHAT_KEY
  // A conversation carries the context it STARTED in; only a brand-new one
  // takes its framing from the screen you are on right now. So an old chat
  // still says what it was about, and never relabels itself as you walk around.
  const activeMeta = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  )
  const startedIn = activeMeta?.context ?? null
  // The desks this conversation produced (Plexii P5) — element 0 is the
  // primary: the pinned chip and the default push target.
  const linkedDesks = useMemo(() => activeMeta?.linkedDesks ?? [], [activeMeta])
  const primaryDeskId = linkedDesks[0] ?? null
  const linkConversationDesk = useChatStore((s) => s.linkDesk)
  // Discovery mode (Plexii P6): per-conversation, switchable at any time.
  // Subscribed through the fields it derives from so the badge re-renders.
  const pendingMode = useChatStore((s) => s.pendingMode)
  const setChatMode = useChatStore((s) => s.setMode)
  const mode = activeConversationId ? (activeMeta?.mode ?? 'chat') : pendingMode
  const discovering = mode === 'discovery'
  const thread = {
    key: conversationKey,
    label: startedIn?.label ?? ctx.label,
    title: startedIn?.title ?? ctx.title,
    icon: startedIn?.icon ?? ctx.icon,
    // The desk handed to the server for task-scoped context: the one you are
    // on NOW when there is one; otherwise the conversation's primary linked
    // desk (Plexii P5), so a hub chat with a desk works IN that desk — pushes
    // land there and the model can see its canvas.
    serverTaskId: ctx.serverTaskId ?? primaryDeskId
  }
  // Where an approved card lands: the desk on screen when there is one,
  // otherwise the conversation's primary linked desk — so a hub push builds on
  // the conversation's own desk instead of failing for want of a canvas.
  const applyTaskId = activeTaskId ?? primaryDeskId
  // The primary desk's live node, for the pinned chip. A deleted desk renders
  // the honest stale state instead of a link that goes nowhere.
  const primaryDeskNode = primaryDeskId ? nodes.find((n) => n.id === primaryDeskId) ?? null : null
  const [deskMenuOpen, setDeskMenuOpen] = useState(false)
  const deskMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!deskMenuOpen) return
    function onPointerDown(e: PointerEvent): void {
      if (!deskMenuRef.current?.contains(e.target as Node)) setDeskMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [deskMenuOpen])
  const openLinkedDesk = useCallback((taskId: string): void => {
    useNodeStore.getState().setActive(taskId)
    useViewStore.getState().goTask(taskId)
  }, [])
  const activeRefs = useMemo(() => activeMentions(mentions, thread.key), [mentions, thread.key])
  const messages = useMemo(
    () => messagesByTask[thread.key] ?? EMPTY_MESSAGES,
    [messagesByTask, thread.key]
  )
  // The trace for the send currently in flight on THIS thread. Scoped by
  // the active thread, not by the global `sending` flag, so a request started in another
  // context can't draw its progress here.
  const liveTrace = liveTraceByThread[thread.key]
  // The in-flight turn (A1). One trace instance for the whole send: it used
  // to render standalone before the first delta and then remount inside the
  // streaming turn, restarting its reveal from zero — the "searching twice"
  // defect from Caleb's drive. The container after the map now owns the
  // entire live turn. `streaming` is thread-true because liveTrace is
  // per-thread; `sending` alone is global and can belong to another
  // conversation's request.
  const streaming = sending && !!liveTrace
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
  const streamingMsg = streaming && lastMsg?.role === 'assistant' ? lastMsg : null
  // The drain (AI-30, Caleb: "same pace to the end"). The store settles the
  // instant the stream closes, but the waves still on their way must keep
  // landing at reading pace — so the live turn stays mounted for the answer
  // that just finished until its last wave is on screen, and only then does
  // the turn render through the block pipeline (trace folded, cards in).
  // The same StreamingProse instance carries across, so no reveal restarts.
  // Derived at render time, not in an effect: the child's onDrained can fire
  // in the very commit the stream closes, and an effect-set flag would miss
  // it and leave the turn draining forever.
  const lastStreamingTs = useRef<number | null>(null)
  if (streamingMsg) lastStreamingTs.current = streamingMsg.ts
  const [drainedTs, setDrainedTs] = useState<number | null>(null)
  const drainingMsg =
    !streaming &&
    lastMsg?.role === 'assistant' &&
    lastMsg.ts === lastStreamingTs.current &&
    drainedTs !== lastMsg.ts
      ? lastMsg
      : null
  // The turn whose drain just ended: its cards cascade in once (AI-12). The
  // flag outlives the cascade by a beat and then clears, so a navigation
  // back to this page never replays it.
  const [enteringTs, setEnteringTs] = useState<number | null>(null)
  useEffect(() => {
    if (enteringTs === null) return
    const id = window.setTimeout(() => setEnteringTs(null), 1500)
    return () => window.clearTimeout(id)
  }, [enteringTs])
  const drainingTs = drainingMsg?.ts ?? null
  const endDrain = useCallback((): void => {
    if (drainingTs === null) return
    setDrainedTs(drainingTs)
    setEnteringTs(drainingTs)
  }, [drainingTs])
  const liveMsg = streamingMsg ?? drainingMsg
  const liveTurnTrace = liveTrace ?? (drainingMsg ? traceByMessage[String(drainingMsg.ts)] : undefined)
  // "Tree lands first": the first wave waits for the source cascade, timed
  // from the moment retrieval actually landed — an answer that arrives after
  // a long think never waits on a cascade that finished seconds ago.
  const holdUntil =
    liveTurnTrace && liveTurnTrace.retrievedAt !== null
      ? liveTurnTrace.retrievedAt + cascadeDurationMs(liveTurnTrace.sources.length)
      : 0
  const visibleMessages = liveMsg ? messages.slice(0, -1) : messages
  // The follow-up question that is live for the displayed thread, if any —
  // attached to the last message and neither answered nor dismissed. Derived
  // by a pure, tested rule (lib/assistantQuestion).
  const activeQuestion = activeQuestionFor(messages, questionByMessage)
  // Keep the pending context in step with the screen while the chat is still
  // unsaved, so the conversation it becomes remembers where it began.
  useEffect(() => {
    if (activeConversationId === null) {
      setPendingContext({ kind: ctx.kind, label: ctx.label, title: ctx.title, icon: ctx.icon })
    }
  }, [activeConversationId, ctx.kind, ctx.label, ctx.title, ctx.icon, setPendingContext])
  // The history list backs both the rail and the context of the open chat.
  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])
  // Load the people directory once the panel is live, so @-mentioning a
  // colleague works without opening the org admin screen first. Fails quiet:
  // signed out or personal-workspace leaves it empty and offers nobody.
  useEffect(() => {
    void usePeopleStore.getState().load()
  }, [])
  // ⌘O / Ctrl+O starts a new conversation from anywhere, in every mode. Checked
  // free of conflicts: App.tsx's global handlers use ⌘⇧K, ⌘/ and ⌘Z only.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      if (e.key.toLowerCase() !== 'o') return
      e.preventDefault()
      newConversation()
      setHistoryOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newConversation])
  // The composer is a TipTap editor now (Phase 4.3), so the draft lives in its
  // document. `draft` mirrors the plain-text rendering purely so Send can be
  // disabled on an empty box — the document remains the source of truth.
  const [draft, setDraft] = useState('')
  // The composer as the mascot's omnibar door (A2, AI-01, R11): what Enter
  // will do is previewed, Tab flips the pick, and it never guesses silently.
  const [omniPick, setOmniPick] = useState(0)
  const editorRef = useRef<import('@tiptap/core').Editor | null>(null)
  // Draft persistence (A1, defect AI-16): the panel unmounts when you walk to
  // a desk or collapse to the pill, and the draft used to live only in the
  // editor — the walk ate what was being typed. Every change now mirrors the
  // document into the store per conversation; this pair restores it when the
  // editor (re)appears or the conversation changes. The key ref keeps the
  // change handler stable (TipTap captures onUpdate once, at creation).
  const draftKeyRef = useRef(conversationKey)
  draftKeyRef.current = conversationKey
  const loadedDraftKey = useRef<string | null>(null)
  const handleComposerChange = useCallback((text: string, doc: import('@tiptap/core').JSONContent): void => {
    setDraft(text)
    setOmniPick(0) // a changed input re-previews from its leading intent (R11)
    useChatStore.getState().setThreadDraft(draftKeyRef.current, text.trim() ? doc : null)
  }, [])
  const restoreDraft = useCallback((ed: import('@tiptap/core').Editor, key: string): void => {
    if (loadedDraftKey.current === key) return
    loadedDraftKey.current = key
    const stored = useChatStore.getState().draftDocByThread[key]
    if (stored) {
      ed.commands.setContent(stored)
      setDraft(docToInput(stored).text)
    } else if (!ed.isEmpty) {
      // Switching to a conversation that has no draft: the box belongs to it
      // now, and the previous conversation's words are safe under its own key.
      ed.commands.clearContent()
      setDraft('')
    }
  }, [])
  useEffect(() => {
    const ed = editorRef.current
    if (ed) restoreDraft(ed, conversationKey)
  }, [conversationKey, restoreDraft])
  // Fill the composer without sending — what the suggestion rows and home cards
  // have always done. Goes through the editor because there is no textarea to
  // set a value on any more.
  const fillComposer = useCallback((text: string): void => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain().focus().clearContent().insertContent(text).run()
    setDraft(text)
  }, [])
  // Insert an answer into the document currently open in the editor (the doc
  // exposes itself as window.__docEditor). This gives the one assistant the
  // "drop the answer into my doc" capability the old in-doc panel had, so the
  // separate doc AI tab is no longer needed.
  const insertIntoDoc = useCallback((content: string): void => {
    const ed = (window as unknown as { __docEditor?: import('@tiptap/core').Editor }).__docEditor
    if (!ed) return
    ed.chain().focus().insertContent(content).run()
  }, [])
  const [summarizing, setSummarizing] = useState(false)
  // Which turn most recently had its text copied — drives the ✓ confirmation on
  // the copy button, then clears itself.
  const [copiedTs, setCopiedTs] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const createWidget = useWidgetStore((s) => s.create)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const pushAssistantMessage = useChatStore((s) => s.pushAssistantMessage)
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
  // Fullscreen with an empty thread renders as Notion's AI home (3a.4):
  // greeting and composer centered as a group, capability row and suggestion
  // cards under the input. Same panel, same nodes — only layout classes
  // change, so the draft and every store subscription survive the swap.
  const isFullscreen = page || chromeMode === 'fullscreen'
  const fullscreenHome = isFullscreen && messages.length === 0

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

  // Scroll discipline (P3): follow the conversation only while the reader is
  // already at the bottom (within ~100px). Scrolling up locks the position —
  // an answer must never yank the page out from under a reading eye — and a
  // "Jump to latest" pill offers the way back. A ResizeObserver on the column
  // follows the smoothed reveal, whose height grows between store updates.
  const stickRef = useRef(true)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const [showJump, setShowJump] = useState(false)
  const jumpTimer = useRef<number | null>(null)
  // The follow glides (AI-30). Content now grows a wave at a time rather
  // than a character at a time, so snapping scrollTop to the bottom on every
  // resize would yank the transcript by a wave's height each beat once the
  // answer overflows the viewport. Instead the viewport eases toward the
  // bottom on the frame clock, re-reading the target every frame so it
  // tracks growth that lands mid-glide. Reduced motion snaps as before.
  const followRaf = useRef(0)
  const following = useRef(false)
  const syncStickRef = useRef<() => void>(() => {})
  const followBottom = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollTop = el.scrollHeight
      return
    }
    cancelAnimationFrame(followRaf.current)
    let expected = el.scrollTop
    const step = (): void => {
      const now = scrollRef.current
      if (!now || !stickRef.current) {
        following.current = false
        return
      }
      // The reader moved the viewport themselves since the last frame: the
      // glide lets go at once and the stick rule re-measures from there.
      if (Math.abs(now.scrollTop - expected) > 2) {
        following.current = false
        syncStickRef.current()
        return
      }
      const target = now.scrollHeight - now.clientHeight
      const d = target - now.scrollTop
      if (Math.abs(d) < 0.5) {
        now.scrollTop = target
        following.current = false
        return
      }
      now.scrollTop += d * 0.2
      expected = now.scrollTop
      followRaf.current = requestAnimationFrame(step)
    }
    following.current = true
    followRaf.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => () => cancelAnimationFrame(followRaf.current), [])
  const syncStick = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    // Our own glide fires scroll events; mid-glide the distance can read as
    // "left the bottom" for a frame. Only the reader's scrolling counts.
    if (following.current) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const stick = dist < 100
    stickRef.current = stick
    // The pill appears only after the reader has genuinely left the bottom
    // (150ms debounce, real scrollback below them) — a single-frame layout
    // wobble must never flash chrome into the transcript.
    if (stick) {
      if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current)
      jumpTimer.current = null
      setShowJump(false)
    } else if (jumpTimer.current === null) {
      jumpTimer.current = window.setTimeout(() => {
        jumpTimer.current = null
        const now = scrollRef.current
        if (!now) return
        // Re-measure live: layout may have settled back to the bottom since
        // the scroll event that armed this timer.
        const nowDist = now.scrollHeight - now.scrollTop - now.clientHeight
        if (nowDist >= 100 && now.scrollHeight - now.clientHeight > 40) setShowJump(true)
        else stickRef.current = true
      }, 150)
    }
  }, [])
  syncStickRef.current = syncStick
  const jumpToLatest = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = true
    setShowJump(false)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    const col = columnRef.current
    if (!el || !col) return
    const ro = new ResizeObserver(() => {
      if (stickRef.current) followBottom()
      else syncStick()
    })
    ro.observe(col)
    return () => ro.disconnect()
  }, [syncStick, followBottom])
  // A new message (the user's own send, or a turn appearing) re-follows when
  // stuck; the length hook keeps the non-streamed reply path followed too.
  const lastMessageLen = messages.length > 0 ? messages[messages.length - 1].content.length : 0
  useEffect(() => {
    if (stickRef.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    // Completion swaps the streaming renderer for the block pipeline, which
    // changes content height without changing message count — re-measure so
    // the pill cannot linger over a transcript that is in fact at its end.
    if (!sending) syncStick()
  }, [messages.length, lastMessageLen, sending, syncStick])

  // What "take me to X" can reach from the composer: fixed pages, desks, and
  // documents. Same OmniTarget shape the palette's classifier speaks.
  const docList = useDocumentsStore((s) => s.list)
  const omniTargets = useMemo<OmniTarget[]>(
    () => [
      { kind: 'page', id: 'home', title: 'Home' },
      { kind: 'page', id: 'tasks', title: 'Tasks' },
      { kind: 'page', id: 'calendar', title: 'Calendar' },
      { kind: 'page', id: 'files', title: 'Files' },
      { kind: 'page', id: 'vault', title: 'Vault' },
      ...nodes
        .filter((n) => n.kind === 'task')
        .map((n) => ({ kind: 'desk' as const, id: n.id, title: n.title || 'Untitled desk' })),
      ...docList.map((d) => ({ kind: 'document' as const, id: d.id, title: d.title || 'Untitled' }))
    ],
    [nodes, docList]
  )
  const composerIntents = useMemo(
    () => composerOmniIntents(draft, omniTargets),
    [draft, omniTargets]
  )
  const pickedIntent: OmniIntent | null =
    composerIntents.length > 0
      ? composerIntents[Math.min(omniPick, composerIntents.length - 1)]
      : null

  // Perform a non-chat intent and clear the box — the same acts the palette
  // rows perform, so the three doors stay one door.
  const performOmniIntent = useCallback(
    (intent: OmniIntent): void => {
      const view = useViewStore.getState()
      if (intent.kind === 'url' && intent.url) {
        useWebPanel.getState().openWeb(intent.url)
      } else if (intent.kind === 'search' && intent.url) {
        useWebPanel.getState().openWeb(searchUrl(useWebPanel.getState().engine, intent.url))
      } else if (intent.kind === 'goto' && intent.target) {
        const t = intent.target
        if (t.kind === 'desk') {
          useNodeStore.getState().setActive(t.id)
          view.goTask(t.id)
        } else if (t.kind === 'document') {
          view.goDocument(t.id)
        } else {
          if (t.id === 'home') view.goHome()
          else if (t.id === 'tasks') view.goAllTasks()
          else if (t.id === 'calendar') view.goCalendar()
          else if (t.id === 'files') view.goFiles()
          else if (t.id === 'vault') view.goVault()
        }
      }
      editorRef.current?.commands.clearContent()
      setDraft('')
      setOmniPick(0)
      useChatStore.getState().setThreadDraft(draftKeyRef.current, null)
    },
    []
  )

  const submitComposer = useCallback(async (): Promise<void> => {
    const ed = editorRef.current
    // The document is the source of truth: its chips serialise to "@Title" in
    // the text, and the references themselves ride from the store (they are
    // sticky to the conversation, not to this message).
    const content = ed ? docToInput(ed.getJSON()).text.trim() : draft.trim()
    if (!content || useChatStore.getState().sending) return
    // The omni door (AI-01): when the previewed pick is a non-chat intent,
    // Enter performs it instead of sending — exactly what the strip said.
    if (pickedIntent && pickedIntent.kind !== 'ask') {
      performOmniIntent(pickedIntent)
      return
    }
    ed?.commands.clearContent()
    setDraft('')
    await send(thread.serverTaskId, content, thread.key)
  }, [draft, send, thread.serverTaskId, thread.key, pickedIntent, performOmniIntent])

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    await submitComposer()
  }

  // Handed to the "@" suggestion plugin. Reading through getState keeps the
  // hooks object stable while still seeing live values, so re-configuring the
  // extension never throws the draft away.
  const mentionHooks = useMemo(
    () => ({
      conversationKey: (): string => thread.key,
      current: (): readonly MentionRef[] => useChatStore.getState().mentions,
      onPick: (ref: MentionRef): void => {
        addMentionRef(ref)
      }
    }),
    [thread.key, addMentionRef]
  )

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
    // Nothing to pin any more: a conversation is no longer replaced by the
    // screen, so following a citation cannot lose the conversation that
    // produced the link. That was the entire job of pinnedThread.
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
      case 'url':
        // A web source opens in the in-app browser panel (A2, R4/R13): the
        // web never leaves Plexi. The panel's toolbar carries the explicit
        // system-browser escape.
        useWebPanel.getState().openWeb(target.url)
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
      case 'file': {
        // Reveal the cited file in the Drive: its folder opens with the file
        // selected, mirroring what a search hit does.
        const entry =
          typeof window.api.fileManager?.get === 'function'
            ? await window.api.fileManager.get(target.fileId).catch(() => null)
            : null
        view.goFiles()
        const fm = useFileManagerStore.getState()
        await fm.openFolder(entry?.parentId ?? null)
        fm.select(target.fileId)
        break
      }
      case 'chat':
        // A cited past conversation opens as the panel's live conversation,
        // exactly like picking it from the history rail.
        await useChatStore.getState().openConversation(target.conversationId)
        break
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
    // In sidebar and floating modes the assistant is a floating rounded card,
    // the same chrome the desk sidebar / segment / PlexiOffice menus use. In
    // fullscreen it is deliberately NOT a card (operator's live-drive call:
    // "no borders and edges, it should just be the screen you are in") — the
    // panel goes flat and full-bleed and IS the page; readable width comes
    // from internal centered columns instead of an inset box.
    <aside
      className={
        isFullscreen
          ? 'h-full w-full flex flex-col overflow-hidden bg-[var(--surface-base)] text-[var(--ink-100)]'
          : FLOATING_MENU_ASIDE
      }
      style={isFullscreen ? undefined : FLOATING_MENU_STYLE}
      data-testid="assistant-panel"
    >
      {/* Fullscreen is the AI home, so it carries a permanent conversation rail
          beside the chat (plan D10). The narrow modes cannot give a rail the
          width without taking it from the conversation, so they get the same
          list as an overlay, toggled from the header. One component either
          way — two containers, not two implementations. */}
      <div className={isFullscreen ? 'flex-1 min-h-0 flex' : 'contents'}>
      {isFullscreen && (
        <ConversationList
          variant="rail"
          conversations={conversations}
          activeId={activeConversationId}
          onOpen={(id) => void openConversation(id)}
          onNew={newConversation}
          onDelete={(id) => void deleteConversation(id)}
        />
      )}
      <div className={isFullscreen ? 'flex-1 min-w-0 flex flex-col relative' : 'contents'}>
      {!isFullscreen && historyOpen && (
        <ConversationList
          variant="overlay"
          conversations={conversations}
          activeId={activeConversationId}
          onOpen={(id) => {
            void openConversation(id)
            setHistoryOpen(false)
          }}
          onNew={() => {
            newConversation()
            setHistoryOpen(false)
          }}
          onDelete={(id) => void deleteConversation(id)}
        />
      )}
      <div className="px-3 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {/* Sentence case, not shouted. The uppercase treatment made a 13px
              label read as a system banner rather than a product surface. */}
          <div className="flex items-center gap-1.5">
            <Icon name={thread.icon} size={15} className="text-[var(--ink-70)]" />
            <h2 className="fb-t-title text-[var(--ink-100)]">
              Plexii
            </h2>
            {/* The mode badge (Plexii P6) — visible whenever discovery is on,
                so the different posture is never a mystery. */}
            {discovering && (
              <span
                data-testid="chat-mode-badge"
                title="Discovery mode — Plexii is leading with questions toward a desk"
                className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-accent/10 px-1.5 py-px fb-t-caption font-medium text-[rgb(var(--accent))]"
              >
                <Icon name="plexii:discover" size={11} />
                Discovery
              </span>
            )}
          </div>
          <p
            className="fb-t-caption text-[var(--ink-50)] truncate"
            title={`Plexii is focused on ${thread.label}${thread.title ? ` — ${thread.title}` : ''}`}
          >
            {thread.title ? `${thread.title} · ` : ''}
            {thread.label}
          </p>
          {/* The conversation's desk, pinned where the conversation lives
              (Plexii P5). Clicking goes to it; a deleted desk says so instead
              of linking nowhere. */}
          {primaryDeskId && (
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                data-testid="chat-linked-desk"
                disabled={!primaryDeskNode}
                onClick={() => primaryDeskNode && openLinkedDesk(primaryDeskId)}
                title={
                  primaryDeskNode
                    ? `Open the linked desk — ${primaryDeskNode.title}`
                    : 'The linked desk was deleted'
                }
                className={`fb-press inline-flex max-w-full items-center gap-1 rounded-[var(--radius-chip)] px-1.5 py-0.5 fb-t-caption transition-colors ${
                  primaryDeskNode
                    ? 'bg-accent/10 text-[rgb(var(--accent))] hover:bg-accent/20'
                    : 'bg-[var(--surface-sunken)] text-[var(--ink-40)] cursor-default'
                }`}
              >
                <Icon name="desk" size={11} className="shrink-0" />
                <span className="truncate">
                  {primaryDeskNode ? primaryDeskNode.title : 'Desk removed'}
                </span>
              </button>
              {linkedDesks.length > 1 && (
                <span
                  className="fb-t-caption text-[var(--ink-50)]"
                  title={`${linkedDesks.length - 1} more linked desk${linkedDesks.length > 2 ? 's' : ''}`}
                >
                  +{linkedDesks.length - 1}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Enter or leave discovery at any point in any conversation. */}
          <button
            onClick={() => setChatMode(discovering ? 'chat' : 'discovery')}
            className={`icon-btn ${discovering ? '!text-accent' : ''}`}
            data-testid="chat-mode-toggle"
            aria-pressed={discovering}
            title={
              discovering
                ? 'Discovery mode is ON — Plexii leads with questions toward a desk. Click to return to normal chat.'
                : 'Discovery mode — let Plexii lead: guided questions and options that build toward a desk'
            }
          >
            <Icon name="plexii:discover" size={16} filled={discovering} />
          </button>
          <button
            onClick={() => {
              newConversation()
              setHistoryOpen(false)
            }}
            className="icon-btn"
            data-testid="assistant-new-chat"
            title="New chat (⌘O)"
          >
            <Icon name="add" size={16} />
          </button>
          {/* Fullscreen keeps the rail open beside the conversation, so it has
              no need of a toggle. */}
          {!isFullscreen && (
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className={`icon-btn ${historyOpen ? '!text-accent' : ''}`}
              data-testid="assistant-history-toggle"
              title="Your conversations"
            >
              <Icon name="history" size={16} />
            </button>
          )}
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
              across switches. Absent in page mode: the hub is not re-dressable. */}
          {!page && (
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
                className="absolute right-0 top-full mt-1.5 z-30 min-w-[172px] rounded-[var(--radius-row)] border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-1"
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
                    className="w-full flex items-center gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 fb-t-label text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
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
          )}
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

      {hasApiKey === false && (
        <div className="m-3 p-3 fb-card bg-amber-500/10 fb-t-label text-[var(--ink-90)] leading-relaxed flex gap-2">
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
        data-testid="chat-scroll"
        onContextMenu={handleMessagesContextMenu}
        onScroll={syncStick}
        className={
          fullscreenHome
            ? 'shrink-0 mt-auto w-full max-w-[640px] mx-auto px-6 pb-5'
            : 'flex-1 overflow-auto px-3 pt-5 pb-44'
        }
      >
        {/* In fullscreen the flat page needs a readable column; elsewhere the
            card provides the width. Always the same wrapper node — classes
            only — so switching modes mid-conversation re-lays-out without
            remounting the panel. */}
        {/* Turn rhythm (F1): a question and its answer read as one pair —
            tight inside the pair, real air between pairs. The base gap is
            small; each USER turn opens a new pair with its own top margin. */}
        <div
          ref={columnRef}
          className={
            isFullscreen && !fullscreenHome ? 'max-w-[780px] mx-auto w-full space-y-3' : 'space-y-2.5'
          }
        >
        {fullscreenHome && (
          // The Notion-home greeting: centered over the composer. The
          // suggestion cards and capability row render under the composer,
          // inside the form below.
          <div data-testid="assistant-home" className="text-center">
            <h3 className="fb-t-hero fb-display text-[var(--ink-100)] mb-2">
              {discovering ? "What are we building?" : 'How can I help you today?'}
            </h3>
            <p className="fb-t-body text-[var(--ink-60)] leading-relaxed">
              {discovering
                ? 'Start anywhere — a question, an idea, a list, a business. I will ask my way through it with you, and we finish with a desk that brings it to life.'
                : ctx.intro}
            </p>
          </div>
        )}
        {messages.length === 0 && !fullscreenHome && discovering && (
          // Discovery in the narrow modes: its own invitation, no starter rows.
          <div className="mt-2 px-1" data-testid="assistant-empty-state">
            <h3 className="fb-t-title text-[var(--ink-100)] mb-1">
              What are we building?
            </h3>
            <p className="fb-t-caption text-[var(--ink-60)] leading-relaxed">
              Start anywhere — a question, an idea, a list, a business. I will ask my way through it
              with you, and we finish with a desk that brings it to life.
            </p>
          </div>
        )}
        {messages.length === 0 && !fullscreenHome && !discovering && (
          // Notion-mirror empty state: avatar, "How can I help you today?",
          // the per-screen intro, then iconed suggestion ROWS — the reference
          // layout. (The earlier wrap-chips predate the mirror direction.)
          // Content still comes from ctx per screen — no curated static list,
          // no invented "New" badges (plan D4).
          <div className="mt-2 px-1 flex flex-col" data-testid="assistant-empty-state">
            <h3 className="fb-t-title text-[var(--ink-100)] mb-1">
              How can I help you today?
            </h3>
            <p className="fb-t-caption text-[var(--ink-60)] leading-relaxed mb-4">{ctx.intro}</p>
            <div className="flex flex-col -mx-1">
              {ctx.suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => fillComposer(s.text)}
                  data-testid="chat-suggestion"
                  className="flex items-center gap-2.5 text-left fb-t-label px-2 py-2 rounded-[var(--radius-row)] text-[var(--ink-80)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Icon name={s.icon} size={15} className="text-accent shrink-0" />
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleMessages.map((m, i) => {
          // The user's turn is a quiet accent-tinted block, built from tokens so
          // it follows every theme. It used to be hardcoded stone-900/stone-100
          // — the one element in the panel that ignored the token system and so
          // stayed the same slab under futuristic and atelier.
          if (m.role === 'user') {
            // Any references this turn was sent with re-render as chips exactly
            // where they were typed (plan P1's first rendering). splitMentionText
            // only chips a reference whose own token is genuinely in the text —
            // so a turn shows what was actually sent, never a chip invented to
            // match a reference the words no longer contain.
            const turnRefs = mentionsByMessage[String(m.ts)] ?? []
            const segments = splitMentionText(m.content, turnRefs)
            return (
              <div
                key={i}
                data-testid="user-turn"
                className="ml-auto w-fit max-w-[70%] mt-8 first:mt-0 rounded-[var(--radius-card)] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap bg-[rgb(var(--accent)/0.10)] text-[var(--ink-100)]"
              >
                {segments.length <= 1
                  ? m.content
                  : segments.map((seg, si) =>
                      seg.kind === 'text' ? (
                        <span key={si}>{seg.text}</span>
                      ) : (
                        <span
                          key={si}
                          data-testid="turn-mention-chip"
                          data-mention-id={seg.ref.id}
                          title={`${seg.ref.title} — referenced in this message`}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.14)] px-1.5 py-[1px] mx-[1px] align-baseline"
                        >
                          <Icon name={seg.ref.icon} size={11} className="shrink-0 text-accent" />
                          <span className="truncate max-w-[160px]">{seg.ref.title}</span>
                        </span>
                      )
                    )}
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
          const uiBlocks = blocksByMessage[String(m.ts)] ?? []
          const blocks = deriveAssistantBlocks(m, proposals, sources, uiBlocks)
          // Interactive blocks answer for the user only on the latest turn and
          // only while nothing is in flight — older blocks stay visible as a
          // record of what was offered, but no longer speak.
          const uiEnabled = i === messages.length - 1 && !sending
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
          const entering = enteringTs === m.ts
          let enteringIndex = 0
          return (
            <div key={i} className="group/turn flex flex-col gap-3" data-testid="assistant-turn">
              {/* No identity row (P2). The premium-chat convention is
                  unanimous: the asymmetry itself marks the speaker — user
                  turns sit right-anchored in a quiet tint, assistant turns are
                  flat full-width prose on the page. A repeated logo eyebrow
                  reads as messenger chrome, and the trace's summary line
                  already heads the answers that did retrieval work. */}
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
              {blocks.map((block, bi) => {
                const view = (
                  <ChatBlockView
                    block={block}
                    activeTaskId={applyTaskId}
                    appliedProposals={appliedForMsg}
                    onApplied={(id, applied) => markProposalApplied(m.ts, id, applied)}
                    onConsumeProposal={(id) => consumeProposal(m.ts, id)}
                    onOpenSource={(s) => void openSource(s)}
                    citedSources={citedSources}
                    uiEnabled={uiEnabled}
                    onUiSubmit={(text) => {
                      if (useChatStore.getState().sending) return
                      void send(thread.serverTaskId, text, thread.key)
                    }}
                  />
                )
                // The turn that just finished draining (AI-12, AI-30): its
                // cards and blocks cascade in with the app's tile entrance,
                // after the prose — the prose itself is already on screen
                // and must not flinch at the handoff. History never animates.
                if (entering && block.kind !== 'text') {
                  const at = enteringIndex++
                  return (
                    <div
                      key={bi}
                      className="fb-fade-in-up empty:hidden"
                      style={{ animationDelay: `${Math.min(at * 35, 350)}ms` }}
                    >
                      {view}
                    </div>
                  )
                }
                return (
                  <div key={bi} className="empty:hidden">
                    {view}
                  </div>
                )
              })}
              {/* Per-turn actions (P2): completion is a state change. Nothing
                  but the answer exists while it streams; the actions
                  materialize when the turn is done and reveal on hover/focus —
                  present for the pointer that goes looking, invisible to the
                  reading eye. Keyboard users get them via focus-within. */}
              <div
                className={`flex items-center gap-0.5 transition-opacity ${
                  sending && i === messages.length - 1
                    ? 'hidden'
                    : 'opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100'
                }`}
              >
                <button
                  onClick={() => void copyTurn(m.content)}
                  title="Copy this reply"
                  className="icon-btn !h-6 !w-6"
                  data-testid="turn-copy"
                >
                  <Icon name={copiedTs === m.ts ? 'check' : 'content_copy'} size={12} />
                </button>
                {typeof window !== 'undefined' &&
                  !!(window as unknown as { __docEditor?: unknown }).__docEditor && (
                    <button
                      onClick={() => insertIntoDoc(m.content)}
                      title="Insert this into the document"
                      className="icon-btn !h-6 !w-6"
                      data-testid="turn-insert-doc"
                    >
                      <Icon name="post_add" size={12} />
                    </button>
                  )}
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
        {/* The live turn (A1): ONE container from send to completion, so the
            trace mounts once and never replays its reveal. Before the first
            delta it stands alone — retrieval genuinely is the pending state,
            and the trace says so truthfully. Once prose arrives,
            StreamingProse joins below and the trace settles in the same
            commit, so the ceremony never pushes the living text down. On
            completion this container unmounts and the finished message
            renders through the block pipeline with its trace already folded
            to the summary line (the store closes it at settle). */}
        {(streaming || drainingMsg) && (
          <div className="flex flex-col gap-3" data-testid="assistant-turn">
            {liveTurnTrace && (
              <RetrievalTrace
                trace={liveTurnTrace}
                settled={!!liveMsg}
                holdOpen={!!drainingMsg}
                onOpenSource={(s) => void openSource(s)}
              />
            )}
            {liveMsg && (
              <StreamingProse
                markdown={liveMsg.content}
                active={streaming}
                holdUntil={holdUntil}
                onDrained={endDrain}
              />
            )}
          </div>
        )}
        </div>
      </div>

      {/* The composer is one container that holds the field AND its actions,
          rather than a bare textarea with a detached Send button underneath.
          The whole box carries the focus ring, so it reads as a single control.
          In the fullscreen home it joins the greeting as one centered column
          (mt-auto above + mb-auto here center the pair), with the capability
          row and suggestion cards underneath. */}
      {/* The bottom region floats (F1). No dividing line anywhere: the
          composer hangs over the transcript on a soft fade of the page
          colour, and the transcript scrolls underneath (the scroll area
          carries matching bottom padding). */}
      <form
        onSubmit={handleSend}
        className={
          fullscreenHome
            ? 'p-3 pt-0 mb-auto w-full max-w-[640px] mx-auto'
            : 'absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-10 pointer-events-none bg-gradient-to-t from-[var(--surface-base)] via-[var(--surface-base)]/85 to-transparent'
        }
      >
        {!fullscreenHome && showJump && (
          <div className="flex justify-center mb-2 pointer-events-none">
            <button
              type="button"
              onClick={jumpToLatest}
              data-testid="jump-to-latest"
              className="pointer-events-auto fb-glass-panel fb-press rounded-full h-7 px-3 flex items-center gap-1.5 fb-t-caption font-medium text-[var(--ink-90)] shadow-[var(--shadow-cast)]"
            >
              <span aria-hidden="true">↓</span> Jump to latest
            </button>
          </div>
        )}
        <div
          className={`pointer-events-auto ${isFullscreen && !fullscreenHome ? 'max-w-[780px] mx-auto w-full' : ''}`}
        >
        {/* Glass composer (P5), one surface that also asks (F1): the
            follow-up question docks inside this card — no separate box, no
            extra border. The edge-light is gone by ruling: the breathing
            double-i is the only thinking motion. */}
        <div className="relative fb-glass-panel rounded-[var(--radius-card)] px-2.5 pt-2 pb-1.5 flex flex-col gap-2 transition-shadow focus-within:border-[rgb(var(--accent)/0.55)] focus-within:shadow-[var(--shadow-cast),var(--shadow-inset-highlight),0_0_0_3px_rgb(var(--accent)/0.13)]">
          {activeQuestion && (
            <QuestionCard
              docked
              question={activeQuestion.question}
              disabled={sending}
              onDismiss={() => dismissQuestion(activeQuestion.messageTs)}
              onAnswer={(option) => {
                if (sending) return
                void send(thread.serverTaskId, option, thread.key)
              }}
            />
          )}
          {/* What this conversation is working from, restated at the point of
              typing. Either the objects it references (typed with "@" or
              clicked on the canvas — one layer, plan D7/D8) or, when it
              references nothing, the surface it is scoped to (Notion's 📄-chip
              pattern; same fact as the header subtitle, which in floating and
              fullscreen modes is far from the composer).

              The row is the live set: exactly what will ride the NEXT message.
              The chips INSIDE the box are per-message, and stay in the
              transcript as a record of what each message said. Two renderings,
              one set (plan P1). */}
          <div>
            {activeRefs.length > 0 ? (
              <MentionRefRow
                refs={activeRefs}
                resolution={mentionResolution}
                onRemove={(key) => removeMentionRef(thread.key, key)}
              />
            ) : (
              <span
                data-testid="composer-context-chip"
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-0.5 fb-t-caption text-[var(--ink-60)]"
                title={`This conversation is scoped to ${thread.title || thread.label}`}
              >
                <Icon name={thread.icon} size={11} className="shrink-0" />
                <span className="truncate">{thread.title || thread.label}</span>
              </span>
            )}
          </div>
          {composerIntents.length > 0 && !sending && (
            /* The intent preview (R11): the composer says what Enter will do
               before it does it. Tab steps the pick; clicking a chip acts. */
            <div
              data-testid="composer-intent-row"
              className="flex items-center gap-1 flex-wrap fb-t-caption"
            >
              {composerIntents.map((intent, i) => {
                const selected = intent === pickedIntent
                return (
                  <button
                    key={`${intent.kind}-${intent.target?.id ?? ''}`}
                    type="button"
                    data-testid={`composer-intent-${intent.kind}`}
                    onClick={() =>
                      intent.kind === 'ask' ? setOmniPick(i) : performOmniIntent(intent)
                    }
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors ${
                      selected
                        ? 'border-[rgb(var(--accent)/0.5)] text-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.08)]'
                        : 'border-[var(--edge-soft)] text-[var(--ink-50)] hover:text-[var(--ink-80)]'
                    }`}
                  >
                    <Icon
                      name={
                        intent.kind === 'url'
                          ? 'language'
                          : intent.kind === 'search'
                            ? 'travel_explore'
                            : intent.kind === 'goto'
                              ? 'arrow_forward'
                              : 'forum'
                      }
                      size={11}
                      className="shrink-0"
                    />
                    <span className="truncate max-w-[220px]">{intent.label}</span>
                    <span className="opacity-60 font-mono text-[9px]">{selected ? '⏎' : '⇥'}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div
            onKeyDownCapture={(e) => {
              // Tab flips the previewed intent (R11) — only while the strip
              // is showing, so normal focus travel is untouched otherwise.
              if (e.key === 'Tab' && !e.shiftKey && composerIntents.length > 1) {
                e.preventDefault()
                e.stopPropagation()
                setOmniPick((p) => (p + 1) % composerIntents.length)
              }
            }}
          >
            <MentionComposer
              placeholder={discovering ? 'Start anywhere — an idea, a question, a hunch…' : ctx.placeholder}
              disabled={sending}
              hooks={mentionHooks}
              onTextChange={handleComposerChange}
              onSubmit={() => void submitComposer()}
              onReady={(ed) => {
                editorRef.current = ed
                restoreDraft(ed, conversationKey)
              }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {/* Real model picker (P7) — shared with the focus AI Chat. */}
            <ModelPickerChip />
            {/* The persistent out (Plexii P5): any conversation with substance
                can become a desk, and a conversation that has one can push
                what's new to it. Both ride the normal proposal pipeline — the
                model proposes, the user approves, nothing lands silently. */}
            {messages.length > 0 && (
              <div className="relative flex items-center" ref={deskMenuRef}>
                <button
                  type="button"
                  data-testid="chat-turn-into-desk"
                  disabled={sending}
                  onClick={() => {
                    if (useChatStore.getState().sending) return
                    void send(
                      thread.serverTaskId,
                      primaryDeskId ? PUSH_TO_DESK_MESSAGE : TURN_INTO_DESK_MESSAGE,
                      thread.key
                    )
                  }}
                  title={
                    primaryDeskId
                      ? 'Push to desk — Plexii proposes what is new from this conversation as cards you approve'
                      : 'Turn into desk — Plexii proposes the desk and its widgets as cards you approve'
                  }
                  className="fb-press inline-flex items-center gap-1 h-[26px] px-2 rounded-full border border-[var(--edge-soft)] bg-[var(--surface-sunken)] fb-t-caption font-medium text-[var(--ink-70)] hover:text-[rgb(var(--accent))] hover:border-[rgb(var(--accent)/0.45)] transition-colors disabled:opacity-50"
                >
                  <Icon name="desk" size={12} className="shrink-0" />
                  {primaryDeskId ? 'Push to desk' : 'Turn into desk'}
                </button>
                {linkedDesks.length > 1 && (
                  <>
                    <button
                      type="button"
                      data-testid="chat-desk-switcher"
                      onClick={() => setDeskMenuOpen((v) => !v)}
                      title="Choose which linked desk pushes target"
                      aria-expanded={deskMenuOpen}
                      className="icon-btn !h-[26px] !w-5 -ml-0.5"
                    >
                      <Icon name="expand_more" size={13} />
                    </button>
                    {deskMenuOpen && (
                      <div
                        data-testid="chat-desk-menu"
                        className="fb-pop-in absolute bottom-full left-0 mb-1.5 z-30 min-w-[190px] rounded-[var(--radius-row)] border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-1"
                        style={{ boxShadow: 'var(--shadow-cast)' }}
                      >
                        {linkedDesks.map((id) => {
                          const node = nodes.find((n) => n.id === id) ?? null
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                if (activeConversationId) {
                                  void linkConversationDesk(activeConversationId, id, true)
                                }
                                setDeskMenuOpen(false)
                              }}
                              className="w-full flex items-center gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 fb-t-label text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
                            >
                              <Icon name="desk" size={13} className="text-[var(--ink-60)] shrink-0" />
                              <span className="flex-1 min-w-0 truncate text-left">
                                {node ? node.title : 'Deleted desk'}
                              </span>
                              {id === primaryDeskId && (
                                <Icon name="check" size={13} className="text-accent shrink-0" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <span className="flex-1" />
            {/* Send ⇄ Stop (P5): while Plexii writes, the primary control is
                stopping it — prominent, same seat, never buried. Stop keeps
                the partial answer (the abort path completes the turn with
                what already streamed). The square is drawn, not an icon. */}
            {sending ? (
              <button
                type="button"
                onClick={cancelSend}
                title="Stop — keeps what has been written so far"
                aria-label="Stop generating"
                data-testid="chat-stop"
                className="fb-press w-[26px] h-[26px] rounded-full grid place-items-center shrink-0 transition-colors bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))]"
              >
                <span className="w-[9px] h-[9px] rounded-[2px] bg-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                title="Send"
                aria-label="Send"
                className="fb-press w-[26px] h-[26px] rounded-full grid place-items-center shrink-0 transition-colors bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] disabled:bg-[var(--surface-sunken)] disabled:text-[var(--ink-40)] disabled:border disabled:border-[var(--edge-soft)]"
              >
                <Icon name="arrow_upward" size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Discovery supplies its own invitation ("start anywhere"), so the
            normal-chat starters are suppressed there: "Draft an email" and
            "What should I work on next?" are the wrong offer for someone who
            came to explore an idea. */}
        {fullscreenHome && !discovering && (
          <>
            {/* What the assistant can genuinely act on today (P8), and a real
                entry point for each (3b — operator's call): clicking a chip
                sends its declared starter as a genuine user request; the
                question protocol gathers the specifics. Backed by real
                proposal kinds (lib/assistantCapabilities, type-locked). */}
            <div
              data-testid="assistant-capability-row"
              aria-label="What the assistant can act on"
              className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5"
            >
              {ASSISTANT_CAPABILITIES.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  data-testid="capability-chip"
                  data-starter={c.starter}
                  disabled={sending}
                  onClick={() => {
                    if (sending) return
                    void send(thread.serverTaskId, c.starter, thread.key)
                  }}
                  title={`Start now — sends “${c.starter}”; I'll ask for any details I need`}
                  className="inline-flex items-center gap-1 fb-t-caption text-[var(--ink-60)] hover:text-accent underline decoration-transparent hover:decoration-current underline-offset-2 transition-colors disabled:opacity-50"
                >
                  <Icon name={c.icon} size={12} className="shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>
            {/* The per-screen suggestions as home cards under the input —
                Notion's preset options. Same ctx data as the panel rows; an
                offer that fills the composer, never a command. */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              {ctx.suggestions.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  data-testid="home-suggestion-card"
                  onClick={() => fillComposer(s.text)}
                  className="text-left px-3 py-2.5 rounded-[var(--radius-card)] border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-[rgb(var(--accent)/0.45)] hover:bg-[var(--surface-sunken)] transition-colors flex items-center gap-2.5"
                >
                  <Icon name={s.icon} size={15} className="text-accent shrink-0" />
                  <span className="fb-t-label text-[var(--ink-80)] truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end mt-1.5">
          <span className="fb-t-caption font-mono text-[var(--ink-40)]">
            ↵ send · ⇧↵ newline
          </span>
        </div>
        </div>
      </form>
      </div>
      </div>
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
