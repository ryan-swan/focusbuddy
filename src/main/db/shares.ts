import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { ShareableKind, ShareLink, SharedItem, ShareScope } from '@shared/types'

interface ShareLinkRow {
  id: string
  token: string
  kind: ShareableKind
  entity_id: string
  label: string
  scope: ShareScope
  created_at: number
  expires_at: number | null
  view_count: number
  revoked: number
}

interface SharedWithMeRow {
  id: string
  token: string
  kind: ShareableKind
  snapshot_json: string
  from_handle: string
  accepted_at: number
  scope: ShareScope
}

function rowToShareLink(row: ShareLinkRow): ShareLink {
  return {
    id: row.id,
    token: row.token,
    kind: row.kind,
    entityId: row.entity_id,
    label: row.label,
    scope: row.scope,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    revoked: row.revoked === 1
  }
}

function rowToSharedItem(row: SharedWithMeRow): SharedItem {
  return {
    id: row.id,
    token: row.token,
    kind: row.kind,
    snapshot: JSON.parse(row.snapshot_json) as unknown,
    fromHandle: row.from_handle,
    acceptedAt: row.accepted_at,
    scope: row.scope
  }
}

export function createShareLink(input: {
  token: string
  kind: ShareableKind
  entityId: string
  label: string
  scope: ShareScope
  expiresAt: number | null
}): ShareLink {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO share_links (id, token, kind, entity_id, label, scope, created_at, expires_at, view_count, revoked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
  ).run(
    id,
    input.token,
    input.kind,
    input.entityId,
    input.label,
    input.scope,
    now,
    input.expiresAt
  )
  return {
    id,
    token: input.token,
    kind: input.kind,
    entityId: input.entityId,
    label: input.label,
    scope: input.scope,
    createdAt: now,
    expiresAt: input.expiresAt,
    viewCount: 0,
    revoked: false
  }
}

export function listShareLinksForEntity(
  kind: ShareableKind,
  entityId: string
): ShareLink[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM share_links WHERE kind = ? AND entity_id = ? ORDER BY created_at DESC'
    )
    .all(kind, entityId) as ShareLinkRow[]
  return rows.map(rowToShareLink)
}

export function listAllShareLinks(): ShareLink[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM share_links ORDER BY created_at DESC')
    .all() as ShareLinkRow[]
  return rows.map(rowToShareLink)
}

export function revokeShareLink(id: string): boolean {
  const db = getDb()
  const result = db
    .prepare('UPDATE share_links SET revoked = 1 WHERE id = ?')
    .run(id)
  return result.changes > 0
}

export function deleteShareLink(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM share_links WHERE id = ?').run(id)
  return result.changes > 0
}

export function listSharedWithMe(): SharedItem[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM shared_with_me ORDER BY accepted_at DESC')
    .all() as SharedWithMeRow[]
  return rows.map(rowToSharedItem)
}

export function acceptShare(input: {
  token: string
  kind: ShareableKind
  snapshot: unknown
  fromHandle: string
  scope: ShareScope
}): SharedItem {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO shared_with_me (id, token, kind, snapshot_json, from_handle, accepted_at, scope)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.token,
    input.kind,
    JSON.stringify(input.snapshot),
    input.fromHandle,
    now,
    input.scope
  )
  return {
    id,
    token: input.token,
    kind: input.kind,
    snapshot: input.snapshot,
    fromHandle: input.fromHandle,
    acceptedAt: now,
    scope: input.scope
  }
}

export function removeSharedItem(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM shared_with_me WHERE id = ?').run(id)
  return result.changes > 0
}
