import { getDb } from './db/database'

// A cheap fingerprint of everything the extras pools read.
//
// The corpus these pools build is query-INDEPENDENT — the same nodes, tables,
// widgets, meetings and calendar blocks are assembled for every question — but
// it was rebuilt from scratch on every turn, which on a real workspace means
// hundreds of queries and a full text extraction before the model sees a word.
//
// Caching it needs an invalidation signal, and the existing one will not do:
// bumpAnswerCacheVersion() fires only on DOCUMENT changes (four call sites), so
// a cache keyed on it would happily serve a table, meeting or calendar block
// that had since changed. Stale context is a worse failure than a slow answer.
//
// So the signature is derived from the data itself rather than from anyone
// remembering to bump a counter: a row count and the latest updated_at per
// table. Any insert, update or delete moves one of them. These are indexed
// aggregates over columns SQLite already keeps — microseconds against the
// hundreds of milliseconds of the rebuild they guard.
const EXTRAS_TABLES = ['nodes', 'widgets', 'fb_tables', 'fb_rows', 'fb_meetings', 'time_blocks'] as const
// The document pool reads bodies and the AI-enriched metadata joined to them.
const DOC_TABLES = ['documents', 'fb_document_metadata'] as const

export function corpusSignature(orgId: string): string | null {
  return signatureOver(orgId, EXTRAS_TABLES)
}

export function documentSignature(orgId: string): string | null {
  return signatureOver(orgId, DOC_TABLES)
}

/**
 * Null when NOT ONE table could be read — no database in this context, or a
 * stubbed one. A caller must then rebuild rather than cache: a signature that
 * cannot see the data cannot detect it changing, and a cache keyed on a
 * constant silently serves whatever was built first. That is how a suite with a
 * mocked database ends up asserting against the previous test's workspace.
 */
function signatureOver(orgId: string, tables: readonly string[]): string | null {
  // getDb() itself can throw where there is no Electron app (tests, tooling), so
  // it sits inside the guard too — a signature is a best-effort optimisation and
  // must never be the reason a caller fails.
  let db: ReturnType<typeof getDb>
  try {
    db = getDb()
  } catch {
    return null
  }
  const parts: string[] = [orgId]
  let read = 0
  for (const t of tables) {
    try {
      const r = db
        .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM ${t}`)
        .get() as { n: number; m: number } | undefined
      parts.push(`${t}:${r?.n ?? 0}:${r?.m ?? 0}`)
      read++
    } catch {
      // A table absent in this build or context contributes a constant rather
      // than breaking the signature — the cache then simply never invalidates
      // on that pool, which is the same behaviour as before it existed.
      parts.push(`${t}:-`)
    }
  }
  return read === 0 ? null : parts.join('|')
}
