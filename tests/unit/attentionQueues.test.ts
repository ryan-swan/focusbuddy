import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  groupIntoQueues,
  detachedItems,
  itemReason,
  isTerminalState,
  PRIMARY_ACTION,
  QUEUE_ORDER
} from '../../src/renderer/src/lib/attentionQueues'

// S6 — the Attention surface's pure semantics: F013 (queues derive from
// work_item_state, never the status projection), snooze-hiding, the Detached
// shelf, class-appropriate closing verbs, and one-reason-per-item.

const NOW = Date.parse('2026-08-25T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function wi(over: Partial<FbNode>): FbNode {
  return {
    id: Math.random().toString(36).slice(2),
    parentId: null,
    kind: 'work_item',
    title: 'Item',
    description: '',
    status: 'open',
    priority: 3,
    interest: 3,
    importance: 3,
    sortOrder: 0,
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    startedAt: null,
    completedAt: null,
    estimateMinutes: null,
    extensionsMinutes: 0,
    resumeMarkdown: null,
    resumeUpdatedAt: null,
    dueDate: null,
    archived: false,
    isPlan: false,
    sharedFromHandle: null,
    sharedRootId: null,
    workItemState: 'open',
    intentClass: 'action',
    ...over
  } as FbNode
}

describe('groupIntoQueues', () => {
  it('groups by intent class in the fixed order, hides terminal/snoozed/detached', () => {
    const items = [
      wi({ id: 'a', intentClass: 'action' }),
      wi({ id: 'r', intentClass: 'review' }),
      wi({ id: 'done', intentClass: 'action', workItemState: 'completed' }),
      // F013: a hostile status can NEVER surface a terminal item.
      wi({ id: 'hostile', intentClass: 'action', workItemState: 'dismissed', status: 'open' }),
      wi({ id: 'snoozed', intentClass: 'action', snoozeUntil: NOW + DAY }),
      wi({ id: 'wake', intentClass: 'action', snoozeUntil: NOW - 1000 }), // passed → visible
      wi({ id: 'det', intentClass: 'action', detachedFromId: 'gone-desk' })
    ]
    const qs = groupIntoQueues(items, NOW)
    const action = qs.find((q) => q.queue === 'action')!
    expect(action.items.map((i) => i.id).sort()).toEqual(['a', 'wake'])
    expect(qs.find((q) => q.queue === 'review')!.items).toHaveLength(1)
    expect(qs.map((q) => q.queue)).toEqual(
      QUEUE_ORDER.filter((q) => ['action', 'review'].includes(q))
    )
  })

  it('orders within a queue: soonest due first, undated last, then newest', () => {
    const items = [
      wi({ id: 'later', dueAt: new Date(NOW + 5 * DAY).toISOString() }),
      wi({ id: 'undated-old', createdAt: NOW - 3 * DAY }),
      wi({ id: 'soon', dueAt: new Date(NOW + DAY).toISOString() }),
      wi({ id: 'undated-new', createdAt: NOW })
    ]
    const action = groupIntoQueues(items, NOW).find((q) => q.queue === 'action')!
    expect(action.items.map((i) => i.id)).toEqual(['soon', 'later', 'undated-new', 'undated-old'])
  })
})

describe('the Detached shelf', () => {
  it('collects non-terminal detached items only', () => {
    const items = [
      wi({ id: 'd1', detachedFromId: 'x' }),
      wi({ id: 'd2', detachedFromId: 'x', workItemState: 'dismissed' }),
      wi({ id: 'normal' })
    ]
    expect(detachedItems(items).map((i) => i.id)).toEqual(['d1'])
  })
})

describe('closing verbs + reasons', () => {
  it('every ordered queue has a class-appropriate primary action', () => {
    for (const q of QUEUE_ORDER) {
      expect(PRIMARY_ACTION[q], q).toBeTruthy()
      expect(isTerminalState(PRIMARY_ACTION[q].state), q).toBe(true)
    }
    expect(PRIMARY_ACTION.action.label).toBe('Done')
    expect(PRIMARY_ACTION.acknowledgment.label).toBe('Acknowledge')
  })

  it('one reason per item: due proximity beats origin; decay is named', () => {
    expect(itemReason(wi({ dueAt: new Date(NOW - DAY).toISOString() }), NOW)).toBe('Past due')
    expect(itemReason(wi({ dueAt: new Date(NOW + 20 * 60 * 60 * 1000).toISOString() }), NOW)).toBe(
      'Due today'
    )
    expect(itemReason(wi({ wiOrigin: 'ai' }), NOW)).toBe('Suggested by Plexii')
    expect(
      itemReason(wi({ wiOrigin: 'ai', dueAt: new Date(NOW + DAY).toISOString() }), NOW)
    ).toContain('Due')
    expect(itemReason(wi({ reasonCode: 'decayed' }), NOW)).toBe('Faded out quietly')
    expect(itemReason(wi({}), NOW)).toBeNull()
  })
})
