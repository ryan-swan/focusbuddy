// Derive the typed-block thread from the existing chat response shape.
//
// The agentic chat renders each assistant turn as an ordered ChatBlock[] instead
// of one markdown lump. Crucially, blocks are DERIVED here on the renderer side
// from what the backend already returns ({reply markdown} + ActionProposal[]),
// NOT emitted by the model as a new schema — so the proven {reply, actions}
// pipeline is untouched and there is zero regression risk.
//
// Today two block kinds carry real data:
//   • 'text'   ← the assistant's reply markdown
//   • 'action' ← one per ActionProposal (reuses the existing apply pipeline)
// The other ChatBlock kinds (record-table, chart, widget-card, link,
// connector-action) are declared in the union and handled by the renderer
// registry; a later session teaches the model to emit them and fills their
// renderers. This function is where that emission will be parsed in.

import type { ActionProposal, ChatBlock, ChatMessage } from '@shared/types'

// Connector-shaped action kinds. When an action is one of these we surface it as
// a 'connector-action' block (a distinct, connector-branded affordance) rather
// than a generic action button. Kept as data, not hardcoded UI, so adding a
// connector kind here is the only change needed — open-ended by construction.
const CONNECTOR_OF: Partial<Record<ActionProposal['kind'], string>> = {
  'compose-mail': 'gmail',
  'schedule-event': 'calendar',
  'post-chat': 'chat'
}

export function connectorForProposal(p: ActionProposal): string | null {
  return CONNECTOR_OF[p.kind] ?? null
}

// Build the block list for an assistant message. `proposals` are the actions the
// backend attached to this message (from the store, keyed by message ts).
export function deriveAssistantBlocks(
  message: ChatMessage,
  proposals: ActionProposal[]
): ChatBlock[] {
  const blocks: ChatBlock[] = []

  // 1) The reply text (if any) leads the turn.
  const text = message.content?.trim()
  if (text) blocks.push({ kind: 'text', markdown: text })

  // 2) Each proposal becomes an action block — or a connector-action block when
  //    it maps to a known connector, so email/calendar/chat read as first-class
  //    connector affordances instead of generic actions.
  for (const p of proposals) {
    const connector = connectorForProposal(p)
    if (connector) {
      blocks.push({ kind: 'connector-action', connector, label: p.kind, proposal: p })
    } else {
      blocks.push({ kind: 'action', proposal: p })
    }
  }

  return blocks
}
