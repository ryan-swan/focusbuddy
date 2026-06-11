import { describe, it, expect, beforeEach } from 'vitest'
import type { Widget, WidgetKind } from '../../src/shared/types'
import { resolveMenu } from '../../src/renderer/src/lib/contextMenu/resolve'
import {
  registerWidgetContextActions,
  clearWidgetContextActions
} from '../../src/renderer/src/lib/contextMenu/registry'
import { MenuSection } from '../../src/renderer/src/lib/contextMenu/types'
import type { MenuContext } from '../../src/renderer/src/lib/contextMenu/types'
import type { CtxMenuItem } from '../../src/renderer/src/components/CanvasContextMenu'

function widget(kind: WidgetKind, content = ''): Widget {
  return {
    id: `w-${kind}`,
    taskId: 't-1',
    kind,
    title: '',
    content,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    zIndex: 1,
    color: null,
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
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    syncGroupId: null
  }
}

function widgetCtx(w: Widget, selectionText?: string): MenuContext {
  return {
    object: { type: 'widget', widget: w },
    selection: selectionText
      ? { text: selectionText, sourceWidgetId: w.id, sourceKind: w.kind }
      : undefined,
    taskId: 't-1',
    canvasPoint: { x: 0, y: 0 },
    clientPoint: { x: 10, y: 10 }
  }
}

// Top-level rows that actually take a slot (separators do not count toward the
// eight-item ceiling).
function topLevel(items: CtxMenuItem[]): CtxMenuItem[] {
  return items.filter((i) => !i.separator)
}

function maxDepth(items: CtxMenuItem[]): number {
  let d = 1
  for (const it of items) {
    if (it.children?.length) d = Math.max(d, 1 + maxDepth(it.children))
  }
  return d
}

function labels(items: CtxMenuItem[]): string[] {
  return topLevel(items).map((i) => i.label ?? '')
}

describe('resolveMenu — deterministic eight-item ceiling and ordering', () => {
  beforeEach(() => clearWidgetContextActions())

  it('never exceeds eight top-level slots, even on a rich text widget with a selection', () => {
    // Give the widget two context rows so the Context band fills both of its
    // inlined slots, the worst case for the ceiling.
    registerWidgetContextActions('sticky', () => ({
      context: [
        { id: 'a', section: MenuSection.Context, priority: 0, label: 'Action A' },
        { id: 'b', section: MenuSection.Context, priority: 1, label: 'Action B' }
      ]
    }))
    const items = resolveMenu(widgetCtx(widget('sticky', 'hello world'), 'hello'))
    expect(topLevel(items).length).toBeLessThanOrEqual(8)
    // Every canonical band that applies is represented.
    const ls = labels(items)
    expect(ls).toContain('AI Assist')
    expect(ls).toContain('Create')
  })

  it('folds three or more context rows into two slots (one inlined plus More actions)', () => {
    registerWidgetContextActions('sticky', () => ({
      context: [
        { id: 'a', section: MenuSection.Context, priority: 0, label: 'Action A' },
        { id: 'b', section: MenuSection.Context, priority: 1, label: 'Action B' },
        { id: 'c', section: MenuSection.Context, priority: 2, label: 'Action C' }
      ]
    }))
    const items = resolveMenu(widgetCtx(widget('sticky', 'x')))
    const ls = labels(items)
    expect(ls[0]).toBe('Action A')
    expect(ls).toContain('More actions')
    const more = topLevel(items).find((i) => i.label === 'More actions')
    expect(more?.children?.map((c) => c.label)).toEqual(['Action B', 'Action C'])
  })

  it('keeps the canonical order, with Destructive always last', () => {
    const items = resolveMenu(widgetCtx(widget('note', 'some text')))
    const ls = labels(items)
    const aiIdx = ls.indexOf('AI Assist')
    const createIdx = ls.indexOf('Create')
    expect(aiIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(aiIdx)
    // The very last non-separator row is a destructive one.
    const last = topLevel(items).at(-1)
    expect(['Archive', 'Delete', 'Remove']).toContain(last?.label)
  })

  it('respects the depth rules: AI Assist reaches three levels, the rest stay within two', () => {
    const items = resolveMenu(widgetCtx(widget('note', 'some text')))
    const ai = topLevel(items).find((i) => i.label === 'AI Assist')
    // AI Assist (1) -> Change Tone (2) -> Professional (3)
    expect(maxDepth([ai as CtxMenuItem])).toBe(3)
    // Create / Convert merged slot stays within two levels.
    const create = topLevel(items).find((i) => i.label === 'Create')
    expect(maxDepth([create as CtxMenuItem])).toBe(2)
  })
})

describe('resolveMenu — Create and Convert merge into one slot', () => {
  beforeEach(() => clearWidgetContextActions())

  it('puts both the create offerings and a Turn-this-into group under a single Create slot', () => {
    const items = resolveMenu(widgetCtx(widget('note', 'convert me')))
    const ls = labels(items)
    expect(ls.filter((l) => l === 'Create')).toHaveLength(1)
    expect(ls).not.toContain('Convert')
    const create = topLevel(items).find((i) => i.label === 'Create')
    const childLabels = create?.children?.map((c) => c.label) ?? []
    expect(childLabels).toContain('Turn this into')
  })
})

describe('resolveMenu — AI Assist gating', () => {
  beforeEach(() => clearWidgetContextActions())

  it('omits AI Assist when there is no workable text', () => {
    // A timer has no text content and no selection.
    const items = resolveMenu(widgetCtx(widget('timer', '')))
    expect(labels(items)).not.toContain('AI Assist')
  })

  it('lets a widget suppress AI Assist via the provider', () => {
    registerWidgetContextActions('living-doc', () => ({
      context: [],
      suppress: { 'ai-assist': true }
    }))
    const items = resolveMenu(widgetCtx(widget('living-doc', 'living body text')))
    expect(labels(items)).not.toContain('AI Assist')
  })
})

describe('resolveMenu — multi-selection', () => {
  it('exposes bulk actions and no single-item-only sections', () => {
    const ctx: MenuContext = {
      object: { type: 'multi', widgets: [widget('sticky', 'one'), widget('note', 'two')] },
      taskId: 't-1',
      canvasPoint: { x: 0, y: 0 },
      clientPoint: { x: 10, y: 10 }
    }
    const items = resolveMenu(ctx)
    const ls = labels(items)
    expect(ls).toContain('Copy all text')
    expect(ls).toContain('Bring all to front')
    expect(ls).toContain('Delete 2 widgets')
    // No AI Assist or Create on a heterogeneous multi-selection.
    expect(ls).not.toContain('AI Assist')
    expect(ls).not.toContain('Create')
    // Destructive still last.
    expect(topLevel(items).at(-1)?.label).toBe('Delete 2 widgets')
  })
})
