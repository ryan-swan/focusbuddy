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
import type { FbFile } from '@shared/fields'

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
  opts: { originalName?: string; mimeType?: string } = {}
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
    createdAt: Date.now()
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
    createdAt: Date.now()
  })
}

function insertFileRow(meta: {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  ext: string
  createdAt: number
}): FbFile {
  const db = getDb()
  db.prepare(
    `INSERT INTO fb_files (id, original_name, mime_type, size_bytes, ext, created_at)
     VALUES (@id, @originalName, @mimeType, @sizeBytes, @ext, @createdAt)`
  ).run(meta)
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
