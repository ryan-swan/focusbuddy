import { create } from 'zustand'
import type {
  ActionProposal,
  AppliedProposal,
  ChatMessage,
  ChatQuestion,
  ChatResponse,
  ChatSource
} from '@shared/types'
import { recordTrail } from '../lib/trail'
import { gatherCanvasAttachments } from '../lib/canvasContent'
import type { AssistantTrace } from '../lib/traceView'
import {
  activeMentions,
  addMention,
  clearConversationMentions,
  mergeMentionResolution,
  removeMention,
  toWireMentions,
  type MentionRef,
  type MentionResolution
} from '../lib/assistantMentions'

// Enough of an assistant context to keep showing a conversation after you have
// navigated away from where it started: which thread it is, what to call it, and
// the task the server should scope it to.
export interface PinnedThread {
  key: string
  label: string
  title: string
  icon: string
  serverTaskId: string | null
}

function newTrace(): AssistantTrace {
  return {
    status: 'running',
    startedAt: Date.now(),
    retrievedAt: null,
    retrievalMs: null,
    repliedAt: null,
    completedAt: null,
    mentions: [],
    sources: [],
    tools: [],
    error: null
  }
}

// Applied proposals are keyed by "<messageTs>::<proposalId>" — the same
// composite key the persisted Focus chat uses — so two different messages can
// each carry a proposal with the same id without colliding. The renderer slices
// this down to a plain {proposalId: AppliedProposal} map per message before
// handing it to ProposalCards, which stays store-shape agnostic.
export function appliedKey(messageTs: number, proposalId: string): string {
  return `${messageTs}::${proposalId}`
}

interface ChatStore {
  messagesByTask: Record<string, ChatMessage[]>
  // Action proposals attached to an assistant message. Keyed by the message's
  // timestamp (unique within a conversation). When the user applies or
  // dismisses every proposal in a set, the entry is removed.
  proposalsByMessage: Record<string, ActionProposal[]>
  // Approved proposals, keyed by appliedKey(). An applied card is NOT removed
  // from the thread — it stays as a durable green record with a "Go to", so the
  // conversation reads as a log of what actually happened rather than a
  // transcript that eats its own actions.
  appliedProposals: Record<string, AppliedProposal>
  // The workspace material each assistant answer was grounded on, keyed by the
  // message timestamp. Rendered as numbered chips matching the [n] markers in
  // the reply. Retrieval already ran server-side to build the prompt — this is
  // the same set, surfaced rather than discarded.
  sourcesByMessage: Record<string, ChatSource[]>
  // The trace for the send currently in flight, keyed by thread. Lives here
  // rather than under a message id because it starts before there IS a message —
  // the first thing it shows is retrieval, which happens before a word is
  // written. On completion it moves to traceByMessage under the answer's ts.
  liveTraceByThread: Record<string, AssistantTrace>
  // Finished traces, keyed by the assistant message's timestamp, so a completed
  // turn can still show its collapsed "3 sources · 2 tools" summary.
  traceByMessage: Record<string, AssistantTrace>
  // Whether each finished trace is open or shut. Lives here rather than in the
  // component because the panel unmounts whenever you navigate away: local state
  // would mean a trace you closed comes back open — and replays its reveal —
  // every single time you return to the page.
  traceDisclosureByMessage: Record<string, 'open' | 'closed'>
  setTraceDisclosure: (messageTs: number, state: 'open' | 'closed') => void
  // Follow-up questions the model asked, keyed by the asking message's
  // timestamp. Store-held for the same reason as trace disclosure: the panel
  // unmounts on navigation, and a question must neither vanish nor resurrect
  // because you changed screens. The card renders only while its message is
  // the LAST in the thread — answering appends a user turn, which un-lasts the
  // question without deleting the record; a rewind that makes it last again
  // honestly re-opens it, because in that history it is still unanswered.
  questionByMessage: Record<string, ChatQuestion>
  // Dismiss (the card's ×): the user declined to answer. Deletes the record so
  // the question never comes back, even if its message becomes last again.
  dismissQuestion: (messageTs: number) => void
  // A conversation the panel holds onto across navigation.
  //
  // The assistant normally re-threads per screen (see lib/assistantContext) — a
  // desk, a document and a room each get their own conversation. That is right
  // when YOU changed screen, and wrong when the ASSISTANT did: following a
  // citation would otherwise swap the conversation you were having for the
  // destination's, mid-thought. Pinning keeps the thread you were in until you
  // choose the current page instead.
  pinnedThread: PinnedThread | null
  pinThread: (thread: PinnedThread) => void
  unpinThread: () => void
  // The workspace objects this conversation references (Phase 4.3). One layer
  // for BOTH gestures: typing "@" and clicking a widget produce the same kind
  // of chip (plan D7), all chips are equal, and all are sticky to the
  // CONVERSATION until dismissed (plan D8) — 3a.1's single pinnedWidget
  // generalised to N typed references.
  //
  // Distinct from pinnedThread above, which pins a CONVERSATION across
  // navigation — this pins reference MATERIAL to a conversation.
  mentions: MentionRef[]
  addMentionRef: (ref: MentionRef) => { added: boolean; rejectedForCap: boolean }
  removeMentionRef: (conversationKey: string, key: string) => void
  // What the main process reported each reference actually produced. The sole
  // basis for rendering a chip as broken — the renderer never assumes a
  // reference resolved just because it was sent.
  mentionResolution: MentionResolution
  // The references a given user turn was sent with, keyed by its timestamp, so
  // a past message can re-draw its chips inline exactly where they were typed
  // (plan P1's first rendering). Kept per message rather than derived, because
  // the conversation's live set changes and the transcript must not.
  mentionsByMessage: Record<string, MentionRef[]>
  sending: boolean
  hasApiKey: boolean | null
  checkApiKey: () => Promise<void>
  getMessages: (taskId: string | null) => ChatMessage[]
  getProposals: (messageTs: number) => ActionProposal[]
  // Record that a proposal was approved and applied to the workspace.
  markProposalApplied: (
    messageTs: number,
    proposalId: string,
    applied: AppliedProposal
  ) => void
  // Drop one proposal from a message's set (dismissed, or applied on a surface
  // with no applied-state).
  consumeProposal: (messageTs: number, proposalId: string) => void
  // Truncate a thread to its first `keepCount` messages, discarding the
  // proposals, applied records and sources that hung off the dropped ones.
  // Backs "retry": rewind to just before a question, then re-send it.
  rewindTo: (threadKey: string, keepCount: number) => void
  // threadKey scopes the conversation thread (the context the assistant is in).
  // When omitted it falls back to taskId, preserving existing desk behaviour. The
  // real taskId is still what's sent to the server for task context.
  send: (taskId: string | null, content: string, threadKey?: string) => Promise<void>
  sendProactiveWelcome: (taskId: string) => Promise<void>
  // Push a synthetic assistant message into the conversation. Used by "What was I doing?"
  // and other AI features that produce output without a user prompt.
  pushAssistantMessage: (taskId: string | null, content: string) => void
  clear: (taskId: string | null) => void
}

