import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type {
  ActionProposal,
  AiChatConversation,
  AiChatConversationContext,
  AiChatConversationMeta,
  AiChatStoredMessage,
  AppliedProposal,
  ChatMentionRef,
  ChatQuestion,
  ChatRole,
  ChatSource,
  StoredTrace
} from '@shared/types'

// Local persistence for the AI-assistant chat: free-standing conversations and
// their messages, mirroring the documents.ts pattern (Row interfaces, rowTo
// mappers, prepared statements, org scoping). Assistant turns persist their
// proposals + which cards were approved, so the green "done" cards survive a
// restart. Purely local — no cloud sync, no auth.

interface ConversationRow {
  id: string
  org_id: string
  task_id: string | null
  title: string
  created_at: number
  updated_at: number
  // Phase 4.5: the screen this conversation was started from. NULL on every row
  // written before unification, which is honest — those conversations genuinely
  // do not know, and the UI says nothing rather than guessing.
  context_json: string | null
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  ts: number
  proposals_json: string | null
  applied_json: string | null
  // Phase 4.5 — the four things the panel held per turn that persistence did
  // not. NULL means the turn genuinely had none.
  sources_json: string | null
  question_json: string | null
  trace_json: string | null
  mentions_json: string | null
  created_at: number
}

function rowToMeta(
  row: ConversationRow,
  extras?: { messageCount?: number; preview?: string }
): AiChatConversationMeta {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    context: safeParse<AiChatConversationContext | null>(row.context_json, null),
    messageCount: extras?.messageCount,
    preview: extras?.preview
  }
}

// Exported for unit testing — robust JSON parse that never throws on a corrupt
// or legacy column value.
export function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// True when the conversation exists AND belongs to the active org. Every write
// path gates on this so an arbitrary conversationId arriving over IPC can never
// mutate another org's conversation (ai_chat_messages has no org_id of its own).
function conversationOwnedByActiveOrg(conversationId: string): boolean {
  const db = getDb()
  const row = db
    .prepare(`SELECT 1 FROM ai_chat_conversations WHERE id = ? AND org_id = ?`)
    .get(conversationId, getActiveOrgId())
  return !!row
}

// Coerce a stored role string to a valid ChatRole; an unexpected value (a bad
// or legacy row) falls back to 'assistant' so the renderer never sees garbage.
// Exported for unit testing.
export function toChatRole(raw: string): ChatRole {
  return raw === 'user' || raw === 'assistant' || raw === 'system' ? raw : 'assistant'
}

function rowToMessage(row: MessageRow): AiChatStoredMessage {
  return {
    id: row.id,
    role: toChatRole(row.role),
    content: row.content,
    ts: row.ts,
    proposals: safeParse<ActionProposal[]>(row.proposals_json, []),
    applied: safeParse<Record<string, AppliedProposal>>(row.applied_json, {}),
    sources: safeParse<ChatSource[]>(row.sources_json, []),
    question: safeParse<ChatQuestion | null>(row.question_json, null),
    trace: safeParse<StoredTrace | null>(row.trace_json, null),
    mentions: safeParse<ChatMentionRef[]>(row.mentions_json, [])
  }
}

/** All conversations for the active org, newest-updated first, with a preview. */
export function listConversations(): AiChatConversationMeta[] {
  const db = getDb()
  const org = getActiveOrgId()
  const rows = db
    .prepare(
      `SELECT id, org_id, task_id, title, created_at, updated_at, context_json
       FROM ai_chat_conversations WHERE org_id = ? ORDER BY updated_at DESC`
    )
    .all(org) as ConversationRow[]
  const countStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_chat_messages WHERE conversation_id = ?`
  )
  const previewStmt = db.prepare(
    `SELECT content FROM ai_chat_messages
     WHERE conversation_id = ? AND role = 'user' ORDER BY ts ASC LIMIT 1`
  )
  return rows.map((r) => {
    const { n } = countStmt.get(r.id) as { n: number }
    const first = previewStmt.get(r.id) as { content: string } | undefined
    return rowToMeta(r, { messageCount: n, preview: first?.content?.slice(0, 120) })
  })
}

/** One conversation with all its messages (ascending by ts), or null. */
export function getConversation(id: string): AiChatConversation | null {
  const db = getDb()
  const org = getActiveOrgId()
  const row = db
    .prepare(
      `SELECT id, org_id, task_id, title, created_at, updated_at, context_json
       FROM ai_chat_conversations WHERE id = ? AND org_id = ?`
    )
    .get(id, org) as ConversationRow | undefined
  if (!row) return null
  const msgRows = db
    .prepare(
      `SELECT id, conversation_id, role, content, ts, proposals_json, applied_json,
              sources_json, question_json, trace_json, mentions_json, created_at
       FROM ai_chat_messages WHERE conversation_id = ? ORDER BY ts ASC`
    )
    .all(id) as MessageRow[]
  return { meta: rowToMeta(row), messages: msgRows.map(rowToMessage) }
}

/** Create an empty conversation and return its meta. */
export function createConversation(input: {
  taskId: string | null
  title?: string
  // Where this conversation was started. Optional so callers that genuinely do
  // not know (a fresh chat opened from nowhere) record nothing rather than a
  // placeholder.
  context?: AiChatConversationContext | null
}): AiChatConversationMeta {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO ai_chat_conversations
      (id, org_id, task_id, title, created_at, updated_at, context_json)
     VALUES (@id, @org_id, @task_id, @title, @created_at, @updated_at, @context_json)`
  ).run({
    id,
    org_id: getActiveOrgId(),
    task_id: input.taskId,
    title: input.title?.trim() || '',
    created_at: now,
    updated_at: now,
    context_json: input.context ? JSON.stringify(input.context) : null
  })
  return {
    id,
    taskId: input.taskId,
    title: input.title?.trim() || '',
    createdAt: now,
    updatedAt: now,
    context: input.context ?? null,
    messageCount: 0
  }
}

