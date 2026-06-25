import { getDb } from './database'

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
    `INSERT INTO fb_embeddings (item_type, item_id, vector_json, model, dim, updated_at)
     VALUES (@itemType, @itemId, @vector, @model, @dim, @now)
     ON CONFLICT(item_type, item_id)
     DO UPDATE SET vector_json = excluded.vector_json, model = excluded.model,
                   dim = excluded.dim, updated_at = excluded.updated_at`
  )

export function setEmbedding(itemType: string, itemId: string, vector: number[], model: string): void {
  upsertStmt().run({
    itemType,
    itemId,
    vector: JSON.stringify(vector),
    model,
    dim: vector.length,
    now: Date.now()
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
    .prepare('SELECT item_id, vector_json FROM fb_embeddings WHERE item_type = ?')
    .all(itemType) as Pick<EmbeddingRow, 'item_id' | 'vector_json'>[]
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

export function hasEmbedding(itemType: string, itemId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM fb_embeddings WHERE item_type = ? AND item_id = ?')
    .get(itemType, itemId)
  return !!row
}

export function deleteEmbedding(itemType: string, itemId: string): void {
  getDb().prepare('DELETE FROM fb_embeddings WHERE item_type = ? AND item_id = ?').run(itemType, itemId)
}
