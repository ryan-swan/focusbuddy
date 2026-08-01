import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  projectRoomOrTask,
  projectKnowledge,
  projectDocument,
  projectWidget,
  officeDocHomes,
  PROJECTED_WIDGET_KINDS,
  OFFICE_DOC_WIDGET_KINDS,
  CONTAINMENT_EDGE,
  type SourceRoomOrTask,
  type SourceWidget
} from '@shared/projection'
import { isNodeType } from '@shared/brainGraph'

// Unit lock for the PURE projection mapping (plexi-brain P1 migration posture). The
// DB-driver (src/main/brain/projector.ts) is exercised by the headless projection
// harness + in-app; these tests lock the mapping DECISIONS that make the graph real
// on the existing corpus: which node type, which provenance leaf, which structural
// edge — all derived from STRUCTURE, never from reading content for a domain bucket.

const folder = (over: Partial<SourceRoomOrTask> = {}): SourceRoomOrTask => ({
  id: over.id ?? 'f1',
  kind: 'folder',
  title: over.title ?? 'Engineering',
  description: over.description ?? '',
  parentId: over.parentId ?? null,
  updatedAt: 1
})

describe('projection — room/task (the folder/task tree → graph)', () => {
  it('a folder projects to a ROOM node that is its own aperture', () => {
    const p = projectRoomOrTask(folder({ id: 'room-eng', title: 'Engineering' }))
    expect(p.node.type).toBe('room')
    expect(isNodeType(p.node.type)).toBe(true)
    // A room is its own room_id (the aperture — orthogonality rule 1).
    expect(p.node.roomId).toBe('room-eng')
    expect(p.node.title).toBe('Engineering')
  })

  it('a desk (kind=task) projects to a PROJECT node whose room is its parent folder (DEC-017 island tree — ontology §1 #4: Room contains Project)', () => {
    const p = projectRoomOrTask({
      id: 't1',
      kind: 'task',
      title: 'Ship P1',
      description: 'build the spine',
      parentId: 'room-eng',
      importance: 5,
      updatedAt: 1
    })
    // The base app's kind='task' rows ARE the desks — the ontology books them under
    // Project (landmark TYPE_PRIOR), exactly the island tree's Level-2 slot. The
    // re-type flows through the same (source_table, source_id) upsert key, so live
    // nodes rename in place — never double-project.
    expect(p.node.type).toBe('project')
    expect(p.node.roomId).toBe('room-eng') // desk's room = its parent (matches P0 indexer)
    expect(p.node.body).toBe('build the spine')
  })

  it('a task-item (sub-task inside a desk) projects to a TASK node contained by its desk, aperture = the desk room resolved by the driver', () => {
    const p = projectRoomOrTask({
      id: 'ti1',
      kind: 'task-item',
      title: 'Send intro deck',
      description: '',
      parentId: 'desk-1',
      parentRoomId: 'room-eng',
      updatedAt: 1
    })
    expect(p.node.type).toBe('task')
    expect(p.node.roomId).toBe('room-eng') // the real aperture, not the desk id
    expect(p.containedBySource).toEqual({ table: 'nodes', id: 'desk-1' }) // desk contains item
  })

  it('provenance points back to the exact source-record (structural anti-hallucination)', () => {
    const p = projectRoomOrTask(folder({ id: 'f42' }))
    expect(p.provenanceSource).toEqual({ table: 'nodes', id: 'f42' })
    expect(p.sourceTable).toBe('nodes')
    expect(p.sourceId).toBe('f42')
  })

  it('a child folder is contained by its parent; a root folder is contained by nothing', () => {
    const child = projectRoomOrTask(folder({ id: 'sub', parentId: 'root' }))
    expect(child.containedBySource).toEqual({ table: 'nodes', id: 'root' })
    const root = projectRoomOrTask(folder({ id: 'root', parentId: null }))
    expect(root.containedBySource).toBeNull()
  })

  it('projected nodes are TYPED provenance-confidence (a real user row, structural classification — not over-claiming)', () => {
    expect(projectRoomOrTask(folder()).node.confidence).toBe('typed')
    expect(projectKnowledge({ id: 'k', title: 't', body: 'b', tags: [], updatedAt: 1 }).node.confidence).toBe('typed')
  })

  it('projection NEVER authors importance — the derivation owns that column (DEC-014)', () => {
    const p = projectRoomOrTask(folder({ id: 'f' }))
    // The mapper's node shape has no importance field at all — the driver stamps the
    // neutral default on create and the derivation computes the real value.
    expect('importance' in p.node).toBe(false)
    expect('importanceDerived' in p.node).toBe(false)
  })
})

