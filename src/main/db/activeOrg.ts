import { getDb } from './database'

// The active organisation is the tenancy boundary for the local workspace. Each
// row in the org-scoped tables (nodes, documents, fb_files, connected_apps,
// dashboard_layouts) carries an org_id, and every list/create query filters and
// stamps by the org that is currently active.
//
// The user's own local-first data lives in a reserved "Personal" org so it works
// offline and needs no server account. Existing rows created before multi-org
// backfill to PERSONAL_ORG_ID via the column DEFAULT, so switching to Personal
// always shows exactly the data the user already had. A real server org uses its
// own id (e.g. "org_abc123"); switching to it shows only that org's rows.
export const PERSONAL_ORG_ID = 'personal'

const META_KEY = 'active_org_id'

// Cached so the hot path (every scoped query reads the active org) does not hit
// the DB each time. Invalidated on set.
let cached: string | null = null

export function getActiveOrgId(): string {
  if (cached) return cached
  const db = getDb()
  const row = db
    .prepare('SELECT value FROM sync_meta WHERE key = ?')
    .get(META_KEY) as { value: string } | undefined
  cached = row?.value || PERSONAL_ORG_ID
  return cached
}

export function setActiveOrgId(orgId: string): string {
  const next = (orgId || '').trim() || PERSONAL_ORG_ID
  const db = getDb()
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(META_KEY, next)
  cached = next
  return next
}
