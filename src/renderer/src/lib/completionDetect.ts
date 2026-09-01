import type { FbNode } from '@shared/types'
import { isTerminalState, queueOf, PRIMARY_ACTION } from './attentionQueues'

// DEC-052 (Track D, tier 1) — the completion matcher, in the Radar family:
// pure over (signal, items), no model call, every rule unit-tested. A match
// becomes an OFFER — never a write. The two hard rules from the ruling are
// structural: the offer surface is the only path to closure (never
// auto-complete), and the wi_signal_match pairing table makes a prompt
// once-ever (never nag).

export interface CompletionSignal {
  id: string
  kind: string
  targetKind: string | null
  targetRef: string | null
  occurredAt: number
}

export interface CompletionOffer {
  signalId: string
  itemId: string
  title: string
  /** The queue's OWN closing verb — a Meet item schedules, a Respond item
   *  answers; one keystroke never mislabels what happened. */
  verbState: string
  verbLabel: string
  reason: string
  confidence: number
}

const active = (i: FbNode): boolean =>
  !isTerminalState(i.workItemState) && i.detachedFromId == null

function offerFor(signal: CompletionSignal, item: FbNode, reason: string, confidence: number): CompletionOffer {
  const verb = PRIMARY_ACTION[queueOf(item)] ?? PRIMARY_ACTION.to_do
  return {
    signalId: signal.id,
    itemId: item.id,
    title: item.title || 'this item',
    verbState: verb.state,
    verbLabel: verb.label,
    reason,
    confidence
  }
}

/**
 * One signal → at most ONE offer (a toast holds one thing; a burst of
 * candidates would be a nag by volume). Rules, strongest first:
 *
 * - block_completed / focus_finished with a work-item target: the person
 *   finished the time they booked FOR this item — the strongest in-Plexii
 *   evidence there is.
 * - chat_message_sent: an active item captured FROM that conversation
 *   (sourceType 'chat', sourceRef = the conversation id) — the loop the item
 *   opened just got words back. Newest capture wins when several match.
 * - desk_closed feeds ANALYTICS (the quiet wins), never a prompt: closing a
 *   desk already ran its own offer for open items (DEC-047 D-3).
 */
export function detectCompletion(
  signal: CompletionSignal,
  items: FbNode[]
): CompletionOffer | null {
  if (signal.kind === 'block_completed' || signal.kind === 'focus_finished') {
    if (!signal.targetRef) return null
    const item = items.find((i) => i.id === signal.targetRef && active(i))
    if (!item) return null
    return offerFor(
      signal,
      item,
      signal.kind === 'focus_finished'
        ? 'You just finished a focus session on this'
        : 'You finished the time you booked for this',
      1
    )
  }
  if (signal.kind === 'chat_message_sent') {
    if (!signal.targetRef) return null
    const matches = items
      .filter((i) => active(i) && i.sourceType === 'chat' && i.sourceRef === signal.targetRef)
      .sort((a, b) => b.createdAt - a.createdAt)
    if (!matches.length) return null
    return offerFor(signal, matches[0], 'You replied in the chat this came from', 0.75)
  }
  return null
}

/** The analytics half of the ruling (#7): work that happened WITHOUT a
 *  checkbox still counts. Plain-language lines from the ledger — only claims
 *  the signals actually support. */
export function quietWinLines(
  signals: Array<{ kind: string; occurredAt: number }>,
  nowMs: number
): string[] {
  const wk = signals.filter((s) => nowMs - s.occurredAt < 7 * 86_400_000)
  const desks = wk.filter((s) => s.kind === 'desk_closed').length
  const focus = wk.filter((s) => s.kind === 'focus_finished').length
  const blocks = wk.filter((s) => s.kind === 'block_completed').length
  const lines: string[] = []
  if (desks > 0)
    lines.push(
      `${desks} desk${desks === 1 ? '' : 's'} closed this week — counted from the work, not the checkboxes.`
    )
  if (focus + blocks > 0)
    lines.push(
      `${focus + blocks} focused sitting${focus + blocks === 1 ? '' : 's'} finished this week.`
    )
  return lines
}
