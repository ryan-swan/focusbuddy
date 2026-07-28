import { create } from 'zustand'
import type { ActionProposal, AppliedProposal, ChatMessage } from '@shared/types'
import { recordTrail } from '../lib/trail'
import { gatherCanvasAttachments } from '../lib/canvasContent'

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
  send: async (taskId, content, threadKey) => {
    const key = threadKey ?? taskId ?? GLOBAL_KEY
    const current = get().messagesByTask[key] ?? []
    const userMsg: ChatMessage = { role: 'user', content, ts: Date.now() }
    const next = [...current, userMsg]
    set({
      messagesByTask: { ...get().messagesByTask, [key]: next },
      sending: true
    })
    recordTrail('chat_sent', taskId, { preview: content.slice(0, 200) })
    // Gather any browser/doc/pdf content the user has open so the assistant can
    // act on it (e.g. create calendar events from a booking page). Best-effort:
    // a failure here must never block the message.
    let attachments: Awaited<ReturnType<typeof gatherCanvasAttachments>> = []
    try {
      attachments = await gatherCanvasAttachments(taskId)
    } catch {
      attachments = []
    }
    const resp = await window.api.chat.send({ taskId, messages: next, attachments })
    let final: ChatMessage[]
    let proposals: ActionProposal[] | undefined
    if (resp.ok && resp.message) {
      final = [...next, resp.message]
      proposals = resp.proposals
    } else {
      final = [
        ...next,
        {
          role: 'assistant',
          content: resp.error ?? 'Something went wrong.',
          ts: Date.now()
        }
      ]
    }
    const updates: Partial<ChatStore> = {
      messagesByTask: { ...get().messagesByTask, [key]: final },
      sending: false
    }
    if (proposals && proposals.length > 0) {
      const tsKey = String(final[final.length - 1].ts)
      updates.proposalsByMessage = {
        ...get().proposalsByMessage,
        [tsKey]: proposals
      }
    }
    set(updates)
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
    for (const m of cleared) {
      for (const p of nextProposals[String(m.ts)] ?? []) {
        delete nextApplied[appliedKey(m.ts, p.id)]
      }
      delete nextProposals[String(m.ts)]
    }
    set({
      messagesByTask: next,
      proposalsByMessage: nextProposals,
      appliedProposals: nextApplied
    })
  }
}))
