import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

// ── fb_embeddings (semantic-retrieval foundation) ────────────────────────────
// A vector store keyed by (item_type, item_id). item_type lets one table hold
// embeddings for knowledge entries, documents, and anything else that wants
// semantic search later, without a table per kind. The vector is a JSON float
// array; dim + model are recorded so a model change can be detected and reindexed.

interface EmbeddingRow {
  item_type: string
  item_id: string
  vector_json: string
  model: string
  dim: number
  updated_at: number
}

const upsertStmt = (): ReturnType<ReturnType<typeof getDb>['prepare']> =>
  getDb().prepare(
    `INSERT INTO fb_embeddings (item_type, item_id, vector_json, model, dim, updated_at, org_id)
     VALUES (@itemType, @itemId, @vector, @model, @dim, @now, @orgId)
     ON CONFLICT(item_type, item_id)
     DO UPDATE SET vector_json = excluded.vector_json, model = excluded.model,
                   dim = excluded.dim, updated_at = excluded.updated_at, org_id = excluded.org_id`
  )

export function setEmbedding(itemType: string, itemId: string, vector: number[], model: string): void {
  upsertStmt().run({
    itemType,
    itemId,
    vector: JSON.stringify(vector),
    model,
    dim: vector.length,
    now: Date.now(),
    orgId: getActiveOrgId()
  })
}

export function getEmbedding(itemType: string, itemId: string): number[] | null {
  const row = getDb()
    .prepare('SELECT vector_json FROM fb_embeddings WHERE item_type = ? AND item_id = ?')
    .get(itemType, itemId) as { vector_json: string } | undefined
  if (!row) return null
  try {
    const v = JSON.parse(row.vector_json)
    return Array.isArray(v) ? (v as number[]) : null
  } catch {
    return null
  }
}

export function listEmbeddings(itemType: string): Map<string, number[]> {
  const rows = getDb()
    .prepare('SELECT item_id, vector_json FROM fb_embeddings WHERE item_type = ? AND org_id = ?')
    .all(itemType, getActiveOrgId()) as Pick<EmbeddingRow, 'item_id' | 'vector_json'>[]
  const out = new Map<string, number[]>()
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector_json)
      if (Array.isArray(v)) out.set(r.item_id, v as number[])
    } catch {
      /* skip malformed */
    }
  }
  return out
}

// Vectors WITH their model tag, for the per-route model guard (#5 family):
// a stored vector is only comparable to a query vector from the SAME model —
// the tag is the truth, the dimension is just a coincidence-prone proxy.
export function listEmbeddingsTagged(
  itemType: string
): Map<string, { vector: number[]; model: string }> {
  const rows = getDb()
    .prepare('SELECT item_id, vector_json, model FROM fb_embeddings WHERE item_type = ? AND org_id = ?')
    .all(itemType, getActiveOrgId()) as Pick<EmbeddingRow, 'item_id' | 'vector_json' | 'model'>[]
  const out = new Map<string, { vector: number[]; model: string }>()
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector_json)
      if (Array.isArray(v)) out.set(r.item_id, { vector: v as number[], model: r.model })
    } catch {
      /* skip malformed */
    }
  }
  return out
}

export function hasEmbedding(itemType: string, itemId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM fb_embeddings WHERE item_type = ? AND item_id = ?')
    .get(itemType, itemId)
  return !!row
}

export function deleteEmbedding(itemType: string, itemId: string): void {
  getDb().prepare('DELETE FROM fb_embeddings WHERE item_type = ? AND item_id = ?').run(itemType, itemId)
}
