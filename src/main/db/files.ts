import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join, extname, basename } from 'path'
import { app } from 'electron'
import { getDb } from './database'
import type { FbFile, FileEntry } from '@shared/fields'

// All uploaded files live in userData/files. We deliberately use the file's
// own UUID + original extension as the on-disk name so the OS preview pane
// (Quick Look, etc.) still works if the user ever navigates to the folder.
function filesDir(): string {
  const dir = join(app.getPath('userData'), 'files')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

interface FileRow {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  ext: string
  created_at: number
}

function rowToFile(row: FileRow): FbFile {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    ext: row.ext,
    storedPath: join(filesDir(), `${row.id}${row.ext}`),
    createdAt: row.created_at
  }
}

/**
 * Ingest a file from a source path on disk. Copies it into userData/files
 * with a fresh UUID, records metadata, and returns the FbFile. Original is
 * left untouched.
 */
export function ingestFromPath(
  sourcePath: string,
  opts: { originalName?: string; mimeType?: string; parentId?: string | null } = {}
): FbFile {
  if (!existsSync(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`)
  }
  const stats = statSync(sourcePath)
  const original = opts.originalName ?? basename(sourcePath)
  const ext = extname(original).toLowerCase()
  const id = randomUUID()
  const dest = join(filesDir(), `${id}${ext}`)
  copyFileSync(sourcePath, dest)
  return insertFileRow({
    id,
    originalName: original,
    mimeType: opts.mimeType ?? mimeFromExt(ext),
    sizeBytes: stats.size,
    ext,
    createdAt: Date.now(),
    parentId: opts.parentId ?? null
  })
}

/**
 * Ingest from raw bytes — e.g. when the renderer reads the file via the File
 * API and ships the ArrayBuffer over IPC. Used for HTML5 drag-drop of files
 * that don't expose a real .path (Electron 32+ removed File.path).
 */
export function ingestFromBuffer(input: {
  buffer: Uint8Array
  originalName: string
  mimeType: string
  parentId?: string | null
}): FbFile {
  const ext = extname(input.originalName).toLowerCase()
  const id = randomUUID()
  const dest = join(filesDir(), `${id}${ext}`)
  writeFileSync(dest, input.buffer)
  return insertFileRow({
    id,
    originalName: input.originalName,
    mimeType: input.mimeType || mimeFromExt(ext),
    sizeBytes: input.buffer.length,
    ext,
    createdAt: Date.now(),
    parentId: input.parentId ?? null
  })
}

function insertFileRow(meta: {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  ext: string
  createdAt: number
  parentId?: string | null
}): FbFile {
  const db = getDb()
  db.prepare(
    `INSERT INTO fb_files
       (id, original_name, mime_type, size_bytes, ext, created_at, parent_id, kind, display_name, updated_at)
     VALUES (@id, @originalName, @mimeType, @sizeBytes, @ext, @createdAt, @parentId, 'file', @originalName, @createdAt)`
  ).run({ ...meta, parentId: meta.parentId ?? null })
  return rowToFile({
    id: meta.id,
    original_name: meta.originalName,
    mime_type: meta.mimeType,
    size_bytes: meta.sizeBytes,
    ext: meta.ext,
    created_at: meta.createdAt
  })
}

export function getFile(id: string): FbFile | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_files WHERE id = ?').get(id) as
    | FileRow
    | undefined
  return row ? rowToFile(row) : null
}

export function deleteFile(id: string): boolean {
  const file = getFile(id)
  if (!file) return false
  try {
    unlinkSync(file.storedPath)
  } catch {
    // best-effort — DB row removal is the source of truth
  }
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_files WHERE id = ?').run(id)
  return r.changes > 0
}

/**
 * Read the file's bytes — used when the renderer needs the raw content (e.g.
 * to show an image via blob URL). We pass through the on-disk read; there's
 * no cache layer, but files are small enough and rare enough that it's fine.
 */
export function readFileBytes(id: string): { mimeType: string; bytes: Buffer } | null {
  const file = getFile(id)
  if (!file) return null
  try {
    const bytes = readFileSync(file.storedPath)
    return { mimeType: file.mimeType, bytes }
  } catch {
    return null
  }
}

// ── File/folder manager ──────────────────────────────────────────────────────
// fb_files doubles as the manager's tree: folders (kind 'folder'), imported
// external files (kind 'file'), and references to internal documents filed into
// a folder (kind 'doc', resolved live from the documents table so renames show).

interface EntryRow {
  id: string
  parent_id: string | null
  kind: 'folder' | 'file' | 'doc'
  original_name: string
  display_name: string | null
  mime_type: string
  size_bytes: number
  ext: string
  doc_id: string | null
  doc_type: string | null
  created_at: number
  updated_at: number | null
}

function childCount(id: string): number {
  const db = getDb()
  const r = db.prepare('SELECT COUNT(*) as n FROM fb_files WHERE parent_id = ?').get(id) as { n: number }
  return r.n
}

// Resolve a row into a FileEntry. Returns null for a doc reference whose
// document has been deleted or archived (a dangling reference), so the caller
// can clean it up rather than show a ghost.
function rowToEntry(row: EntryRow): FileEntry | null {
  const base = {
    id: row.id,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at
  }
  if (row.kind === 'folder') {
    return { ...base, kind: 'folder', name: row.display_name || row.original_name || 'Folder', childCount: childCount(row.id) }
  }
  if (row.kind === 'doc') {
    if (!row.doc_id) return null
    const db = getDb()
    const doc = db
      .prepare('SELECT title, doc_type, updated_at FROM documents WHERE id = ? AND archived = 0')
      .get(row.doc_id) as { title: string; doc_type: string; updated_at: number } | undefined
    if (!doc) return null
    return {
      ...base,
      kind: 'doc',
      name: doc.title || 'Untitled',
      docId: row.doc_id,
      docType: doc.doc_type as FileEntry['docType'],
      updatedAt: doc.updated_at
    }
  }
  return {
    ...base,
    kind: 'file',
    name: row.display_name || row.original_name,
    ext: row.ext,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes
  }
}

const ENTRY_COLS =
  'id, parent_id, kind, original_name, display_name, mime_type, size_bytes, ext, doc_id, doc_type, created_at, updated_at'

export function listEntries(parentId: string | null): FileEntry[] {
  const db = getDb()
  const rows = (
    parentId == null
      ? db.prepare(`SELECT ${ENTRY_COLS} FROM fb_files WHERE parent_id IS NULL`).all()
      : db.prepare(`SELECT ${ENTRY_COLS} FROM fb_files WHERE parent_id = ?`).all(parentId)
  ) as EntryRow[]
  const out: FileEntry[] = []
  for (const row of rows) {
    const entry = rowToEntry(row)
    if (entry) out.push(entry)
    else if (row.kind === 'doc') db.prepare('DELETE FROM fb_files WHERE id = ?').run(row.id) // prune dangling
  }
  return out
}

export function getEntry(id: string): FileEntry | null {
  const db = getDb()
  const row = db.prepare(`SELECT ${ENTRY_COLS} FROM fb_files WHERE id = ?`).get(id) as EntryRow | undefined
  return row ? rowToEntry(row) : null
}

// The folder chain from root to the given folder, for breadcrumbs.
export function folderPath(id: string | null): Array<{ id: string; name: string }> {
  if (!id) return []
  const db = getDb()
  const chain: Array<{ id: string; name: string }> = []
  let cur: string | null = id
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const row = db.prepare('SELECT id, parent_id, display_name, original_name, kind FROM fb_files WHERE id = ?').get(cur) as
      | { id: string; parent_id: string | null; display_name: string | null; original_name: string; kind: string }
      | undefined
    if (!row || row.kind !== 'folder') break
    chain.unshift({ id: row.id, name: row.display_name || row.original_name || 'Folder' })
    cur = row.parent_id
  }
  return chain
}

export function createFolder(parentId: string | null, name: string): FileEntry {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  const folderName = name.trim() || 'New folder'
  db.prepare(
    `INSERT INTO fb_files
       (id, original_name, mime_type, size_bytes, ext, created_at, parent_id, kind, display_name, updated_at)
     VALUES (@id, @name, '', 0, '', @now, @parentId, 'folder', @name, @now)`
  ).run({ id, name: folderName, now, parentId })
  return { id, parentId, kind: 'folder', name: folderName, childCount: 0, createdAt: now, updatedAt: now }
}

export function renameEntry(id: string, name: string): FileEntry | null {
  const db = getDb()
  db.prepare('UPDATE fb_files SET display_name = ?, updated_at = ? WHERE id = ?').run(name.trim() || 'Untitled', Date.now(), id)
  return getEntry(id)
}

// Walk up from `nodeId`; true if `ancestorId` is on the path (so moving a
// folder into its own descendant can be refused).
function isDescendantOf(nodeId: string | null, ancestorId: string): boolean {
  const db = getDb()
  let cur = nodeId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true
    seen.add(cur)
    const row = db.prepare('SELECT parent_id FROM fb_files WHERE id = ?').get(cur) as { parent_id: string | null } | undefined
    cur = row?.parent_id ?? null
  }
  return false
}

export function moveEntry(id: string, newParentId: string | null): boolean {
  if (id === newParentId) return false
  if (newParentId && isDescendantOf(newParentId, id)) return false
  const db = getDb()
  return db.prepare('UPDATE fb_files SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id).changes > 0
}

export function deleteEntry(id: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT id, kind, ext FROM fb_files WHERE id = ?').get(id) as
    | { id: string; kind: string; ext: string }
    | undefined
  if (!row) return false
  if (row.kind === 'folder') {
    const children = db.prepare('SELECT id FROM fb_files WHERE parent_id = ?').all(id) as Array<{ id: string }>
    for (const c of children) deleteEntry(c.id)
  } else if (row.kind === 'file') {
    // Remove the stored blob; a doc reference never deletes the document.
    try {
      unlinkSync(join(filesDir(), `${row.id}${row.ext}`))
    } catch {
      // best-effort
    }
  }
  return db.prepare('DELETE FROM fb_files WHERE id = ?').run(id).changes > 0
}

// File an internal document into a folder. A document lives in exactly one
// place, so re-filing moves its reference rather than duplicating it.
export function fileDocument(docId: string, parentId: string | null): FileEntry | null {
  const db = getDb()
  const doc = db.prepare('SELECT id, doc_type, title FROM documents WHERE id = ? AND archived = 0').get(docId) as
    | { id: string; doc_type: string; title: string }
    | undefined
  if (!doc) return null
  const now = Date.now()
  const existing = db.prepare("SELECT id FROM fb_files WHERE kind = 'doc' AND doc_id = ?").get(docId) as
    | { id: string }
    | undefined
  if (existing) {
    db.prepare('UPDATE fb_files SET parent_id = ?, updated_at = ? WHERE id = ?').run(parentId, now, existing.id)
    return getEntry(existing.id)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO fb_files
       (id, original_name, mime_type, size_bytes, ext, created_at, parent_id, kind, doc_id, doc_type, updated_at)
     VALUES (@id, @title, '', 0, '', @now, @parentId, 'doc', @docId, @docType, @now)`
  ).run({ id, title: doc.title, now, parentId, docId, docType: doc.doc_type })
  return getEntry(id)
}

// Documents not yet filed anywhere — offered in the "add existing document"
// picker so a doc isn't shown twice in the same view.
export function unfiledDocuments(): Array<{ id: string; title: string; docType: string }> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, title, doc_type FROM documents
       WHERE archived = 0 AND id NOT IN (SELECT doc_id FROM fb_files WHERE kind = 'doc' AND doc_id IS NOT NULL)
       ORDER BY updated_at DESC`
    )
    .all() as Array<{ id: string; title: string; doc_type: string }>
  return rows.map((r) => ({ id: r.id, title: r.title, docType: r.doc_type }))
}

// Lightweight MIME guesser for the dozen extensions we actually care about.
// We don't want a full mime-types dependency for the handful of cases that
// matter for previews.
function mimeFromExt(ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return map[e] ?? 'application/octet-stream'
}
