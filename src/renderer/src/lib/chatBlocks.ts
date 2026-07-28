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

import type { ActionProposal, ChatBlock, ChatMessage, ChatSource } from '@shared/types'
import { citedNumbers } from './remarkCitations'

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

// Same lookup by raw kind string. The retrieval trace names actions before they
// have been sanitised into ActionProposals, so it only has the kind — and it
// must reach the same answer the card below it will, or the same action would
// wear two different icons.
export function connectorForKind(kind: string): string | null {
  return CONNECTOR_OF[kind as ActionProposal['kind']] ?? null
}

// Connector display metadata. Free-string keyed so an unknown connector still
// gets a sane default rather than breaking — open-ended by construction. Lives
// here rather than in a component so the block renderer and the trace share one
// table instead of drifting apart.
const CONNECTOR_META: Record<string, { icon: string; label: string }> = {
  gmail: { icon: 'mail', label: 'Email' },
  calendar: { icon: 'calendar_month', label: 'Calendar' },
  chat: { icon: 'chat', label: 'Message' }
}

export function connectorMeta(connector: string): { icon: string; label: string } {
  return CONNECTOR_META[connector] ?? { icon: 'bolt', label: connector }
}

// Build the block list for an assistant message. `proposals` are the actions the
// backend attached to this message (from the store, keyed by message ts).
export function deriveAssistantBlocks(
  message: ChatMessage,
  proposals: ActionProposal[],
  sources: ChatSource[] = []
): ChatBlock[] {
  const blocks: ChatBlock[] = []

  // 1) The reply text (if any) leads the turn.
  const text = message.content?.trim()
  if (text) blocks.push({ kind: 'text', markdown: text })

  // 2) What the reply was grounded on, directly under it — a numbered chip row
  //    matching the [n] markers inside the text. Only when the turn actually has
  //    prose: a bare action turn has no claims to support.
  //
  //    Crucially, only sources the answer CITES get a chip. Retrieval runs on
  //    every message and returns whatever looked relevant; that is a record of
  //    what was searched, not of what the answer stands on, and it belongs in
  //    the (ephemeral) retrieval trace. An answer that cites nothing gets no
  //    chip row at all — the bug this fixes was six chips under a reply that
  //    said it had found nothing.
  if (text && sources.length > 0) {
    const cited = citedNumbers(text)
    const grounded = sources.filter((s) => cited.has(s.n))
    if (grounded.length > 0) blocks.push({ kind: 'sources', sources: grounded })
  }

  // 3) Each proposal becomes an action block — or a connector-action block when
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
