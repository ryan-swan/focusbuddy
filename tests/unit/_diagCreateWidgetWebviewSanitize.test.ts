// Throwaway diagnostic (tester agent) — verifies applyCreateWidget's kind:'webview'
// sanitization added for 3.8.4. Mirrors the mocking pattern in
// tests/unit/actionExecutorApply.test.ts so applyProposal runs for real with no
// Electron/IPC. Delete after triage.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const widgetCreateSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/renderer/src/stores/nodes', () => ({
  useNodeStore: { getState: () => ({ nodes: [], update: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/knowledge', () => ({
  useKnowledgeStore: { getState: () => ({ create: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/widgets', () => ({
  useWidgetStore: {
    getState: () => ({
      widgets: [],
      create: widgetCreateSpy,
      update: vi.fn(),
      bringToFront: vi.fn(),
      setActive: vi.fn(),
      focusOn: vi.fn(),
      setFocused: vi.fn(),
      remove: vi.fn()
    })
  }
}))
vi.mock('../../src/renderer/src/stores/focusSession', () => ({
  useFocusSessionStore: { getState: () => ({ start: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/tables', () => ({
  useTablesStore: { getState: () => ({ createTable: vi.fn(), ensureTableLoaded: vi.fn(), addRow: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/links', () => ({
  useLinksStore: { getState: () => ({ create: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/lib/widgetCatalog', () => ({
  catalogFor: () => ({ defaultWidth: 360, defaultHeight: 280, defaultContent: '', label: 'Browser' })
}))
vi.mock('../../src/renderer/src/lib/spawnPosition', () => ({
  spawnPositionFor: () => ({ x: 0, y: 0 })
}))

import { applyProposal } from '../../src/renderer/src/lib/actionExecutor'
import type { ActionProposal } from '../../src/shared/types'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('diag: applyCreateWidget(kind=webview) sanitizes content (3.8.4 fix)', () => {
  it('free-text AI content (the observed corruption) is stored as a sanitized https search, not raw text', async () => {
    const p: ActionProposal = {
      id: 'p1',
      kind: 'create-widget',
      widgetKind: 'webview',
      title: null,
      content:
        '**Origin of the Name Michael****Etymology:** Michael derives from Hebrew (Mikha\'el), meaning "who is like God?"'
    } as ActionProposal
    const res = await applyProposal(p, { activeTaskId: 'task-1' })
    expect(res.ok).toBe(true)
    expect(widgetCreateSpy).toHaveBeenCalledTimes(1)
    const created = widgetCreateSpy.mock.calls[0][0]
    console.log('[DIAG-APPLIER] stored content:', created.content)
    expect(created.content.startsWith('https://www.google.com/search?q=')).toBe(true)
    expect(created.content).not.toContain('Origin of the Name Michael')
  })

  it('a relative asset path is sanitized, never stored verbatim', async () => {
    const p: ActionProposal = {
      id: 'p2',
      kind: 'create-widget',
      widgetKind: 'webview',
      title: null,
      content: 'assets/index-C0cjuBNQ.js'
    } as ActionProposal
    await applyProposal(p, { activeTaskId: 'task-1' })
    const created = widgetCreateSpy.mock.calls[0][0]
    console.log('[DIAG-APPLIER] stored content (relative asset input):', created.content)
    expect(created.content).not.toBe('assets/index-C0cjuBNQ.js')
    expect(created.content.startsWith('https://')).toBe(true)
  })

  it('regression: a real https URL passes through untouched', async () => {
    const p: ActionProposal = {
      id: 'p3',
      kind: 'create-widget',
      widgetKind: 'webview',
      title: null,
      content: 'https://example.com'
    } as ActionProposal
    await applyProposal(p, { activeTaskId: 'task-1' })
    const created = widgetCreateSpy.mock.calls[0][0]
    console.log('[DIAG-APPLIER] stored content (valid https input):', created.content)
    expect(created.content).toBe('https://example.com/')
  })
})
