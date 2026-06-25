import { randomUUID, randomBytes, createHash } from 'crypto'
import { getDb } from './database'
import type { ApiScope, ApiTokenPublic, CreateTokenResult, ApiServerConfig } from '@shared/apiAccess'

// PlexiAPI token + config store. Tokens are stored only as a sha256 hash; the raw
// value is generated once, returned once, and never persisted, so a leak of the
// database cannot reveal a working token. The server config is a single row that
// defaults to disabled, so the local API is off until the user turns it on.

interface TokenRow {
  id: string
  name: string
  token_hash: string
  scopes_json: string
  created_at: number
  last_used_at: number | null
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function parseScopes(raw: string): ApiScope[] {
  try {
    const s = JSON.parse(raw)
    return Array.isArray(s) ? (s as ApiScope[]) : ['read']
  } catch {
    return ['read']
  }
}

function rowToPublic(r: TokenRow): ApiTokenPublic {
  return {
    id: r.id,
    name: r.name,
    scopes: parseScopes(r.scopes_json),
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at
  }
}

export function listTokens(): ApiTokenPublic[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM fb_api_tokens ORDER BY created_at DESC').all() as TokenRow[]).map(rowToPublic)
}

export function createToken(name: string, scopes: ApiScope[]): CreateTokenResult {
  const db = getDb()
  const id = randomUUID()
  // A 32-byte token, prefixed so it is recognisable in logs and config files.
  const secret = `plx_${randomBytes(32).toString('hex')}`
  const now = Date.now()
  const cleanScopes: ApiScope[] = scopes.length ? scopes : ['read']
  db.prepare(
    'INSERT INTO fb_api_tokens (id, name, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name || 'Token', hashToken(secret), JSON.stringify(cleanScopes), now)
  return {
    token: { id, name: name || 'Token', scopes: cleanScopes, createdAt: now, lastUsedAt: null },
    secret
  }
}

export function revokeToken(id: string): boolean {
  const db = getDb()
  return db.prepare('DELETE FROM fb_api_tokens WHERE id = ?').run(id).changes > 0
}

// Resolve a raw bearer token to its scopes, or null when unknown. Updates
// last_used_at so the UI can show when a token was last seen.
export function verifyToken(raw: string): { id: string; scopes: ApiScope[] } | null {
  if (!raw) return null
  const db = getDb()
  const r = db.prepare('SELECT * FROM fb_api_tokens WHERE token_hash = ?').get(hashToken(raw)) as
    | TokenRow
    | undefined
  if (!r) return null
  db.prepare('UPDATE fb_api_tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), r.id)
  return { id: r.id, scopes: parseScopes(r.scopes_json) }
}

interface ConfigRow {
  enabled: number
  port: number
}

function readConfigRow(): ConfigRow {
  const db = getDb()
  const r = db.prepare('SELECT enabled, port FROM fb_api_config WHERE id = 1').get() as ConfigRow | undefined
  if (r) return r
  db.prepare('INSERT OR IGNORE INTO fb_api_config (id, enabled, port) VALUES (1, 0, 8787)').run()
  return { enabled: 0, port: 8787 }
}

export function getApiConfig(): { enabled: boolean; port: number } {
  const r = readConfigRow()
  return { enabled: r.enabled === 1, port: r.port }
}

export function setApiConfig(patch: { enabled?: boolean; port?: number }): { enabled: boolean; port: number } {
  const db = getDb()
  readConfigRow()
  if (patch.enabled !== undefined) db.prepare('UPDATE fb_api_config SET enabled = ? WHERE id = 1').run(patch.enabled ? 1 : 0)
  if (patch.port !== undefined && patch.port > 0) db.prepare('UPDATE fb_api_config SET port = ? WHERE id = 1').run(Math.floor(patch.port))
  return getApiConfig()
}

export type { ApiServerConfig }
