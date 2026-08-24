// @vitest-environment node
// Defect #26: fb_embeddings reads must be org-scoped like listEmbeddings, or a
// row written under another org is invisible to search yet skipped by reindex —
// permanently keyword-only. Runs against a REAL in-memory sqlite (node:sqlite),
// the same approach the chunk-index suite uses: a mocked DB cannot vouch for a
// WHERE clause.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const h = vi.hoisted(() => ({ db: null as unknown, org: 'org-a' }))
vi.mock('../../src/main/db/database', () => ({ getDb: () => h.db }))
vi.mock('../../src/main/db/activeOrg', () => ({ getActiveOrgId: () => h.org }))

import {
  setEmbedding,
  getEmbedding,
  hasEmbedding,
  listEmbeddings,
  listEmbeddingsTagged
} from '../../src/main/db/embeddings'

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE fb_embeddings (
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    model TEXT NOT NULL,
    dim INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    org_id TEXT,
    PRIMARY KEY (item_type, item_id)
  )`)
  return db
}

describe('fb_embeddings org scoping (#26)', () => {
  beforeEach(() => {
    h.db = freshDb()
    h.org = 'org-a'
  })

  it('a row written under another org is invisible to every read AND re-embeddable', () => {
    setEmbedding('document', 'd1', [0.1, 0.2], 'text-embedding-3-small')
    h.org = 'org-b'
    expect(getEmbedding('document', 'd1')).toBeNull()
    // hasEmbedding=false is the half that matters: the reindex sweep treats
    // the item as unembedded and re-embeds it for the active org, instead of
    // skipping it forever.
    expect(hasEmbedding('document', 'd1')).toBe(false)
    expect(listEmbeddings('document').size).toBe(0)
    expect(listEmbeddingsTagged('document').size).toBe(0)
  })

  it('reads under the writing org see the row, tagged with its model', () => {
    setEmbedding('document', 'd1', [0.1, 0.2], 'ollama:all-minilm')
    expect(getEmbedding('document', 'd1')).toEqual([0.1, 0.2])
    expect(hasEmbedding('document', 'd1')).toBe(true)
    expect(listEmbeddingsTagged('document').get('d1')?.model).toBe('ollama:all-minilm')
  })
})
