// Desk → conversation continuity (A5, AI-04 — ruling R24).
//
// A conversation that produced or adopted a desk records it in linkedDesks
// (Plexii P5, element 0 = primary). This is the REVERSE read: given a desk,
// which conversation is "the one that built it"? A conversation that holds
// the desk as its PRIMARY outranks one that merely linked it; recency breaks
// ties. Pure so it unit-tests in isolation.

import type { AiChatConversationMeta } from '@shared/types'

export function conversationForDesk(
  conversations: ReadonlyArray<AiChatConversationMeta>,
  deskId: string | null
): AiChatConversationMeta | null {
  if (!deskId) return null
  const linked = conversations.filter((c) => c.linkedDesks.includes(deskId))
  if (linked.length === 0) return null
  const primaries = linked.filter((c) => c.linkedDesks[0] === deskId)
  const pool = primaries.length > 0 ? primaries : linked
  return pool.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a))
}
