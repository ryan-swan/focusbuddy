import { randomUUID } from 'crypto'
import { getDb } from './database'

// Local-document comments (live docs keep theirs on the signal server). Flat
// rows; the renderer folds parent_id chains into threads.

export interface DocComment {
  id: string
  docId: string
  parentId: string | null
  anchorId: string | null
  author: string
  body: string
  resolved: boolean
  createdAt: number
}

interface Row {
  id: string
  doc_id: string
  parent_id: string | null
  anchor_id: string | null
  author: string
  body: string
  resolved: number
  created_at: number
}

function toComment(r: Row): DocComment {
  return {
    id: r.id,
    docId: r.doc_id,
    parentId: r.parent_id,
    anchorId: r.anchor_id,
    author: r.author,
    body: r.body,
    resolved: r.resolved === 1,
    createdAt: r.created_at
  }
}

export function listDocComments(docId: string): DocComment[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM doc_comments WHERE doc_id = ? ORDER BY created_at ASC')
    .all(docId) as Row[]
  return rows.map(toComment)
}

export function addDocComment(input: {
  docId: string
  body: string
  author: string
  anchorId?: string | null
  parentId?: string | null
}): DocComment {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO doc_comments (id, doc_id, parent_id, anchor_id, author, body, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, input.docId, input.parentId ?? null, input.anchorId ?? null, input.author, input.body, Date.now())
  const row = db.prepare('SELECT * FROM doc_comments WHERE id = ?').get(id) as Row
  return toComment(row)
}

export function resolveDocComment(id: string, resolved: boolean): boolean {
  const db = getDb()
  const r = db.prepare('UPDATE doc_comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id)
  return r.changes > 0
}
