import { describe, it, expect } from 'vitest'
import type { Widget, WidgetLink } from '../../src/shared/types'
import { buildColumns, STATUS_COLUMNS, statusColumnId, reorderColumns } from '../../src/renderer/src/lib/deskColumns'

// buildColumns is a pure function over (widgets, config, ctx); these lock the new
// grouping modes added for the Columns view (status board, connections, sections,
// recency, topic) so the layout logic can't silently regress.

function w(over: Partial<Widget> & { id: string }): Widget {
  return {
    taskId: 't1',
    kind: 'sticky',
    title: over.id,
    content: '',
    x: 0,
    y: 0,
    width: 260,
    height: 200,
    zIndex: 1,
    color: null,
    status: null,
    pinned: false,
    pinnedScreenX: null,
    pinnedScreenY: null,
    pinnedZone: null,
    parentSectionId: null,
    layout: null,
    sourceAppId: null,
    mode: null,
    livingQuery: null,
    livingGeneratedAt: null,
    livingPaused: false,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    syncGroupId: null,
    ...over
  } as Widget
}

const base = { groupBy: 'freeform' as const, columns: [{ id: 'c1', title: 'A' }], assign: {}, order: {} }

describe('buildColumns status board', () => {
  it('lays out the four fixed lanes and files each widget by its status (null -> To sort)', () => {
    const widgets = [
      w({ id: 'a', status: null }),
      w({ id: 'b', status: 'doing' }),
      w({ id: 'c', status: 'done' }),
      w({ id: 'd', status: 'reference' })
    ]
    const cols = buildColumns(widgets, { ...base, groupBy: 'status' })
    expect(cols.map((c) => c.id)).toEqual(STATUS_COLUMNS.map((c) => c.id))
    const idsIn = (colId: string) => cols.find((c) => c.id === colId)!.items.map((i) => i.id)
    expect(idsIn('todo')).toEqual(['a'])
    expect(idsIn('doing')).toEqual(['b'])
    expect(idsIn('done')).toEqual(['c'])
    expect(idsIn('reference')).toEqual(['d'])
  })

  it('column ids are the status values so a drop can set status directly', () => {
    expect(statusColumnId(undefined)).toBe('todo')
    expect(statusColumnId('doing')).toBe('doing')
    expect(statusColumnId('bogus')).toBe('todo')
  })
})

describe('buildColumns connections', () => {
  it('groups wired widgets into a cluster and leaves the rest Unconnected', () => {
    const widgets = [w({ id: 'a' }), w({ id: 'b' }), w({ id: 'c' })]
    const links: WidgetLink[] = [
      { id: 'l1', sourceWidgetId: 'a', targetWidgetId: 'b', taskId: 't1', createdAt: 1, type: 'context' } as WidgetLink
    ]
    const cols = buildColumns(widgets, { ...base, groupBy: 'connections' }, { links })
    const cluster = cols.find((c) => c.id.startsWith('cluster:') && c.id !== 'cluster:loose')!
    expect(cluster.items.map((i) => i.id).sort()).toEqual(['a', 'b'])
    const loose = cols.find((c) => c.id === 'cluster:loose')!
    expect(loose.items.map((i) => i.id)).toEqual(['c'])
  })
})

describe('buildColumns sections', () => {
  it('groups children under their section and free objects into Ungrouped', () => {
    const widgets = [
      w({ id: 'sec', kind: 'section', title: 'Plans' }),
      w({ id: 'child', parentSectionId: 'sec' }),
      w({ id: 'free' })
    ]
    const cols = buildColumns(widgets, { ...base, groupBy: 'section' })
    const plans = cols.find((c) => c.title === 'Plans')!
    expect(plans.items.map((i) => i.id)).toEqual(['child'])
    const ungrouped = cols.find((c) => c.id === 'section:none')!
    expect(ungrouped.items.map((i) => i.id)).toEqual(['free'])
    // the section container itself is never shown as a card
    expect(cols.flatMap((c) => c.items).some((i) => i.id === 'sec')).toBe(false)
  })
})

describe('buildColumns recency', () => {
  it('bands objects by creation time', () => {
    const now = Date.now()
    const widgets = [
      w({ id: 'new', createdAt: now }),
      w({ id: 'old', createdAt: now - 60 * 86_400_000 })
    ]
    const cols = buildColumns(widgets, { ...base, groupBy: 'recency' })
    const today = cols.find((c) => c.id === 'recency:today')
    const older = cols.find((c) => c.id === 'recency:older')
    expect(today?.items.map((i) => i.id)).toEqual(['new'])
    expect(older?.items.map((i) => i.id)).toEqual(['old'])
  })
})

describe('buildColumns topic', () => {
  it('groups by the supplied AI labels, Uncategorised last', () => {
    const widgets = [w({ id: 'a' }), w({ id: 'b' }), w({ id: 'c' })]
    const cols = buildColumns(widgets, { ...base, groupBy: 'topic' }, {
      topicByWidget: { a: 'Pricing', b: 'Pricing' }
    })
    const pricing = cols.find((c) => c.title === 'Pricing')!
    expect(pricing.items.map((i) => i.id).sort()).toEqual(['a', 'b'])
    expect(cols[cols.length - 1].title).toBe('Uncategorised')
    expect(cols[cols.length - 1].items.map((i) => i.id)).toEqual(['c'])
  })
})

describe('reorderColumns', () => {
  const cols = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' }
  ]
  it('moves a column to sit just before the target (drag right)', () => {
    expect(reorderColumns(cols, 'a', 'c').map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })
  it('moves a column before the target (drag left)', () => {
    expect(reorderColumns(cols, 'c', 'a').map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })
  it('no-ops on a self-drop or an unknown id, and never mutates the input', () => {
    expect(reorderColumns(cols, 'a', 'a')).toBe(cols)
    expect(reorderColumns(cols, 'zzz', 'a')).toBe(cols)
    expect(reorderColumns(cols, 'a', 'zzz')).toBe(cols)
    expect(cols.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})
