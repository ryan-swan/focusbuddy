import { create } from 'zustand'
import type {
  ActionProposal,
  AiChatConversationMeta,
  AppliedProposal,
  ChatMessage
} from '@shared/types'
import { gatherCanvasAttachments } from '../lib/canvasContent'
import { gatherWorkspaceSnapshot } from '../lib/workspaceSnapshot'
import { useNodeStore } from './nodes'
import { useDocumentsStore } from './documents'

// Persisted, free-standing chat store for the Focus Mode "AI Chat" tab.
//
// Distinct from useChatStore (the canvas side-panel assistant, in-memory + task-
// scoped, deliberately left unchanged). This store owns:
//   • the ACTIVE conversation (a real id, created lazily on first send),
//   • its messages + per-message proposals + applied-card state,
//   • persistence to local SQLite via window.api.aiChat (survives restart),
//   • the history list, so past conversations can be opened.
// It reuses the existing chat backend (window.api.chat.send) for the model call;
// only the storage + conversation model are new here.

interface FocusChatStore {
  // The open conversation's id, or null before the first message is sent (a
  // fresh, unsaved chat). Created lazily so an empty new chat isn't persisted.
  activeConversationId: string | null
  messages: ChatMessage[]
  proposalsByMessage: Record<string, ActionProposal[]>
  // Applied-card state keyed by "<messageTs>::<proposalId>" so two messages that
  // happen to contain a proposal with the same id (e.g. a model-supplied
  // "tbl-1") never share or clobber each other's green state.
  appliedProposals: Record<string, AppliedProposal>
  // The persisted message id for each message ts, so applied-state writes target
  // the row by its unique id rather than a Date.now() ts that can collide.
  messageIdByTs: Record<string, string>
  sending: boolean
  hasApiKey: boolean | null
  // Guards the lazy first-message conversation creation so two rapid sends can't
  // each create a conversation.
  creatingConversation: boolean
  // The history list (metadata only), refreshed on demand.
  conversations: AiChatConversationMeta[]

  checkApiKey: () => Promise<void>
  refreshConversations: () => Promise<void>
  // Start a brand-new, empty (unsaved) conversation.
  newConversation: () => void
  // Load a persisted conversation by id into the active view.
  openConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  send: (content: string) => Promise<void>
  // Record an approved card (persisted so the green card survives restart).
  markProposalApplied: (
    messageTs: number,
    proposalId: string,
    applied: AppliedProposal
  ) => Promise<void>
  consumeProposal: (messageTs: number, proposalId: string) => void
}

// Composite key for applied-state: unique per (message, proposal).
const appliedKey = (messageTs: number, proposalId: string): string => `${messageTs}::${proposalId}`

