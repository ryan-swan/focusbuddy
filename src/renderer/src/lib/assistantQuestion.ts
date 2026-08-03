import type { ChatMessage, ChatQuestion } from '@shared/types'

// Which follow-up question is LIVE for a thread: the one attached to its last
// message, and only while that message is an assistant turn.
//
// This one rule is the whole lifecycle. Answering (or typing anything) appends
// a user turn, so the question stops being last and the card disappears —
// without deleting the record. A rewind that makes the asking message last
// again honestly re-opens the card, because in that history the question is
// still unanswered. Only an explicit dismiss deletes the record.
//
// Pure and store-shape-agnostic, same pattern as traceView / sourceTarget, so
// the lifecycle is unit-tested without mounting the panel.
export function activeQuestionFor(
  messages: ChatMessage[],
  questionByMessage: Record<string, ChatQuestion>
): { question: ChatQuestion; messageTs: number } | null {
  if (messages.length === 0) return null
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant') return null
  const question = questionByMessage[String(last.ts)]
  return question ? { question, messageTs: last.ts } : null
}
