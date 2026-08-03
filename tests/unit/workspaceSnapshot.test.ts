import { describe, it, expect, beforeEach } from 'vitest'
import type { FbNode, Widget, DocumentMeta } from '../../src/shared/types'
import { useNodeStore } from '../../src/renderer/src/stores/nodes'
import { useWidgetStore } from '../../src/renderer/src/stores/widgets'
import { useDocumentsStore } from '../../src/renderer/src/stores/documents'
import { gatherWorkspaceSnapshot } from '../../src/renderer/src/lib/workspaceSnapshot'

// Minimal node/widget/doc factories — only the fields the snapshot reads matter;
// the rest are filled with inert defaults so the store shapes typecheck.
function node(partial: Partial<FbNode> & Pick<FbNode, 'id' | 'kind'>): FbNode {
  return {
    parentId: null,
    title: '',
    description: '',
    status: 'open',
    priority: 'med',
    interest: 'med',
    importance: 'med',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    startedAt: null,
    completedAt: null,
    estimateMinutes: null,
    extensionsMinutes: 0,
    resumeMarkdown: null,
    resumeUpdatedAt: null,
    dueDate: null,
    ...partial
  } as FbNode
}
function widget(partial: Partial<Widget> & Pick<Widget, 'id' | 'kind' | 'taskId'>): Widget {
  return {
    title: '',
    content: '',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    zIndex: 0,
    color: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial
  } as Widget
}
function doc(partial: Partial<DocumentMeta> & Pick<DocumentMeta, 'id' | 'docType'>): DocumentMeta {
  return { title: '', archived: false, createdAt: 0, updatedAt: 0, ...partial } as DocumentMeta
}

function seed(opts: { nodes?: FbNode[]; widgets?: Widget[]; docs?: DocumentMeta[]; activeTaskId?: string | null }): void {
  useNodeStore.setState({ nodes: opts.nodes ?? [], activeTaskId: opts.activeTaskId ?? null })
  useWidgetStore.setState({ widgets: opts.widgets ?? [] })
  useDocumentsStore.setState({ list: opts.docs ?? [] })
}

beforeEach(() => seed({}))

describe('gatherWorkspaceSnapshot', () => {
  it('returns an empty-but-shaped snapshot with nothing seeded', () => {
    const snap = gatherWorkspaceSnapshot()
    expect(snap).toEqual({
      activeTaskId: null,
      desks: [],
      tasks: [],
      widgets: [],
      documents: [],
      truncated: undefined
    })
  })

  it('maps desks → tasks and flags the active task', () => {
    seed({
      nodes: [
        node({ id: 'd1', kind: 'folder', parentId: null, title: 'Launch' }),
        node({ id: 't1', kind: 'task', parentId: 'd1', title: 'Brief', status: 'in_progress' }),
        node({ id: 't2', kind: 'task', parentId: 'd1', title: 'Pilot' })
      ],
      activeTaskId: 't1'
    })
    const snap = gatherWorkspaceSnapshot()
    expect(snap.activeTaskId).toBe('t1')
    expect(snap.desks).toEqual([{ id: 'd1', title: 'Launch', taskIds: ['t1', 't2'] }])
    const t1 = snap.tasks.find((t) => t.id === 't1')!
    expect(t1.active).toBe(true)
    expect(t1.deskId).toBe('d1')
    expect(t1.status).toBe('in_progress')
    expect(snap.tasks.find((t) => t.id === 't2')!.active).toBe(false)
  })

  it('includes widgets (with kind/title/task) but excludes sections and archived', () => {
    seed({
      nodes: [node({ id: 't1', kind: 'task', parentId: null })],
      widgets: [
        widget({ id: 'w1', kind: 'sticky', taskId: 't1', title: 'Ideas' }),
        widget({ id: 'sec', kind: 'section', taskId: 't1', title: 'Group' }),
        widget({ id: 'w2', kind: 'note', taskId: 't1', title: 'Gone', archived: true })
      ]
    })
    const snap = gatherWorkspaceSnapshot()
    const ids = snap.widgets.map((w) => w.id)
    expect(ids).toContain('w1')
    expect(ids).not.toContain('sec') // sections are structural, excluded
    expect(ids).not.toContain('w2') // archived excluded
    expect(snap.widgets.find((w) => w.id === 'w1')).toMatchObject({ kind: 'sticky', taskId: 't1', title: 'Ideas' })
  })

  it('includes documents as id + type + title', () => {
    seed({ docs: [doc({ id: 'doc1', docType: 'sheet', title: 'Budget' })] })
    const snap = gatherWorkspaceSnapshot()
    expect(snap.documents).toEqual([{ id: 'doc1', docType: 'sheet', title: 'Budget' }])
  })

  it('flags truncation when a cap is exceeded', () => {
    // 700 widgets exceeds the 600 cap → truncated.
    const many = Array.from({ length: 700 }, (_, i) =>
      widget({ id: `w${i}`, kind: 'sticky', taskId: 't1' })
    )
    seed({ nodes: [node({ id: 't1', kind: 'task', parentId: null })], widgets: many })
    const snap = gatherWorkspaceSnapshot()
    expect(snap.truncated).toBe(true)
    expect(snap.widgets.length).toBe(600)
  })
})