describe('projection — knowledge → note, document → document', () => {
  it('a knowledge entry projects to a NOTE with tags folded into the body', () => {
    const p = projectKnowledge({ id: 'k1', title: 'Refund policy', body: '30 days', tags: ['support', 'policy'], updatedAt: 1 })
    expect(p.node.type).toBe('note')
    expect(p.provenanceSource).toEqual({ table: 'fb_knowledge', id: 'k1' })
    expect(p.node.body).toContain('support')
    expect(p.node.body).toContain('30 days')
    expect(p.node.roomId).toBeNull() // knowledge isn't folder-scoped today
  })

  it('a document projects to a DOCUMENT node (the handle + spine; body is chunked by P0)', () => {
    const p = projectDocument({ id: 'd1', title: 'Lease', docType: 'pdf', updatedAt: 1 })
    expect(p.node.type).toBe('document')
    expect(p.provenanceSource).toEqual({ table: 'documents', id: 'd1' })
    expect(p.node.body).toBe('') // recall grounds on P0 chunks, not the node body
    expect(p.node.subtype).toBe('pdf') // docType carried as structural detail → exact icon
    expect(p.containedBySource).toBeNull() // no home pointer → the Unfiled stack owns it
  })

  it('a document with a resolved home desk is CONTAINED by it (the ontology §3.5 home pointer → the island tree takes docs home)', () => {
    const p = projectDocument({ id: 'd2', title: 'Q3 plan', docType: 'doc', updatedAt: 1 }, { table: 'nodes', id: 'desk-9' })
    expect(p.containedBySource).toEqual({ table: 'nodes', id: 'desk-9' })
    // roomId stays null — the home is expressed by the contains edge ONLY, so
    // retrieval-side room gating sees exactly what it saw before (additive law).
    expect(p.node.roomId).toBeNull()
  })

  it('empty titles get honest fallbacks, never fabricated content', () => {
    expect(projectRoomOrTask(folder({ title: '' })).node.title).toBe('Untitled room')
    expect(projectRoomOrTask({ id: 't', kind: 'task', title: '', description: '', parentId: null, updatedAt: 1 }).node.title).toBe('Untitled desk')
    expect(projectRoomOrTask({ id: 'ti', kind: 'task-item', title: '', description: '', parentId: 'd', updatedAt: 1 }).node.title).toBe('Untitled task')
    expect(projectKnowledge({ id: 'k', title: '', body: '', tags: [], updatedAt: 1 }).node.title).toBe('Untitled note')
    expect(projectDocument({ id: 'd', title: '', docType: 'pdf', updatedAt: 1 }).node.title).toBe('Untitled document')
  })

  it('containment edge type is "contains"', () => {
    expect(CONTAINMENT_EDGE).toBe('contains')
  })
})

// ── P4.5 Inc 1 — widgets become Level-3 leaves (DEC-017: desks orbit rooms, widgets orbit desks) ──
describe('projection — widget → artifact (the canvas furniture becomes the tree leaves)', () => {
  const sticky = (over: Partial<SourceWidget> = {}): SourceWidget => ({
    id: over.id ?? 'w1',
    containerId: over.containerId ?? 'desk-1',
    containerRoomId: over.containerRoomId !== undefined ? over.containerRoomId : 'room-eng',
    kind: over.kind ?? 'sticky',
    title: over.title ?? '',
    updatedAt: 1
  })

  it('a sticky projects to an ARTIFACT node carrying its widget kind as subtype (the view draws the canvas exact icon)', () => {
    const p = projectWidget(sticky({ id: 'w42', title: 'Call Ryan' }))
    expect(p).not.toBeNull()
    expect(p!.node.type).toBe('artifact')
    expect(p!.node.subtype).toBe('sticky')
    expect(p!.node.title).toBe('Call Ryan')
    expect(p!.sourceTable).toBe('widgets')
    expect(p!.sourceId).toBe('w42')
    expect(p!.provenanceSource).toEqual({ table: 'widgets', id: 'w42' })
  })

  it('a widget is CONTAINED by the canvas node it lives on and inherits that container room as its aperture', () => {
    const p = projectWidget(sticky())
    expect(p!.containedBySource).toEqual({ table: 'nodes', id: 'desk-1' })
    expect(p!.node.roomId).toBe('room-eng')
  })

  it('an untitled widget gets an honest kind label, never fabricated content', () => {
    expect(projectWidget(sticky({ title: '' }))!.node.title).toBe('Sticky')
    expect(projectWidget(sticky({ kind: 'living-doc' }))!.node.title).toBe('Living doc')
    expect(projectWidget(sticky({ kind: 'webview' }))!.node.title).toBe('Webview')
  })

  it('layout/ephemeral furniture never projects (allowlist posture — sections, minimaps, timers are UI state, not knowledge)', () => {
    for (const kind of ['section', 'minimap', 'timer', 'calculator', 'color', 'scratchpad', 'shape', 'streamdeck', 'local-app-launcher', 'task-list', 'some-future-kind']) {
      expect(projectWidget(sticky({ kind })), `kind "${kind}" must not project`).toBeNull()
    }
  })

  it('office wrapper widgets never project as widget nodes — their backing DOCUMENT goes home instead (double-count guard)', () => {
    for (const kind of OFFICE_DOC_WIDGET_KINDS) {
      expect(projectWidget(sticky({ kind })), `office kind "${kind}" must not become a widget node`).toBeNull()
    }
  })

  it('the projected-kind allowlist and the office set never overlap', () => {
    for (const kind of OFFICE_DOC_WIDGET_KINDS) {
      expect(PROJECTED_WIDGET_KINDS as readonly string[], `"${kind}" in both sets`).not.toContain(kind)
    }
  })
})

