import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type {
  DashboardCardKind,
  DashboardCardSize,
  DashboardColumns,
  DashboardLayout,
  DashboardLayoutInput
} from '@shared/types'
import { DEFAULT_DASHBOARD_COLUMNS } from '@shared/types'

export type { DashboardLayoutInput }

interface LayoutRow {
  dashboard_key: string
  card_ids: string
  updated_at: number
}

const VALID_KINDS: DashboardCardKind[] = [
  'quick-start',
  'stats',
  'garden',
  'today-tasks',
  'recent-activity',
  'energy',
  'folders',
  'workspace-progress',
  'workspace-health',
  'focus-session',
  'ai-assistant',
  'recent-notes'
]

const VALID_SIZES: DashboardCardSize[] = ['small', 'medium', 'large']
const VALID_COLUMNS: DashboardColumns[] = [1, 2, 3]

function isCardKind(v: unknown): v is DashboardCardKind {
  return typeof v === 'string' && (VALID_KINDS as string[]).includes(v)
}

// The card_ids column has historically stored a bare JSON array of card ids.
// We now store a richer shape, but old rows MUST keep loading. So on read we
// accept BOTH forms: a legacy array, or the new object holding cardIds plus a
// column count and a per-card size map. Anything unrecognised falls back to the
// safe defaults so a single corrupt row can never wipe a user's dashboard.
interface StoredLayout {
  cardIds: DashboardCardKind[]
  columns: DashboardColumns
  sizes: Partial<Record<DashboardCardKind, DashboardCardSize>>
}

function parseCardIds(arr: unknown): DashboardCardKind[] {
  if (!Array.isArray(arr)) return []
  return arr.filter(isCardKind)
}

function parseColumns(v: unknown): DashboardColumns {
  return VALID_COLUMNS.includes(v as DashboardColumns)
    ? (v as DashboardColumns)
    : DEFAULT_DASHBOARD_COLUMNS
}

function parseSizes(v: unknown): Partial<Record<DashboardCardKind, DashboardCardSize>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Partial<Record<DashboardCardKind, DashboardCardSize>> = {}
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    if (isCardKind(key) && VALID_SIZES.includes(val as DashboardCardSize)) {
      out[key] = val as DashboardCardSize
    }
  }
  return out
}

// Lazy read migration. A legacy row is a JSON array; a current row is an object.
function parseStored(json: string): StoredLayout {
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) {
      // Legacy bare-array layout — treat as the ordered cards with default
      // column count and no per-card sizes.
      return {
        cardIds: parseCardIds(parsed),
        columns: DEFAULT_DASHBOARD_COLUMNS,
        sizes: {}
      }
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      return {
        cardIds: parseCardIds(obj.cardIds),
        columns: parseColumns(obj.columns),
        sizes: parseSizes(obj.sizes)
      }
    }
  } catch {
    // fall through to defaults
  }
  return { cardIds: [], columns: DEFAULT_DASHBOARD_COLUMNS, sizes: {} }
}

function rowToLayout(row: LayoutRow): DashboardLayout {
  const stored = parseStored(row.card_ids)
  return {
    dashboardKey: row.dashboard_key,
    cardIds: stored.cardIds,
    columns: stored.columns,
    sizes: stored.sizes,
    updatedAt: row.updated_at
  }
}

// The dashboard_key is the table's primary key, so to give each organisation its
// own layout for the same logical dashboard we qualify the stored key with the
// active org id. Callers still pass the plain key (e.g. 'home'); the org prefix
// is applied here and stripped from what we return, so the renderer never sees
// it. This scopes layouts per org without rebuilding the table's primary key.
function orgKey(key: string): string {
  return `${getActiveOrgId()}::${key}`
}

export function getDashboardLayout(key: string): DashboardLayout | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM dashboard_layouts WHERE dashboard_key = ?')
    .get(orgKey(key)) as LayoutRow | undefined
  return row ? { ...rowToLayout(row), dashboardKey: key } : null
}

export function setDashboardLayout(
  key: string,
  input: DashboardCardKind[] | DashboardLayoutInput
): DashboardLayout {
  const db = getDb()
  const now = Date.now()

  // Back-compat call form: a bare card-id array. Preserve any column/size prefs
  // already stored for this key so an old-style setLayout does not clobber them.
  const asInput: DashboardLayoutInput = Array.isArray(input)
    ? { cardIds: input }
    : input

  let columns = asInput.columns
  let sizes = asInput.sizes
  if (columns === undefined || sizes === undefined) {
    const existing = getDashboardLayout(key)
    if (columns === undefined) columns = existing?.columns ?? DEFAULT_DASHBOARD_COLUMNS
    if (sizes === undefined) sizes = existing?.sizes ?? {}
  }

  const stored: StoredLayout = {
    cardIds: asInput.cardIds,
    columns,
    sizes
  }
  const json = JSON.stringify(stored)
  db.prepare(
    `INSERT INTO dashboard_layouts (dashboard_key, card_ids, updated_at)
     VALUES (@key, @json, @now)
     ON CONFLICT(dashboard_key) DO UPDATE SET card_ids = @json, updated_at = @now`
  ).run({ key: orgKey(key), json, now })
  return {
    dashboardKey: key,
    cardIds: stored.cardIds,
    columns: stored.columns,
    sizes: stored.sizes,
    updatedAt: now
  }
}

export function deleteDashboardLayout(key: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM dashboard_layouts WHERE dashboard_key = ?').run(orgKey(key))
  return r.changes > 0
}
