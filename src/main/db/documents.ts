import { randomUUID } from 'crypto'
import { getDb } from './database'
import type {
  DocBody,
  DocumentDraft,
  DocumentMeta,
  DocumentPatch,
  FbDocument,
  SheetBody,
  SlidesBody
} from '@shared/types'
import { migrateSlidesBody } from '@shared/slidesMigrate'

// Office documents store — CRUD for standalone doc / sheet / slides files. The
// body is persisted as a JSON string; the shape depends on doc_type and is
// validated only loosely here (the editors own the shape), so an older body
// schema never blocks a read.

interface DocumentRow {
  id: string
  doc_type: FbDocument['docType']
  title: string
  body: string
  archived: number
  created_at: number
  updated_at: number
}

function parseBody(
  type: FbDocument['docType'],
  raw: string
): DocBody | SheetBody | SlidesBody {
  try {
    const parsed = JSON.parse(raw)
    // Slides bodies are migrated to the v2 element model on read, so a legacy
    // deck always opens as editable elements without rewriting the file at rest.
    if (type === 'slides') return migrateSlidesBody(parsed as SlidesBody)
    return parsed
  } catch {
    // Corrupt or empty — hand back a valid empty body for the type so the
    // editor still opens rather than throwing.
    return emptyBody(type)
  }
}

export function emptyBody(type: FbDocument['docType']): DocBody | SheetBody | SlidesBody {
  if (type === 'sheet') {
    return { columns: ['A', 'B', 'C'], rows: Array.from({ length: 8 }, () => ['', '', '']) }
  }
  if (type === 'slides') {
    // Build a v1 starter slide and migrate it, so a fresh deck is already v2.
    return migrateSlidesBody({
      slides: [{ id: randomUUID(), title: 'Title slide', bullets: [], notes: '', layout: 'title' }]
    })
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function rowToDoc(row: DocumentRow): FbDocument {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    body: parseBody(row.doc_type, row.body),
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToMeta(row: Omit<DocumentRow, 'body'>): DocumentMeta {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** All non-archived documents, newest-edited first (metadata only). */
export function listDocuments(): DocumentMeta[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, doc_type, title, archived, created_at, updated_at
       FROM documents WHERE archived = 0 ORDER BY updated_at DESC`
    )
    .all() as Omit<DocumentRow, 'body'>[]
  return rows.map(rowToMeta)
}

export function getDocument(id: string): FbDocument | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | DocumentRow
    | undefined
  return row ? rowToDoc(row) : null
}

export function createDocument(draft: DocumentDraft): FbDocument {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  const body = draft.body ?? emptyBody(draft.docType)
  db.prepare(
    `INSERT INTO documents (id, doc_type, title, body, archived, created_at, updated_at)
     VALUES (@id, @docType, @title, @body, 0, @now, @now)`
  ).run({
    id,
    docType: draft.docType,
    title: draft.title || 'Untitled',
    body: JSON.stringify(body),
    now
  })
  return getDocument(id) as FbDocument
}

export function updateDocument(id: string, patch: DocumentPatch): FbDocument | null {
  const db = getDb()
  const existing = getDocument(id)
  if (!existing) return null
  const now = Date.now()
  const sets: string[] = ['updated_at = @now']
  const params: Record<string, unknown> = { id, now }
  if (patch.title !== undefined) {
    sets.push('title = @title')
    params.title = patch.title
  }
  if (patch.body !== undefined) {
    sets.push('body = @body')
    params.body = JSON.stringify(patch.body)
  }
  if (patch.archived !== undefined) {
    sets.push('archived = @archived')
    params.archived = patch.archived ? 1 : 0
  }
  db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getDocument(id)
}

// Insert-or-replace by an explicit id. Used by cloud-document sync to land a
// document from the server under its own id (the normal create() mints a fresh
// id, which would break id alignment across devices/apps). `updatedAt` lets the
// caller preserve the server's timestamp.
export function upsertDocument(input: {
  id: string
  docType: FbDocument['docType']
  title: string
  body: DocBody | SheetBody | SlidesBody
  archived?: boolean
  updatedAt?: number
}): FbDocument {
  const db = getDb()
  const existing = getDocument(input.id)
  const now = input.updatedAt ?? Date.now()
  const bodyStr = JSON.stringify(input.body)
  const archived = input.archived ? 1 : 0
  if (existing) {
    db.prepare(
      `UPDATE documents SET doc_type = @docType, title = @title, body = @body,
         archived = @archived, updated_at = @now WHERE id = @id`
    ).run({ id: input.id, docType: input.docType, title: input.title, body: bodyStr, archived, now })
  } else {
    db.prepare(
      `INSERT INTO documents (id, doc_type, title, body, archived, created_at, updated_at)
       VALUES (@id, @docType, @title, @body, @archived, @now, @now)`
    ).run({ id: input.id, docType: input.docType, title: input.title, body: bodyStr, archived, now })
  }
  return getDocument(input.id) as FbDocument
}

export function deleteDocument(id: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  return info.changes > 0
}
