import { describe, it, expect } from 'vitest'
import { buildDocumentRoomMap } from '../../src/main/brain/connectors/documentRoom'

// I2 commit 2 — the pure lock on the document→room RESOLUTION POLICY (F-11).
//
// The corpus exercises the office-wrapper-home path (7 docs, 0→7 red-then-green in
// brainDocumentLineage.spec.ts) but NOT the Files-manager filing fallback (0 docs are
// filed) nor the "office home with an unresolved desk" fall-through. These tests lock the
// full precedence with injected lookups so every branch is covered without a DB.
//
// Precedence: office-wrapper home desk's room WINS → else the Files-manager filing → else
// null (homeless → left out of the map → the connector stamps null → org-wide, like knowledge).

const only = (m: Map<string, string>): Array<[string, string]> => [...m.entries()]

describe('buildDocumentRoomMap — document room resolution precedence (I2)', () => {
  it('uses the office-wrapper home desk’s room when the doc is windowed on a desk', () => {
    const m = buildDocumentRoomMap(
      ['doc1'],
      (id) => (id === 'doc1' ? 'deskA' : null),
      (desk) => (desk === 'deskA' ? 'roomA' : null),
      () => null
    )
    expect(only(m)).toEqual([['doc1', 'roomA']])
  })

  it('office home wins over a Files-manager filing when both exist', () => {
    const m = buildDocumentRoomMap(
      ['doc1'],
      () => 'deskA',
      () => 'roomFromDesk',
      () => 'roomFromFiling'
    )
    expect(m.get('doc1')).toBe('roomFromDesk')
  })

  it('falls through to the filing room when the office home desk resolves to no room', () => {
    // A room-canvas wrapper: the doc has a home desk, but that desk has no parent room.
    const m = buildDocumentRoomMap(
      ['doc1'],
      () => 'deskA',
      () => null, // desk resolves to no room
      (id) => (id === 'doc1' ? 'filedRoom' : null)
    )
    expect(m.get('doc1')).toBe('filedRoom')
  })

  it('uses the filing room when there is no office home at all', () => {
    const m = buildDocumentRoomMap(
      ['doc1'],
      () => null,
      () => null,
      () => 'filedRoom'
    )
    expect(m.get('doc1')).toBe('filedRoom')
  })

  it('leaves a homeless document OUT of the map (→ null → org-wide, like knowledge)', () => {
    const m = buildDocumentRoomMap(['doc1'], () => null, () => null, () => null)
    expect(m.has('doc1')).toBe(false)
  })

  it('resolves each document independently across a mixed batch', () => {
    const homes: Record<string, string> = { homed: 'deskA' }
    const filings: Record<string, string> = { filed: 'roomF' }
    const m = buildDocumentRoomMap(
      ['homed', 'filed', 'loose'],
      (id) => homes[id] ?? null,
      (desk) => (desk === 'deskA' ? 'roomA' : null),
      (id) => filings[id] ?? null
    )
    expect(only(m).sort()).toEqual([
      ['filed', 'roomF'],
      ['homed', 'roomA']
    ])
    expect(m.has('loose')).toBe(false)
  })
})