const GLOBAL_KEY = '__global__'
const EMPTY_MESSAGES: ChatMessage[] = []

const EMPTY_PROPOSALS: ActionProposal[] = []

export const useChatStore = create<ChatStore>((set, get) => ({
  messagesByTask: {},
  proposalsByMessage: {},
  appliedProposals: {},
  sourcesByMessage: {},
  liveTraceByThread: {},
  traceByMessage: {},
  traceDisclosureByMessage: {},
  questionByMessage: {},
  pinnedThread: null,
  setTraceDisclosure: (messageTs, state) => {
    set({
      traceDisclosureByMessage: {
        ...get().traceDisclosureByMessage,
        [String(messageTs)]: state
      }
    })
  },
  dismissQuestion: (messageTs) => {
    const next = { ...get().questionByMessage }
    delete next[String(messageTs)]
    set({ questionByMessage: next })
  },
  pinThread: (thread) => set({ pinnedThread: thread }),
  unpinThread: () => set({ pinnedThread: null }),
  mentions: [],
  mentionResolution: {},
  mentionsByMessage: {},
  addMentionRef: (ref) => {
    const r = addMention(get().mentions, ref)
    if (r.added) set({ mentions: r.mentions })
    return { added: r.added, rejectedForCap: r.rejectedForCap }
  },
  removeMentionRef: (conversationKey, key) => {
    set({ mentions: removeMention(get().mentions, conversationKey, key) })
  },
  sending: false,
  hasApiKey: null,
  checkApiKey: async () => {
    const has = await window.api.chat.hasApiKey()
    set({ hasApiKey: has })
  },
  getMessages: (taskId) => {
    const key = taskId ?? GLOBAL_KEY
    return get().messagesByTask[key] ?? EMPTY_MESSAGES
  },
  getProposals: (messageTs) => {
    return get().proposalsByMessage[String(messageTs)] ?? EMPTY_PROPOSALS
  },
  markProposalApplied: (messageTs, proposalId, applied) => {
    set({
      appliedProposals: {
        ...get().appliedProposals,
        [appliedKey(messageTs, proposalId)]: applied
      }
    })
  },
  consumeProposal: (messageTs, proposalId) => {
    const key = String(messageTs)
    const current = get().proposalsByMessage[key] ?? []
    const filtered = current.filter((p) => p.id !== proposalId)
    const next = { ...get().proposalsByMessage }
    if (filtered.length === 0) {
      delete next[key]
    } else {
      next[key] = filtered
    }
    // Drop any applied record for the removed proposal so the two maps can't
    // drift (a dismissed card must not leave an orphan green record behind).
    const nextApplied = { ...get().appliedProposals }
    delete nextApplied[appliedKey(messageTs, proposalId)]
    set({ proposalsByMessage: next, appliedProposals: nextApplied })
  },
  rewindTo: (threadKey, keepCount) => {
    const current = get().messagesByTask[threadKey] ?? []
    if (keepCount >= current.length) return
    const dropped = current.slice(Math.max(0, keepCount))
    const nextProposals = { ...get().proposalsByMessage }
    const nextApplied = { ...get().appliedProposals }
    const nextSources = { ...get().sourcesByMessage }
    const nextTraces = { ...get().traceByMessage }
    const nextDisclosure = { ...get().traceDisclosureByMessage }
    const nextQuestions = { ...get().questionByMessage }
    const nextMentionsByMessage = { ...get().mentionsByMessage }
    for (const m of dropped) {
      for (const p of nextProposals[String(m.ts)] ?? []) {
        delete nextApplied[appliedKey(m.ts, p.id)]
      }
      delete nextProposals[String(m.ts)]
      delete nextSources[String(m.ts)]
      delete nextTraces[String(m.ts)]
      delete nextDisclosure[String(m.ts)]
      delete nextQuestions[String(m.ts)]
      delete nextMentionsByMessage[String(m.ts)]
    }
    // A rewind is the front half of a retry, so any trace still running for this
    // thread describes work the user just discarded. Drop it too.
    const nextLive = { ...get().liveTraceByThread }
    delete nextLive[threadKey]
    set({
      messagesByTask: {
        ...get().messagesByTask,
        [threadKey]: current.slice(0, Math.max(0, keepCount))
      },
      proposalsByMessage: nextProposals,
      appliedProposals: nextApplied,
      sourcesByMessage: nextSources,
      traceByMessage: nextTraces,
      traceDisclosureByMessage: nextDisclosure,
      questionByMessage: nextQuestions,
      mentionsByMessage: nextMentionsByMessage,
      liveTraceByThread: nextLive
    })
  },
  send: async (taskId, content, threadKey) => {
    const key = threadKey ?? taskId ?? GLOBAL_KEY
    const current = get().messagesByTask[key] ?? []
    const userMsg: ChatMessage = { role: 'user', content, ts: Date.now() }
    const next = [...current, userMsg]
    set({
      messagesByTask: { ...get().messagesByTask, [key]: next },
      liveTraceByThread: { ...get().liveTraceByThread, [key]: newTrace() },
      sending: true
    })
    recordTrail('chat_sent', taskId, { preview: content.slice(0, 200) })
    // The conversation's references ride every message on it, and a send does
    // NOT clear them (plan D8) — "referenced in the conversation", not in one
    // message. Recorded against this turn as well, so the transcript can draw
    // the chips back inline where they were typed.
    const refs = activeMentions(get().mentions, key)
    const wireMentions = refs.length > 0 ? toWireMentions(refs) : undefined
    if (refs.length > 0) {
      set({ mentionsByMessage: { ...get().mentionsByMessage, [String(userMsg.ts)]: refs } })
    }
    // A referenced widget that happens to live on the desk in front of us is
    // also force-included through the canvas path, exactly as the 3a.1 pin was,
    // so its LIVE text (a rendered browser page the main process cannot read)
    // still rides. Off-desk references are resolved in main instead.
    const localWidget = refs.find((m) => m.kind === 'widget' && (!taskId || m.taskId === taskId))
    const pinnedWidgetId = localWidget?.id
    // Gather any browser/doc/pdf content the user has open so the assistant can
    // act on it (e.g. create calendar events from a booking page). Best-effort:
    // a failure here must never block the message.
    let attachments: Awaited<ReturnType<typeof gatherCanvasAttachments>> = []
    try {
      attachments = await gatherCanvasAttachments(taskId, pinnedWidgetId)
    } catch {
      attachments = []
    }

    // Merge a patch into the in-flight trace. A no-op once the trace has been
    // moved to traceByMessage or cleared, so a late event from a request the
    // user has already walked away from can't resurrect it.
    const patchTrace = (patch: Partial<AssistantTrace>): void => {
      const live = get().liveTraceByThread[key]
      if (!live) return
      set({ liveTraceByThread: { ...get().liveTraceByThread, [key]: { ...live, ...patch } } })
    }

    // The prose lands (and is shown) the moment the reply field closes, which is
    // before the actions have finished streaming. `answerTs` is the message we
    // appended then, so `complete` updates that same turn in place instead of
    // appending a second one.
    let answerTs: number | null = null
    const appendAnswer = (text: string): number => {
      const ts = Date.now()
      answerTs = ts
      const thread = get().messagesByTask[key] ?? next
      set({
        messagesByTask: {
          ...get().messagesByTask,
          [key]: [...thread, { role: 'assistant', content: text, ts }]
        }
      })
      return ts
    }

    // Land the finished response and retire the trace onto the answer's turn.
    const settle = (resp: ChatResponse): void => {
      let ts = answerTs
      if (ts === null) {
        // Nothing has been shown yet: the finished reply (or the error) becomes
        // the turn.
        ts = appendAnswer(resp.ok && resp.message ? resp.message.content : (resp.error ?? 'Something went wrong.'))
      } else if (resp.ok && resp.message && resp.message.content !== '') {
        // Prose is already on screen. Rewrite it only when the finished response
        // differs — it gains a notice when the model was truncated mid-actions.
        // A FAILED response never overwrites prose that really arrived; the
        // failure is recorded on the trace instead.
        const thread = get().messagesByTask[key] ?? []
        const at = thread.findIndex((m) => m.ts === ts)
        if (at >= 0 && thread[at].content !== resp.message.content) {
          const copy = thread.slice()
          copy[at] = { ...copy[at], content: resp.message.content }
          set({ messagesByTask: { ...get().messagesByTask, [key]: copy } })
        }
      }
      const tsKey = String(ts)
      const live = get().liveTraceByThread[key]
      const updates: Partial<ChatStore> = { sending: false }
      if (resp.ok && resp.proposals && resp.proposals.length > 0) {
        updates.proposalsByMessage = { ...get().proposalsByMessage, [tsKey]: resp.proposals }
      }
      // The full retrieved set. Which of these the answer actually cites is
      // derived from the [n] markers in the prose at render time — retrieval is
      // not grounding, and only grounding earns a chip.
      if (resp.ok && resp.sources && resp.sources.length > 0) {
        updates.sourcesByMessage = { ...get().sourcesByMessage, [tsKey]: resp.sources }
      }
      // The durable response is the sole source of truth for a question — the
      // renderer must never show one the completed envelope does not carry.
      if (resp.ok && resp.question) {
        updates.questionByMessage = { ...get().questionByMessage, [tsKey]: resp.question }
      }
      // What each reference genuinely produced, straight from the response. A
      // chip is marked broken on this basis and no other.
      if (resp.mentions && resp.mentions.length > 0) {
        updates.mentionResolution = mergeMentionResolution(get().mentionResolution, resp.mentions)
      }
      if (live) {
        const nextLive = { ...get().liveTraceByThread }
        delete nextLive[key]
        updates.liveTraceByThread = nextLive
        updates.traceByMessage = {
          ...get().traceByMessage,
          [tsKey]: {
            ...live,
            status: resp.ok ? 'done' : 'error',
            error: resp.ok ? live.error : (resp.error ?? 'Something went wrong.'),
            completedAt: Date.now()
          }
        }
      }
      set(updates)
    }

    // Streaming is the normal path. The non-streaming `chat:send` stays wired as
    // the fallback for a renderer talking to a preload that predates it — in
    // practice, an Electron process still running the old preload after a code
    // change, because a released build ships both together.
    //
    // The fallback is LOUD on purpose. It degrades the headline behaviour: no
    // events means no trace, and the panel then looks exactly like a trace that
    // doesn't work rather than one that was never fed. This warning is the
    // difference between "restart the app" and an hour of debugging. (ART-0 in
    // assistantRetrievalTrace.spec.ts locks the surface so CI catches it too.)
    const api = window.api.chat
    if (typeof api.sendStream !== 'function') {
      console.warn(
        '[assistant] window.api.chat.sendStream is missing — falling back to the ' +
          'non-streaming chat:send. The retrieval trace needs the streaming ' +
          'transport and will not render. This almost always means the Electron ' +
          'process is running an older preload bundle: restart it (npm run dev).'
      )
      // supportsQuestions: this panel renders the question card, so the model
      // is allowed to ask here — the one surface that opts in.
      const resp = await api.send({
        taskId,
        messages: next,
        attachments,
        supportsQuestions: true,
        pinnedWidgetId,
        mentions: wireMentions
      })
      settle(resp)
      return
    }

    const requestId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    await new Promise<void>((resolve) => {
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        cleanup()
        resolve()
      }
      const cleanup = api.sendStream(
        {
          taskId,
          messages: next,
          attachments,
          requestId,
          supportsQuestions: true,
          pinnedWidgetId,
          mentions: wireMentions
        },
        {
          onMentions: (m) => {
            patchTrace({ mentions: m })
            // Same verdicts the completed response carries, applied as soon as
            // they are known so a broken chip does not wait for the answer.
            set({ mentionResolution: mergeMentionResolution(get().mentionResolution, m) })
          },
          onSources: (t) => patchTrace({ retrievedAt: Date.now(), retrievalMs: t.elapsedMs, sources: t.sources }),
          onReply: (text) => {
            patchTrace({ repliedAt: Date.now() })
            if (answerTs === null && text.trim()) appendAnswer(text)
          },
          onTool: (tool) => {
            const live = get().liveTraceByThread[key]
            if (!live) return
            patchTrace({ tools: [...live.tools, tool] })
          },
          onError: (err) => {
            // Prose that already landed is real work and stays on screen — the
            // failure came after it. settle() keeps that message and marks the
            // trace failed, so the phases end red rather than finishing green on
            // a request that broke. With no prose yet, the error becomes the turn.
            settle({ ok: false, error: err.error })
            finish()
          },
          onComplete: (resp) => {
            settle(resp)
            finish()
          }
        }
      )
    })
  },
  sendProactiveWelcome: async (taskId) => {
    if (get().hasApiKey === false) return
    const existing = get().messagesByTask[taskId] ?? []
    if (existing.length > 0) return // user already in a conversation about this task
    const resp = await window.api.chat.proactiveWelcome(taskId)
    if (resp.ok && resp.message) {
      const current = get().messagesByTask[taskId] ?? []
      // Race guard: if the user typed something in the meantime, append after their messages
      set({
        messagesByTask: { ...get().messagesByTask, [taskId]: [...current, resp.message] }
      })
    }
  },
  pushAssistantMessage: (taskId, content) => {
    const key = taskId ?? GLOBAL_KEY
    const current = get().messagesByTask[key] ?? []
    set({
      messagesByTask: {
        ...get().messagesByTask,
        [key]: [...current, { role: 'assistant', content, ts: Date.now() }]
      }
    })
  },
  clear: (taskId) => {
    const key = taskId ?? GLOBAL_KEY
    const cleared = get().messagesByTask[key] ?? []
    const next = { ...get().messagesByTask }
    delete next[key]
    // Clearing a thread must also drop the proposals and applied records that
    // hung off its messages, or they accumulate forever keyed to timestamps
    // whose conversation no longer exists.
    const nextProposals = { ...get().proposalsByMessage }
    const nextApplied = { ...get().appliedProposals }
    const nextSources = { ...get().sourcesByMessage }
    const nextTraces = { ...get().traceByMessage }
    const nextDisclosure = { ...get().traceDisclosureByMessage }
    const nextQuestions = { ...get().questionByMessage }
    const nextMentionsByMessage = { ...get().mentionsByMessage }
    for (const m of cleared) {
      for (const p of nextProposals[String(m.ts)] ?? []) {
        delete nextApplied[appliedKey(m.ts, p.id)]
      }
      delete nextProposals[String(m.ts)]
      delete nextSources[String(m.ts)]
      delete nextTraces[String(m.ts)]
      delete nextDisclosure[String(m.ts)]
      delete nextQuestions[String(m.ts)]
      delete nextMentionsByMessage[String(m.ts)]
    }
    const nextLive = { ...get().liveTraceByThread }
    delete nextLive[key]
    set({
      messagesByTask: next,
      proposalsByMessage: nextProposals,
      appliedProposals: nextApplied,
      sourcesByMessage: nextSources,
      traceByMessage: nextTraces,
      traceDisclosureByMessage: nextDisclosure,
      questionByMessage: nextQuestions,
      mentionsByMessage: nextMentionsByMessage,
      liveTraceByThread: nextLive,
      // A cleared thread has nothing left to follow you around — and nothing
      // left referencing it.
      pinnedThread: get().pinnedThread?.key === key ? null : get().pinnedThread,
      mentions: clearConversationMentions(get().mentions, key)
    })
  }
}))
