import type { FbNode } from '@shared/types'
import { isTerminalState } from './attentionQueues'
import { parseMessageUrl } from './messageLink'

// DEC-125 — the open Attention item that points at a message, if any: the
// widgetAttention pattern for PlexiiMessage. An item counts while it is live
// (not terminal, not detached) and its moment link names this message; the
// most recently touched one wins if several do.
export function liveItemForMessage(items: readonly FbNode[], messageId: string): FbNode | null {
  let best: FbNode | null = null
  for (const i of items) {
    if (i.sourceType !== 'message') continue
    if (isTerminalState(i.workItemState) || i.detachedFromId != null) continue
    if (parseMessageUrl(i.sourceUrl)?.messageId !== messageId) continue
    if (!best || i.updatedAt > best.updatedAt) best = i
  }
  return best
}
