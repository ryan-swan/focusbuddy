import type { FbNode } from '@shared/types'
import { isTerminalState } from './attentionQueues'

// DEC-076 — the widget bell's state resolver. A widget "is an attention item"
// when a LIVE work item points at it: sourceType 'widget' (or a 'widgets'
// multi-mark, whose sourceRef is the comma-joined id list — CR-09 D-A), not
// closed, not detached. Derived, never stored — the bell can't drift from the
// queue because they read the same rows.

export function liveItemForWidget(items: FbNode[], widgetId: string): FbNode | null {
  let best: FbNode | null = null
  for (const i of items) {
    if (isTerminalState(i.workItemState) || i.detachedFromId != null) continue
    if (i.sourceType !== 'widget' && i.sourceType !== 'widgets') continue
    const refs = (i.sourceRef ?? '').split(',')
    if (!refs.includes(widgetId)) continue
    if (!best || i.updatedAt > best.updatedAt) best = i
  }
  return best
}
