// @vitest-environment node
// A5 / M4: the memory store's three laws, proven against a REAL in-memory
// sqlite (the embeddingsOrg harness pattern — a mocked DB cannot vouch for a
// WHERE clause):
//   #23 org privacy — a fact learned in one org NEVER surfaces in another
//       (the A5 stage-gate's engine test).
//   #25 supersession (R23) — newest wins; the replaced row is archived with a
//       pointer to its successor, never deleted.
//   #24 balanced injection — a flood of commitments no longer starves facts
//       and preferences out of the prompt.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const h = vi.hoisted(() => ({ db: null as unknown, org: 'org-a' }))
vi.mock('../../src/main/db/database', () => ({ getDb: () => h.db }))
vi.mock('../../src/main/db/activeOrg', () => ({ getActiveOrgId: () => h.org }))

import {
  addMemory,
  listMemories,
  listMemoriesBalanced,
  forgetMemory
} from '../../src/main/db/memory'

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE fb_memory (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'fact',
    text TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    due TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user',
    source_ref TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    dedup_key TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'personal',
    superseded_by TEXT
  );
  CREATE UNIQUE INDEX idx_fb_memory_dedup_org ON fb_memory(org_id, dedup_key);`)
  return db
}

function rawRows(): Array<Record<string, unknown>> {
  return (h.db as DatabaseSync).prepare('SELECT * FROM fb_memory').all() as Array<
    Record<string, unknown>
  >
}

describe('fb_memory org privacy (#23 — the A5 gate test)', () => {
  beforeEach(() => {
    h.db = freshDb()
    h.org = 'org-a'
  })

  it('a fact learned in one org never appears in another', () => {
    h.org = 'org-flamelit'
    addMemory({ kind: 'fact', text: 'The Eleven Canterbury retainer renews in March' })
    h.org = 'org-aas'
    expect(listMemories()).toEqual([])
    expect(listMemoriesBalanced()).toEqual([])
    h.org = 'org-flamelit'
    expect(listMemories()).toHaveLength(1)
  })

  it('the same stated fact can live independently in two orgs', () => {
    addMemory({ kind: 'preference', text: 'Prefers short bullet summaries' })
    h.org = 'org-b'
    const second = addMemory({ kind: 'preference', text: 'Prefers short bullet summaries' })
    expect(second).not.toBeNull()
    expect(rawRows()).toHaveLength(2)
    expect(listMemories()).toHaveLength(1)
  })

  it('forget is org-gated: an id from another org changes nothing', () => {
    const m = addMemory({ kind: 'fact', text: 'Ships on Fridays' })
    h.org = 'org-b'
    expect(forgetMemory(m!.id)).toBe(false)
    h.org = 'org-a'
    expect(listMemories()).toHaveLength(1)
    expect(forgetMemory(m!.id)).toBe(true)
    expect(listMemories()).toHaveLength(0)
  })
})

describe('supersession (#25, R23 — newest wins, history kept)', () => {
  beforeEach(() => {
    h.db = freshDb()
    h.org = 'org-a'
  })

  it('the canonical case: Thursday standups replace Tuesday standups', () => {
    const oldM = addMemory({ kind: 'preference', text: 'Prefers Tuesday standups' })
    const newM = addMemory({ kind: 'preference', text: 'Prefers Thursday standups' })
    const active = listMemories()
    expect(active).toHaveLength(1)
    expect(active[0].text).toBe('Prefers Thursday standups')
    // Archived, never deleted: the old row survives with the successor pointer.
    const rows = rawRows()
    expect(rows).toHaveLength(2)
    const archived = rows.find((r) => r.id === oldM!.id)!
    expect(archived.active).toBe(0)
    expect(archived.superseded_by).toBe(newM!.id)
  })

  it('a changed deadline supersedes the same commitment', () => {
    addMemory({ kind: 'commitment', text: 'Michael delivers the branch by Friday', subject: 'Michael' })
    addMemory({ kind: 'commitment', text: 'Michael delivers the branch by Monday', subject: 'Michael' })
    const active = listMemories()
    expect(active).toHaveLength(1)
    expect(active[0].text).toContain('Monday')
  })

  it('different statements about the same subject BOTH stay', () => {
    addMemory({ kind: 'fact', text: 'Caleb works at AAS', subject: 'Caleb' })
    addMemory({ kind: 'fact', text: 'Caleb runs the PlexiDesk product', subject: 'Caleb' })
    expect(listMemories()).toHaveLength(2)
  })

  it('supersession never crosses the org boundary', () => {
    addMemory({ kind: 'preference', text: 'Prefers Tuesday standups' })
    h.org = 'org-b'
    addMemory({ kind: 'preference', text: 'Prefers Thursday standups' })
    h.org = 'org-a'
    const active = listMemories()
    expect(active).toHaveLength(1)
    expect(active[0].text).toBe('Prefers Tuesday standups')
  })

  it('a dedup re-sight refreshes rather than superseding anything', () => {
    const first = addMemory({ kind: 'fact', text: 'Ships on Fridays' })
    const again = addMemory({ kind: 'fact', text: 'Ships on Fridays' })
    expect(again!.id).toBe(first!.id)
    expect(rawRows()).toHaveLength(1)
  })
})

describe('balanced injection (#24)', () => {
  beforeEach(() => {
    h.db = freshDb()
    h.org = 'org-a'
  })

  it('twenty commitments no longer starve facts and preferences', () => {
    for (let i = 0; i < 20; i++) {
      addMemory({ kind: 'commitment', text: `Deliver artifact number ${i} to client ${i}`, subject: `client-${i}` })
    }
    addMemory({ kind: 'preference', text: 'No emojis in anything the assistant writes' })
    addMemory({ kind: 'fact', text: 'The team is three founders splitting thirds' })
    const items = listMemoriesBalanced(12)
    expect(items).toHaveLength(12)
    expect(items.some((m) => m.kind === 'preference')).toBe(true)
    expect(items.some((m) => m.kind === 'fact')).toBe(true)
  })

  it('spare quota flows to the kinds that have items', () => {
    const distinctFacts = [
      'The company splits equity in thirds',
      'Michael owns the native browser build',
      'Ryan handles the marketing site',
      'The launch window targets early spring',
      'PlexiBrain is the shared memory product',
      'The desk canvas uses an infinite grid',
      'Clients sign through PlexiSign',
      'The wedding desk demo sold the flow',
      'Voice runs on local Whisper',
      'Search stays keyless on DuckDuckGo'
    ]
    for (const text of distinctFacts) addMemory({ kind: 'fact', text })
    const items = listMemoriesBalanced(12)
    expect(items).toHaveLength(10)
    expect(items.every((m) => m.kind === 'fact')).toBe(true)
  })

  it('presents commitments, then preferences, then facts', () => {
    addMemory({ kind: 'fact', text: 'The team is three founders splitting thirds' })
    addMemory({ kind: 'commitment', text: 'Caleb presents the pricing page Monday', subject: 'Caleb' })
    addMemory({ kind: 'preference', text: 'No emojis in anything the assistant writes' })
    expect(listMemoriesBalanced(12).map((m) => m.kind)).toEqual([
      'commitment',
      'preference',
      'fact'
    ])
  })
})