/** Append one message to a conversation. Bumps the conversation's updated_at. */
export function appendMessage(
  conversationId: string,
  message: {
    role: ChatRole
    content: string
    ts: number
    proposals?: ActionProposal[]
    applied?: Record<string, AppliedProposal>
    sources?: ChatSource[]
    question?: ChatQuestion | null
    trace?: StoredTrace | null
    mentions?: ChatMentionRef[]
  }
): AiChatStoredMessage {
  const db = getDb()
  // Org guard: never append into a conversation the active org doesn't own.
  if (!conversationOwnedByActiveOrg(conversationId)) {
    throw new Error('Conversation not found for the active workspace.')
  }
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO ai_chat_messages
      (id, conversation_id, role, content, ts, proposals_json, applied_json,
       sources_json, question_json, trace_json, mentions_json, created_at)
     VALUES (@id, @conversation_id, @role, @content, @ts, @proposals_json, @applied_json,
             @sources_json, @question_json, @trace_json, @mentions_json, @created_at)`
  ).run({
    id,
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
    ts: message.ts,
    proposals_json:
      message.proposals && message.proposals.length ? JSON.stringify(message.proposals) : null,
    applied_json:
      message.applied && Object.keys(message.applied).length
        ? JSON.stringify(message.applied)
        : null,
    sources_json: message.sources && message.sources.length ? JSON.stringify(message.sources) : null,
    question_json: message.question ? JSON.stringify(message.question) : null,
    trace_json: message.trace ? JSON.stringify(message.trace) : null,
    mentions_json:
      message.mentions && message.mentions.length ? JSON.stringify(message.mentions) : null,
    created_at: now
  })
  db.prepare(`UPDATE ai_chat_conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId)
  return {
    id,
    role: message.role,
    content: message.content,
    ts: message.ts,
    proposals: message.proposals ?? [],
    applied: message.applied ?? {},
    sources: message.sources ?? [],
    question: message.question ?? null,
    trace: message.trace ?? null,
    mentions: message.mentions ?? []
  }
}

/**
 * Update the applied-state JSON for a single message, keyed by the message's own
 * id (unique) rather than its ts (a Date.now() value that can collide across
 * messages in the same conversation). Org-scoped: the message must belong to a
 * conversation the active org owns, so a stray id from IPC can't write into
 * another org's data.
 */
export function setMessageApplied(
  messageId: string,
  conversationId: string,
  applied: Record<string, AppliedProposal>
): void {
  const db = getDb()
  if (!conversationOwnedByActiveOrg(conversationId)) return
  db.prepare(
    `UPDATE ai_chat_messages SET applied_json = ?
     WHERE id = ? AND conversation_id = ?`
  ).run(Object.keys(applied).length ? JSON.stringify(applied) : null, messageId, conversationId)
}

/** Rename a conversation. */
export function renameConversation(id: string, title: string): void {
  const db = getDb()
  db.prepare(`UPDATE ai_chat_conversations SET title = ?, updated_at = ? WHERE id = ? AND org_id = ?`).run(
    title.trim(),
    Date.now(),
    id,
    getActiveOrgId()
  )
}

/** Delete a conversation and all its messages. */
export function deleteConversation(id: string): void {
  const db = getDb()
  const org = getActiveOrgId()
  // Scope the delete to the active org so a stray id can't wipe another org's row.
  const owned = db
    .prepare(`SELECT 1 FROM ai_chat_conversations WHERE id = ? AND org_id = ?`)
    .get(id, org)
  if (!owned) return
  db.prepare(`DELETE FROM ai_chat_messages WHERE conversation_id = ?`).run(id)
  db.prepare(`DELETE FROM ai_chat_conversations WHERE id = ?`).run(id)
}
