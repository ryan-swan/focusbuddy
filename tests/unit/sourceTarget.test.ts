import { describe, it, expect } from 'vitest'
import { targetForSource, isOpenable } from '../../src/renderer/src/lib/sourceTarget'

// `docType` is a free string assembled from three unrelated pools in the main
// process, and each pool means something different by `docId`. Routing a click
// on the wrong reading sends you to a document id that is actually a widget, or
// a desk that is actually a knowledge entry — so this mapping is pinned per
// pool, including the pools' own labels rather than invented ones.

const s = (docId: string, docType: string): { docId: string; docType: string } => ({
  docId,
  docType
})

describe('targetForSource — one route per retrieval pool', () => {
  it('routes curated knowledge to its entry', () => {
    expect(targetForSource(s('k-1', 'knowledge'))).toEqual({ kind: 'knowledge', entryId: 'k-1' })
  })

  it('routes every office document kind to the document', () => {
    // The DocType union in shared/types. A kind missing here would silently
    // become unclickable rather than opening.
    for (const kind of ['doc', 'sheet', 'slides', 'map', 'design']) {
      expect(targetForSource(s('d-1', kind))).toEqual({ kind: 'document', documentId: 'd-1' })
    }
  })

  it('routes a task straight to its desk — the id IS the node', () => {
    expect(targetForSource(s('t-1', 'task'))).toEqual({ kind: 'desk', taskId: 't-1' })
  })

  it('routes a note-shaped widget to the widget, for the caller to resolve its desk', () => {
    // The extras pool collects note, sticky, markdown and page widgets all under
    // the single label 'note' — the widget kind is gone by the time it reaches
    // the renderer, and only the id survives.
    expect(targetForSource(s('w-1', 'note'))).toEqual({ kind: 'widget', widgetId: 'w-1' })
  })

  it('routes a table to the table, for the caller to resolve its desk', () => {
    expect(targetForSource(s('tbl-1', 'table'))).toEqual({ kind: 'table', tableId: 'tbl-1' })
  })
})

describe('targetForSource — refuses to guess', () => {
  it('returns null for a docType it does not recognise', () => {
    // Better a plain chip than a click that lands somewhere wrong.
    expect(targetForSource(s('x-1', 'wormhole'))).toBeNull()
    expect(targetForSource(s('x-1', ''))).toBeNull()
  })

  it('returns null when there is no id to open', () => {
    expect(targetForSource(s('', 'doc'))).toBeNull()
    expect(targetForSource(s('   ', 'doc'))).toBeNull()
  })

  it('tolerates casing and stray whitespace on the type', () => {
    expect(targetForSource(s('k-1', ' Knowledge '))).toEqual({ kind: 'knowledge', entryId: 'k-1' })
    expect(targetForSource(s('d-1', 'DOC'))).toEqual({ kind: 'document', documentId: 'd-1' })
  })

  it('trims the id rather than opening a padded one', () => {
    expect(targetForSource(s('  d-1  ', 'doc'))).toEqual({ kind: 'document', documentId: 'd-1' })
  })
})

describe('isOpenable', () => {
  it('agrees with targetForSource, so the UI and the router never disagree', () => {
    for (const type of ['knowledge', 'doc', 'sheet', 'slides', 'map', 'design', 'task', 'note', 'table']) {
      expect(isOpenable(s('id-1', type))).toBe(true)
      expect(targetForSource(s('id-1', type))).not.toBeNull()
    }
    for (const bad of ['', 'wormhole', 'mail']) {
      expect(isOpenable(s('id-1', bad))).toBe(false)
      expect(targetForSource(s('id-1', bad))).toBeNull()
    }
  })
})

describe('A2 reach types (#16/#17)', () => {
  const s = (docId: string, docType: string): { docId: string; docType: string } => ({ docId, docType })

  it('routes every chunk-indexed widget kind to its widget', () => {
    for (const kind of ['living-doc', 'card', 'custom-block', 'field', 'agent', 'mindmap', 'diagram', 'chart']) {
      expect(targetForSource(s('w-1', kind))).toEqual({ kind: 'widget', widgetId: 'w-1' })
    }
  })

  it('routes a file source to the Drive and a chat source to its conversation', () => {
    expect(targetForSource(s('f-1', 'file'))).toEqual({ kind: 'file', fileId: 'f-1' })
    expect(targetForSource(s('c-1', 'chat'))).toEqual({ kind: 'chat', conversationId: 'c-1' })
  })

  it('every new type is openable — a citation is never a dead door (R5)', () => {
    for (const type of ['living-doc', 'card', 'custom-block', 'field', 'agent', 'mindmap', 'diagram', 'chart', 'file', 'chat']) {
      expect(isOpenable(s('id-1', type))).toBe(true)
    }
  })
})
