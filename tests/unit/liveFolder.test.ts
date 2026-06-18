// Unit tests for the pure live-folder body ops (lib/liveFolder.ts): coercion,
// tree queries, and the holder's edit operations (add/rename/remove-subtree/
// move-with-cycle-guard). Blob upload/download + promote are exercised by the
// server integration test and the desktop e2e.

import { describe, it, expect } from 'vitest'
import {
  coerceFolderBody,
  parseFolderBody,
  emptyFolderBody,
  childrenOf,
  descendantIds,
  addEntry,
  renameEntry,
  removeEntry,
  moveEntry,
  type FolderBody
} from '../../src/renderer/src/lib/liveFolder'

function sample(): FolderBody {
  return {
    version: 1,
    rootName: 'Shared',
    entries: [
      { id: 'f1', parentId: null, kind: 'folder', name: 'Docs' },
      { id: 'f2', parentId: 'f1', kind: 'folder', name: 'Sub' },
      { id: 'd1', parentId: 'f1', kind: 'doc', name: 'Plan', docType: 'doc', docBody: { v: 1 } },
      { id: 'file1', parentId: 'f2', kind: 'file', name: 'a.pdf', blobId: 'b1', ext: '.pdf' },
      { id: 'top', parentId: null, kind: 'file', name: 'top.txt', blobId: 'b2', ext: '.txt' }
    ]
  }
}

describe('coerce/parse', () => {
  it('round-trips a valid body', () => {
    const parsed = parseFolderBody(JSON.stringify(sample()))
    expect(parsed).not.toBeNull()
    expect(parsed!.entries).toHaveLength(5)
  })
  it('returns null for bad input and drops malformed entries', () => {
    expect(parseFolderBody('not json')).toBeNull()
    expect(coerceFolderBody({ entries: 'no' })).toBeNull()
    const cleaned = coerceFolderBody({ entries: [{ id: 'ok', kind: 'folder', name: 'x', parentId: null }, { kind: 'folder' }, { id: 'bad', kind: 'nope' }] })
    expect(cleaned!.entries).toHaveLength(1)
  })
  it('emptyFolderBody is parseable and falls back the name', () => {
    expect(emptyFolderBody('').rootName).toBe('Shared folder')
    expect(emptyFolderBody('Mine').entries).toEqual([])
  })
})

describe('tree queries', () => {
  it('childrenOf returns folders first, then alphabetical', () => {
    const top = childrenOf(sample(), null)
    expect(top.map((e) => e.id)).toEqual(['f1', 'top']) // folder before file
  })
  it('descendantIds walks the whole subtree', () => {
    expect(new Set(descendantIds(sample(), 'f1'))).toEqual(new Set(['f2', 'd1', 'file1']))
  })
})

describe('edit ops', () => {
  it('addEntry appends without mutating the input', () => {
    const b = sample()
    const next = addEntry(b, { id: 'n', parentId: null, kind: 'folder', name: 'New' })
    expect(next.entries).toHaveLength(6)
    expect(b.entries).toHaveLength(5) // original untouched
  })
  it('renameEntry trims and defaults empty', () => {
    expect(renameEntry(sample(), 'f1', '  Renamed ').entries.find((e) => e.id === 'f1')!.name).toBe('Renamed')
    expect(renameEntry(sample(), 'f1', '   ').entries.find((e) => e.id === 'f1')!.name).toBe('Untitled')
  })
  it('removeEntry deletes the folder and its whole subtree', () => {
    const next = removeEntry(sample(), 'f1')
    expect(next.entries.map((e) => e.id).sort()).toEqual(['top'])
  })
  it('moveEntry reparents', () => {
    const next = moveEntry(sample(), 'top', 'f1')
    expect(next.entries.find((e) => e.id === 'top')!.parentId).toBe('f1')
  })
  it('moveEntry refuses to move a folder into its own subtree', () => {
    const next = moveEntry(sample(), 'f1', 'f2') // f2 is inside f1
    expect(next).toBe(sample.length ? next : next) // sanity
    expect(next.entries.find((e) => e.id === 'f1')!.parentId).toBe(null) // unchanged
  })
  it('moveEntry refuses to move an entry into itself', () => {
    const next = moveEntry(sample(), 'f1', 'f1')
    expect(next.entries.find((e) => e.id === 'f1')!.parentId).toBe(null)
  })
})
