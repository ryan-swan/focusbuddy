import { describe, it, expect, vi } from 'vitest'
import {
  isWidgetEmptyForSetup,
  isStructuredApplyAs,
  isSetupSupported,
  applyStructuredSetup
} from '../../src/renderer/src/lib/widgetSetup'
import { useWidgetStore } from '../../src/renderer/src/stores/widgets'
import type { Widget, WidgetKind } from '../../src/shared/types'

function widget(kind: WidgetKind, content = '', extra: Partial<Widget> = {}): Widget {
  return {
    id: 'w1',
    taskId: 't1',
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
    syncGroupId: null,
    ...extra
  }
}

describe('isWidgetEmptyForSetup — gates the "Set up with AI" affordance', () => {
  it('a page with no content is empty', () => {
    expect(isWidgetEmptyForSetup(widget('page', ''))).toBe(true)
  })
  it('a page with an empty doc is empty', () => {
    expect(isWidgetEmptyForSetup(widget('page', '{"type":"doc","content":[]}'))).toBe(true)
  })
  it('a page that is just one empty paragraph is empty', () => {
    expect(
      isWidgetEmptyForSetup(widget('page', '{"type":"doc","content":[{"type":"paragraph"}]}'))
    ).toBe(true)
  })
  it('a page with real content is NOT empty', () => {
    const doc = '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Plan"}]}]}'
    expect(isWidgetEmptyForSetup(widget('page', doc))).toBe(false)
  })
  it('a browser with no URL is empty; with a URL it is not', () => {
    expect(isWidgetEmptyForSetup(widget('webview', ''))).toBe(true)
    expect(isWidgetEmptyForSetup(widget('webview', 'https://example.com'))).toBe(false)
  })
  it('an empty sticky is empty; a written one is not', () => {
    expect(isWidgetEmptyForSetup(widget('sticky', ''))).toBe(true)
    expect(isWidgetEmptyForSetup(widget('sticky', 'remember the milk'))).toBe(false)
  })
  it('an unsupported kind never offers setup', () => {
    expect(isWidgetEmptyForSetup(widget('timer', ''))).toBe(false)
    expect(isSetupSupported('timer')).toBe(false)
    expect(isSetupSupported('page')).toBe(true)
  })
  it('archived or living widgets never offer setup', () => {
    expect(isWidgetEmptyForSetup(widget('page', '', { archived: true }))).toBe(false)
    expect(isWidgetEmptyForSetup(widget('page', '', { livingQuery: 'news' }))).toBe(false)
  })
})

describe('isStructuredApplyAs', () => {
  it('flags page and webview, not the text kinds', () => {
    expect(isStructuredApplyAs('page-doc')).toBe(true)
    expect(isStructuredApplyAs('webview-url')).toBe(true)
    expect(isStructuredApplyAs('sticky-checklist')).toBe(false)
    expect(isStructuredApplyAs('mindmap-nodes')).toBe(false)
    expect(isStructuredApplyAs(null)).toBe(false)
  })
})

describe('applyStructuredSetup — writes the approved setup into the widget', () => {
  function withStore(kind: WidgetKind): { update: ReturnType<typeof vi.fn> } {
    const update = vi.fn().mockResolvedValue(undefined)
    useWidgetStore.setState({ widgets: [widget(kind)], update } as never)
    return { update }
  }

  it('a page setup writes the document as serialized JSON content', async () => {
    const { update } = withStore('page')
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    const ok = await applyStructuredSetup('w1', { applyAs: 'page-doc', pageContent: doc })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith('w1', { content: JSON.stringify(doc) })
  })

  it('a browser setup writes the URL as content', async () => {
    const { update } = withStore('webview')
    const ok = await applyStructuredSetup('w1', { applyAs: 'webview-url', url: 'https://example.com/x' })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith('w1', { content: 'https://example.com/x' })
  })

  it('rejects a non-http URL and writes nothing', async () => {
    const { update } = withStore('webview')
    const ok = await applyStructuredSetup('w1', { applyAs: 'webview-url', url: 'not-a-url' })
    expect(ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('does nothing for a missing widget', async () => {
    const update = vi.fn()
    useWidgetStore.setState({ widgets: [], update } as never)
    const ok = await applyStructuredSetup('nope', { applyAs: 'page-doc', pageContent: { type: 'doc' } })
    expect(ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