export const useFocusChatStore = create<FocusChatStore>((set, get) => ({
  activeConversationId: null,
  messages: [],
  proposalsByMessage: {},
  appliedProposals: {},
  messageIdByTs: {},
  sending: false,
  hasApiKey: null,
  creatingConversation: false,
  conversations: [],

  checkApiKey: async () => {
    const has = await window.api.chat.hasApiKey()
    set({ hasApiKey: has })
  },

  refreshConversations: async () => {
    const list = await window.api.aiChat.listConversations()
    set({ conversations: list })
  },

  newConversation: () => {
    set({
      activeConversationId: null,
      messages: [],
      proposalsByMessage: {},
      appliedProposals: {},
      messageIdByTs: {}
    })
  },

  openConversation: async (id) => {
    const conv = await window.api.aiChat.getConversation(id)
    if (!conv) return
    const messages: ChatMessage[] = conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ts: m.ts
    }))
    const proposalsByMessage: Record<string, ActionProposal[]> = {}
    const appliedProposals: Record<string, AppliedProposal> = {}
    const messageIdByTs: Record<string, string> = {}
    for (const m of conv.messages) {
      messageIdByTs[String(m.ts)] = m.id
      if (m.proposals.length) proposalsByMessage[String(m.ts)] = m.proposals
      // Stored applied is per-message keyed by proposalId; re-key with the
      // message ts so two messages' identical proposal ids never collide.
      for (const [proposalId, applied] of Object.entries(m.applied)) {
        appliedProposals[appliedKey(m.ts, proposalId)] = applied
      }
    }
    set({
      activeConversationId: id,
      messages,
      proposalsByMessage,
      appliedProposals,
      messageIdByTs
    })
  },

  deleteConversation: async (id) => {
    await window.api.aiChat.deleteConversation(id)
    // If we deleted the open one, drop to a fresh chat.
    if (get().activeConversationId === id) get().newConversation()
    await get().refreshConversations()
  },

  send: async (content) => {
    const text = content.trim()
    // Guard against a re-entrant send (rapid ⌘⏎) BOTH while a turn is in flight
    // and while the first-message conversation is still being created — without
    // the second guard, two fast sends on a fresh chat would each create a
    // conversation and split the turns across duplicates.
    if (!text || get().sending || get().creatingConversation) return

    // Lazily create the conversation on the first message so empty chats never
    // clutter history. Hold creatingConversation across the round-trip so a
    // concurrent send waits (returns early) rather than creating a second one.
    // CRITICAL: persistence is best-effort and must NEVER block the chat. If the
    // conversation can't be created (DB unavailable, etc.), we log and continue
    // with convId=null — the turn still renders and the model still answers; only
    // the on-disk history is skipped. A throw here previously killed send() before
    // the user's message was even added, so nothing appeared at all.
    let convId = get().activeConversationId
    const taskId = useNodeStore.getState().activeTaskId
    if (!convId) {
      set({ creatingConversation: true })
      try {
        const meta = await window.api.aiChat.createConversation({
          taskId,
          title: text.slice(0, 60)
        })
        convId = meta.id
        set({ activeConversationId: convId })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[focusChat] could not create conversation (continuing unsaved)', e)
      } finally {
        set({ creatingConversation: false })
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() }
    set({ messages: [...get().messages, userMsg], sending: true })
    // Persist the user turn immediately (best-effort), recording its message id.
    if (convId) {
      const savedUser = await window.api.aiChat
        .appendMessage(convId, { role: 'user', content: text, ts: userMsg.ts })
        .catch(() => null)
      if (savedUser) {
        set({ messageIdByTs: { ...get().messageIdByTs, [String(userMsg.ts)]: savedUser.id } })
      }
    }

    // Gather live context (same as the side-panel path).
    let attachments: Awaited<ReturnType<typeof gatherCanvasAttachments>> = []
    try {
      attachments = await gatherCanvasAttachments(taskId)
    } catch {
      attachments = []
    }
    let workspace: ReturnType<typeof gatherWorkspaceSnapshot> | undefined
    try {
      if (useDocumentsStore.getState().list.length === 0) {
        await useDocumentsStore.getState().refresh().catch(() => {})
      }
      workspace = gatherWorkspaceSnapshot()
    } catch {
      workspace = undefined
    }

    const resp = await window.api.chat.send({
      taskId,
      messages: [...get().messages],
      attachments,
      workspace
    })

    let assistant: ChatMessage
    let proposals: ActionProposal[] | undefined
    if (resp.ok && resp.message) {
      assistant = resp.message
      proposals = resp.proposals
    } else {
      assistant = { role: 'assistant', content: resp.error ?? 'Something went wrong.', ts: Date.now() }
    }

    const nextProposals = { ...get().proposalsByMessage }
    if (proposals && proposals.length) nextProposals[String(assistant.ts)] = proposals
    set({
      messages: [...get().messages, assistant],
      proposalsByMessage: nextProposals,
      sending: false
    })
    // Persist the assistant turn + its proposals (best-effort), recording its
    // message id so a later applied-state write targets the row by its unique id.
    if (convId) {
      const savedAssistant = await window.api.aiChat
        .appendMessage(convId, {
          role: assistant.role,
          content: assistant.content,
          ts: assistant.ts,
          proposals: proposals && proposals.length ? proposals : undefined
        })
        .catch(() => null)
      if (savedAssistant) {
        set({ messageIdByTs: { ...get().messageIdByTs, [String(assistant.ts)]: savedAssistant.id } })
      }
      await get().refreshConversations().catch(() => {})
    }
  },

  markProposalApplied: async (messageTs, proposalId, applied) => {
    // Store under the composite (message, proposal) key so identical proposal
    // ids on different messages never collide.
    const next = { ...get().appliedProposals, [appliedKey(messageTs, proposalId)]: applied }
    set({ appliedProposals: next })
    const convId = get().activeConversationId
    if (!convId) return
    // Persist this message's full applied subset, keyed by proposalId (the DB
    // stores per-message), addressed by the message's unique id.
    const msgProposals = get().proposalsByMessage[String(messageTs)] ?? []
    const forMsg: Record<string, AppliedProposal> = {}
    for (const p of msgProposals) {
      const a = next[appliedKey(messageTs, p.id)]
      if (a) forMsg[p.id] = a
    }
    const messageId = get().messageIdByTs[String(messageTs)]
    // Without a persisted message id we can't safely target the row (id is
    // unique; ts can collide) — keep the in-memory green state, skip the write.
    if (!messageId) return
    await window.api.aiChat.setMessageApplied(convId, messageId, forMsg).catch(() => {})
  },

  consumeProposal: (messageTs, proposalId) => {
    const key = String(messageTs)
    const current = get().proposalsByMessage[key] ?? []
    const filtered = current.filter((p) => p.id !== proposalId)
    const next = { ...get().proposalsByMessage }
    if (filtered.length === 0) delete next[key]
    else next[key] = filtered
    // Delete only THIS message's applied entry (composite key), not every
    // message that happens to share the proposal id.
    const nextApplied = { ...get().appliedProposals }
    delete nextApplied[appliedKey(messageTs, proposalId)]
    set({ proposalsByMessage: next, appliedProposals: nextApplied })
  }
}))

// Expose the persisted Focus-chat store on window so e2e specs can drive it
// without a live model call (the harness strips the API key). A thin handle to
// the real store.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbFocusChat?: typeof useFocusChatStore }).__fbFocusChat =
    useFocusChatStore
}
