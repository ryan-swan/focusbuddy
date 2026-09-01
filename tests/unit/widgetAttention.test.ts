import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import { liveItemForWidget } from '../../src/renderer/src/lib/widgetAttention'
import { defaultDeskTitle } from '../../src/renderer/src/lib/deskDefaults'

// DEC-076 — the bell's state is DERIVED from the queue's own rows, so the two
// surfaces cannot disagree (the operator's "two-way sync" by construction).

let seq = 0
const wi = (over: Partial<FbNode>): FbNode =>
  ({
    id: `i${++seq}`,
    kind: 'work_item',
    title: 't',
    parentId: null,
    workItemState: 'open',
    intentClass: 'to_do',
    sourceType: 'widget',
    sourceRef: 'w1',
    detachedFromId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over
  }) as FbNode

describe('liveItemForWidget', () => {
  it('a live widget-marked item lights the bell', () => {
    const i = wi({})
    expect(liveItemForWidget([i], 'w1')?.id).toBe(i.id)
  })

  it('closed and detached items do NOT light it — completing clears the bell', () => {
    expect(liveItemForWidget([wi({ workItemState: 'completed' })], 'w1')).toBeNull()
    expect(liveItemForWidget([wi({ workItemState: 'dismissed' })], 'w1')).toBeNull()
    expect(liveItemForWidget([wi({ detachedFromId: 'gone' })], 'w1')).toBeNull()
  })

  it('a multi-mark (comma-joined sourceRef) counts for every widget in it', () => {
    const multi = wi({ sourceType: 'widgets', sourceRef: 'w1,w2,w3' })
    expect(liveItemForWidget([multi], 'w2')?.id).toBe(multi.id)
    expect(liveItemForWidget([multi], 'w9')).toBeNull()
  })

  it('non-widget sources never match, and ids never substring-match', () => {
    expect(liveItemForWidget([wi({ sourceType: 'desk' })], 'w1')).toBeNull()
    expect(liveItemForWidget([wi({ sourceRef: 'w11' })], 'w1')).toBeNull()
  })

  it('several live marks → the newest-touched one speaks for the widget', () => {
    const oldOne = wi({ updatedAt: 100 })
    const newOne = wi({ updatedAt: 200 })
    expect(liveItemForWidget([oldOne, newOne], 'w1')?.id).toBe(newOne.id)
  })
})

describe('defaultDeskTitle (DEC-073)', () => {
  it('is the moment of creation — month, day, clock time', () => {
    const s = defaultDeskTitle(new Date(2026, 7, 30, 14, 5))
    expect(s).toMatch(/Aug/)
    expect(s).toMatch(/30/)
    expect(s).toMatch(/2:05|14:05/)
  })
})