describe('projection — officeDocHomes (document → home desk via the office wrapper widget)', () => {
  it('maps a backing document id to the desk whose wrapper references it', () => {
    const homes = officeDocHomes([
      { id: 'w1', containerId: 'desk-1', kind: 'doc', content: 'doc-9', createdAt: 10 }
    ])
    expect(homes.get('doc-9')).toEqual({ table: 'nodes', id: 'desk-1' })
  })

  it('is deterministic: the EARLIEST wrapper wins when two desks reference the same document (createdAt, then id)', () => {
    const a = officeDocHomes([
      { id: 'w2', containerId: 'desk-2', kind: 'sheet', content: 'doc-9', createdAt: 20 },
      { id: 'w1', containerId: 'desk-1', kind: 'doc', content: 'doc-9', createdAt: 10 }
    ])
    expect(a.get('doc-9')).toEqual({ table: 'nodes', id: 'desk-1' })
    const tie = officeDocHomes([
      { id: 'wB', containerId: 'desk-B', kind: 'doc', content: 'doc-9', createdAt: 10 },
      { id: 'wA', containerId: 'desk-A', kind: 'doc', content: 'doc-9', createdAt: 10 }
    ])
    expect(tie.get('doc-9')).toEqual({ table: 'nodes', id: 'desk-A' })
  })

  it('ignores empty content and non-office kinds — never a fabricated home', () => {
    const homes = officeDocHomes([
      { id: 'w1', containerId: 'desk-1', kind: 'doc', content: '   ', createdAt: 1 },
      { id: 'w2', containerId: 'desk-2', kind: 'sticky', content: 'doc-9', createdAt: 1 }
    ])
    expect(homes.size).toBe(0)
  })
})

// ── DEC-014 grep-lock #2: the projection maps by STRUCTURE, never by domain ──────
// A folder → room, a task → task, knowledge → note, document → document. The mapper
// must not read content to pick a domain bucket ("this folder is 'Engineering' so
// it's an engineering-thing"). Structural mapping is universal; domain inference is
// the hardcoded-taxonomy trap. Lock: the projection source declares no domain words
// as mapping outputs, and the node types it emits are all structural primitives.
describe('DEC-014 grep-lock — projection maps by structure, not domain', () => {
  const DOMAIN_WORDS = ['engineering', 'marketing', 'sales', 'finance', 'legal', 'health', 'fitness', 'department']

  it('the only node types the mappers emit are universal structural primitives', () => {
    const emitted = [
      projectRoomOrTask(folder()).node.type,
      projectRoomOrTask({ id: 't', kind: 'task', title: 'x', description: '', parentId: null, updatedAt: 1 }).node.type,
      projectRoomOrTask({ id: 'ti', kind: 'task-item', title: 'x', description: '', parentId: 'd', updatedAt: 1 }).node.type,
      projectKnowledge({ id: 'k', title: 'x', body: '', tags: [], updatedAt: 1 }).node.type,
      projectDocument({ id: 'd', title: 'x', docType: 'pdf', updatedAt: 1 }).node.type,
      projectWidget({ id: 'w', containerId: 'd', containerRoomId: null, kind: 'sticky', title: '', updatedAt: 1 })!.node.type
    ]
    expect(emitted.sort()).toEqual(['artifact', 'document', 'note', 'project', 'room', 'task'])
    for (const t of emitted) expect(isNodeType(t)).toBe(true)
  })

  it('the projection source contains no domain word as a mapping literal', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/projection.ts'), 'utf-8')
    // Strip comments so the guard-rail explanation (which names the trap on purpose)
    // doesn't false-positive; then assert no domain word appears in the CODE.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
      .toLowerCase()
    for (const w of DOMAIN_WORDS) {
      expect(code, `projection code must not switch on domain word "${w}"`).not.toContain(`'${w}'`)
      expect(code, `projection code must not switch on domain word "${w}"`).not.toContain(`"${w}"`)
    }
  })
})
