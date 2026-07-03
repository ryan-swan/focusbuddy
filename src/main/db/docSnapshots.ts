import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getDocument, updateDocument } from './documents'
import type { DocSnapshotMeta, FbDocument } from '@shared/types'

// Document version history — the canvas_snapshots pattern applied to office
// files. A snapshot is the document's full body (as persisted JSON) at a moment
// in time. Snapshots are captured on the save path in the main process, so
// every doc type (doc / sheet / slides / map / design) accrues history with no
// per-editor wiring. Two guards keep the table small: identical-payload dedupe,
// and a minimum interval between automatic snapshots (explicit labels bypass
// it). We keep the newest MAX_PER_DOC and prune the rest.

const MAX_PER_DOC = 50
const MIN_AUTO_INTERVAL_MS = 5 * 60 * 1000

interface DocSnapshotRow {
  id: string
  doc_id: string
  at: number
  label: string
  title: string
  payload: string
}

function rowToMeta(r: Omit<DocSnapshotRow, 'payload'>): DocSnapshotMeta {
  return { id: r.id, docId: r.doc_id, at: r.at, label: r.label, title: r.title }
}

/**
 * Record a snapshot of the document's current body. Automatic captures (no
 * label) are skipped when the newest snapshot is either identical or younger
 * than MIN_AUTO_INTERVAL_MS; labelled captures (e.g. "Before restore") always
 * land so restore stays reversible.
 */
export function captureDocSnapshot(docId: string, label = ''): DocSnapshotMeta | null {
  const doc = getDocument(docId)
  if (!doc) return null
  const db = getDb()
  const payload = JSON.stringify(doc.body)
  const last = db
    .prepare('SELECT id, doc_id, at, label, title, payload FROM doc_snapshots WHERE doc_id = ? ORDER BY at DESC LIMIT 1')
    .get(docId) as DocSnapshotRow | undefined
  if (last && last.payload === payload) return rowToMeta(last)
  if (!label && last && Date.now() - last.at < MIN_AUTO_INTERVAL_MS) return null
  const id = randomUUID()
  const at = Date.now()
  db.prepare(
    'INSERT INTO doc_snapshots (id, doc_id, at, label, title, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, docId, at, label, doc.title, payload)
  db.prepare(
    `DELETE FROM doc_snapshots
      WHERE doc_id = ?
        AND id NOT IN (SELECT id FROM doc_snapshots WHERE doc_id = ? ORDER BY at DESC LIMIT ?)`
  ).run(docId, docId, MAX_PER_DOC)
  return { id, docId, at, label, title: doc.title }
}

export function listDocSnapshots(docId: string): DocSnapshotMeta[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, doc_id, at, label, title FROM doc_snapshots WHERE doc_id = ? ORDER BY at DESC')
    .all(docId) as Array<Omit<DocSnapshotRow, 'payload'>>
  return rows.map(rowToMeta)
}

/**
 * Restore a snapshot's body onto its document. The current state is captured
 * first ("Before restore"), so restoring is itself undoable from the history
 * list. Returns the updated document for the editor to reload.
 */
export function restoreDocSnapshot(snapshotId: string): FbDocument | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM doc_snapshots WHERE id = ?').get(snapshotId) as
    | DocSnapshotRow
    | undefined
  if (!row) return null
  const doc = getDocument(row.doc_id)
  if (!doc) return null
  captureDocSnapshot(row.doc_id, 'Before restore')
  let body: FbDocument['body']
  try {
    body = JSON.parse(row.payload) as FbDocument['body']
  } catch {
    return null
  }
  return updateDocument(row.doc_id, { body })
}
