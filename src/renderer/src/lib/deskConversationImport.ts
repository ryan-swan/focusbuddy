// Build the persisted-conversation form of a desk assistant thread (Phase
// 3a.3, P5 slice a — the focus AI Chat's "Continue your desk conversation").
//
// Pure and store-free. The honesty contract, locked by unit test: every
// imported turn is the desk turn VERBATIM plus at most one clearly-bracketed
// summary of proposals that really existed on that turn; the conversation
// announces it was imported in its title and in a header turn. Proposals are
// summarised as text, never re-emitted as live cards — an imported card would
// look actionable while its applied-state lives in another store, and applying
// it twice is exactly the kind of fake this surface must not produce.

import type { ActionProposal, ChatMessage } from '@shared/types'

export interface ImportedConversation {
  title: string
  messages: ChatMessage[]
}

function proposalLabel(p: ActionProposal): string {
  const withTitle = p as { title?: string }
  return withTitle.title && withTitle.title.trim() !== '' ? withTitle.title : p.kind
}

export function buildImportedConversation(
  deskMessages: ChatMessage[],
  proposalsByMessage: Record<string, ActionProposal[]>,
  taskTitle: string
): ImportedConversation | null {
  if (deskMessages.length === 0) return null

  const turns: ChatMessage[] = deskMessages.map((m) => {
    const proposals = proposalsByMessage[String(m.ts)] ?? []
    if (proposals.length === 0) return { role: m.role, content: m.content, ts: m.ts }
    const labels = proposals.map(proposalLabel).join(', ')
    return {
      role: m.role,
      content:
        `${m.content}\n\n[This turn proposed ${proposals.length} action${proposals.length === 1 ? '' : 's'}: ${labels} — see the desk assistant for their outcome]`,
      ts: m.ts
    }
  })

  const header: ChatMessage = {
    role: 'assistant',
    content:
      `Imported from your desk conversation about "${taskTitle}" — ${deskMessages.length} turn${deskMessages.length === 1 ? '' : 's'}. Continue here; this copy is saved with your focus chats.`,
    ts: deskMessages[0].ts - 1
  }

  return {
    title: `Imported — ${taskTitle}`,
    messages: [header, ...turns]
  }
}
