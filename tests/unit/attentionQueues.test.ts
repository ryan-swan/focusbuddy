import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  groupIntoQueues,
  groupByDue,
  groupByOrigin,
  recentlyClosed,
  detachedItems,
  itemReason,
  isTerminalState,
  rankScore,
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

  it('orders within a queue by rank: due proximity dominates, then staleness', () => {
    const items = [
      wi({ id: 'later', dueAt: new Date(NOW + 5 * DAY).toISOString(), updatedAt: NOW }),
      wi({ id: 'stale-undated', updatedAt: NOW - 9 * DAY }),
      wi({ id: 'soon', dueAt: new Date(NOW + DAY).toISOString(), updatedAt: NOW }),
      wi({ id: 'fresh-undated', updatedAt: NOW })
    ]
    const action = groupIntoQueues(items, NOW).find((q) => q.queue === 'action')!
    // Ranker v1 (SPEC-019): due-soon beats due-later; among undated, the item
    // that has waited longest for the eye ranks HIGHER (staleness signal).
    expect(action.items.map((i) => i.id)).toEqual(['soon', 'later', 'stale-undated', 'fresh-undated'])
  })

  it('rankScore: past due dominates; explicit human actionable gets the light thumb', () => {
    const pastDue = wi({ dueAt: new Date(NOW - DAY).toISOString(), updatedAt: NOW })
    const aiUndated = wi({ wiOrigin: 'ai', updatedAt: NOW })
    const humanUndated = wi({ wiOrigin: 'human', updatedAt: NOW })
    expect(rankScore(pastDue, NOW)).toBeGreaterThan(100 - 1)
    expect(rankScore(humanUndated, NOW)).toBeGreaterThan(rankScore(aiUndated, NOW))
  })
})

describe('lenses (SPEC-017 v1)', () => {
  it('groupByDue buckets in urgency order with the same visibility rules', () => {
    const items = [
      wi({ id: 'od', dueAt: new Date(NOW - DAY).toISOString() }),
      wi({ id: 'today', dueAt: new Date(NOW + 60 * 60 * 1000).toISOString() }),
      wi({ id: 'none' }),
      wi({ id: 'snoozed', snoozeUntil: NOW + DAY }),
      wi({ id: 'week', dueAt: new Date(NOW + 4 * DAY).toISOString() })
    ]
    const groups = groupByDue(items, NOW)
    expect(groups.map((g) => g.queue)).toEqual(['overdue', 'today', 'week', 'none'])
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).not.toContain('snoozed')
  })

  it('groupByOrigin splits You / Plexii / System', () => {
    const items = [wi({ id: 'h' }), wi({ id: 'a', wiOrigin: 'ai' }), wi({ id: 's', wiOrigin: 'system' })]
    expect(groupByOrigin(items, NOW).map((g) => g.label)).toEqual(['You', 'Plexii', 'System'])
  })

  it('recentlyClosed keeps finished loops, excludes dismissals and old items', () => {
    const items = [
      wi({ id: 'done', workItemState: 'completed', updatedAt: NOW - DAY }),
      wi({ id: 'dismissed', workItemState: 'dismissed', updatedAt: NOW - DAY }),
      wi({ id: 'old', workItemState: 'completed', updatedAt: NOW - 10 * DAY }),
      wi({ id: 'open' })
    ]
    expect(recentlyClosed(items, NOW).map((i) => i.id)).toEqual(['done'])
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
