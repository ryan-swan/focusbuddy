// Table filtering + grouping engine.
//
// Pure functions shared by the table widget: given the schema, the rows, and a
// TableFilterConfig / TableGroupConfig (stored in TableSchema.viewConfig), it
// decides which rows are visible and how they split into groups. Keeping this
// logic out of the component makes it unit-testable and lets every view apply
// the same filter contract.

import type {
  FieldDefinition,
  FieldType,
  FilterOperator,
  FilterRule,
  FbRow,
  SelectOption,
  TableFilterConfig,
  TableSchema
} from '@shared/fields'

// Operators offered per field type. Order here is the order shown in the
// operator dropdown. 'button' is intentionally absent — you can't filter on a
// column that stores no value.
export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  'text-short': ['contains', 'not-contains', 'is', 'is-not', 'is-empty', 'is-not-empty'],
  'text-long': ['contains', 'not-contains', 'is', 'is-not', 'is-empty', 'is-not-empty'],
  'text-rich': ['contains', 'not-contains', 'is-empty', 'is-not-empty'],
  number: ['is', 'is-not', 'gt', 'lt', 'gte', 'lte', 'is-empty', 'is-not-empty'],
  checkbox: ['is-checked', 'is-unchecked'],
  'single-select': ['is', 'is-not', 'is-any-of', 'is-empty', 'is-not-empty'],
  'multi-select': ['is-any-of', 'has-all-of', 'has-none-of', 'is-empty', 'is-not-empty'],
  date: ['is', 'before', 'after', 'on-or-before', 'on-or-after', 'is-empty', 'is-not-empty'],
  attachment: ['is-empty', 'is-not-empty'],
  relation: ['is-empty', 'is-not-empty'],
  button: [],
  'doc-ref': ['is-empty', 'is-not-empty']
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  'is-not': 'is not',
  contains: 'contains',
  'not-contains': 'does not contain',
  'is-empty': 'is empty',
  'is-not-empty': 'is not empty',
  gt: 'greater than',
  lt: 'less than',
  gte: 'greater or equal',
  lte: 'less or equal',
  'is-checked': 'is checked',
  'is-unchecked': 'is unchecked',
  'is-any-of': 'is any of',
  'has-all-of': 'has all of',
  'has-none-of': 'has none of',
  before: 'is before',
  after: 'is after',
  'on-or-before': 'is on or before',
  'on-or-after': 'is on or after'
}

// Operators that take no argument — the value editor is hidden for these.
const NO_VALUE_OPERATORS = new Set<FilterOperator>([
  'is-empty',
  'is-not-empty',
  'is-checked',
  'is-unchecked'
])

export function operatorNeedsValue(op: FilterOperator): boolean {
  return !NO_VALUE_OPERATORS.has(op)
}

// Whether the value editor should let the user pick multiple options (the
// multi-select set operators).
export function operatorWantsMultiValue(op: FilterOperator): boolean {
  return op === 'is-any-of' || op === 'has-all-of' || op === 'has-none-of'
}

// True when a stored cell value counts as "empty" for filtering/grouping.
function isEmptyValue(type: FieldType, value: unknown): boolean {
  if (value == null) return true
  if (type === 'checkbox') return false // a checkbox is always true or false
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asString(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(' ')
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (value == null || value === '') return []
  return [String(value)]
}

// Normalise a unix-ms timestamp to the start of its UTC day, so date
// comparisons ignore the time component unless we explicitly want it.
function dayStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Evaluate one rule against one row's cell value. Returns true = row passes.
export function evaluateRule(
  rule: FilterRule,
  col: FieldDefinition,
  cellValue: unknown
): boolean {
  const op = rule.operator
  const empty = isEmptyValue(col.type, cellValue)

  switch (op) {
    case 'is-empty':
      return empty
    case 'is-not-empty':
      return !empty
    case 'is-checked':
      return cellValue === true
    case 'is-unchecked':
      return cellValue !== true
    default:
      break
  }

  // From here every operator needs a value; a rule with no value is treated as
  // "not yet configured" and passes everything (so a half-built filter doesn't
  // blank the table).
  if (rule.value == null || rule.value === '') {
    if (!operatorWantsMultiValue(op)) return true
  }

  switch (col.type) {
    case 'text-short':
    case 'text-long':
    case 'text-rich': {
      const hay = asString(cellValue).toLowerCase()
      const needle = asString(rule.value).toLowerCase()
      switch (op) {
        case 'contains':
          return hay.includes(needle)
        case 'not-contains':
          return !hay.includes(needle)
        case 'is':
          return hay === needle
        case 'is-not':
          return hay !== needle
        default:
          return true
      }
    }
    case 'number': {
      const cell = asNumber(cellValue)
      const target = asNumber(rule.value)
      if (cell == null || target == null) return false
      switch (op) {
        case 'is':
          return cell === target
        case 'is-not':
          return cell !== target
        case 'gt':
          return cell > target
        case 'lt':
          return cell < target
        case 'gte':
          return cell >= target
        case 'lte':
          return cell <= target
        default:
          return true
      }
    }
    case 'single-select': {
      const cell = cellValue == null ? '' : String(cellValue)
      if (op === 'is-any-of') {
        const set = asArray(rule.value)
        return set.includes(cell)
      }
      const target = asString(rule.value)
      if (op === 'is') return cell === target
      if (op === 'is-not') return cell !== target
      return true
    }
    case 'multi-select':
    case 'relation':
    case 'attachment': {
      const cell = asArray(cellValue)
      const set = asArray(rule.value)
      switch (op) {
        case 'is-any-of':
          return set.some((v) => cell.includes(v))
        case 'has-all-of':
          return set.every((v) => cell.includes(v))
        case 'has-none-of':
          return !set.some((v) => cell.includes(v))
        default:
          return true
      }
    }
    case 'date': {
      const cell = asNumber(cellValue)
      const target = asNumber(rule.value)
      if (cell == null || target == null) return false
      const c = dayStart(cell)
      const t = dayStart(target)
      switch (op) {
        case 'is':
          return c === t
        case 'before':
          return c < t
        case 'after':
          return c > t
        case 'on-or-before':
          return c <= t
        case 'on-or-after':
          return c >= t
        default:
          return true
      }
    }
    default:
      return true
  }
}

// Apply a full filter config to a row set. A rule whose column no longer exists
// is skipped. With no rules the input is returned unchanged.
export function applyFilters(
  rows: FbRow[],
  schema: TableSchema,
  filter: TableFilterConfig | undefined
): FbRow[] {
  if (!filter || filter.rules.length === 0) return rows
  const colById = new Map(schema.columns.map((c) => [c.id, c]))
  const active = filter.rules.filter((r) => colById.has(r.columnId))
  if (active.length === 0) return rows
  return rows.filter((row) => {
    const results = active.map((rule) => {
      const col = colById.get(rule.columnId)!
      return evaluateRule(rule, col, row.cells[col.id])
    })
    return filter.conjunction === 'or' ? results.some(Boolean) : results.every(Boolean)
  })
}

// ── Grouping ────────────────────────────────────────────────────────────────

export interface RowGroup {
  // Stable identity for collapse state.
  key: string
  // Human label shown in the group header.
  label: string
  // Optional accent (single-select option color) for the header chip.
  color?: string
  rows: FbRow[]
}

// Columns that make sense to group by. Buttons store nothing, and free-text /
// long-text grouping is rarely useful — but we still allow it because the user
// asked for "any column"; we just exclude button which has no value at all.
export function isGroupableColumn(col: FieldDefinition): boolean {
  return col.type !== 'button'
}

// Compute the group key + label + color for one cell value.
function groupKeyFor(
  col: FieldDefinition,
  value: unknown
): { key: string; label: string; color?: string } {
  if (isEmptyValue(col.type, value)) return { key: '∅', label: 'Empty' }

  switch (col.type) {
    case 'checkbox':
      return value === true
        ? { key: 'true', label: 'Checked' }
        : { key: 'false', label: 'Unchecked' }
    case 'single-select': {
      const options = (col.config as { options: SelectOption[] }).options ?? []
      const opt = options.find((o) => o.id === value)
      return opt
        ? { key: opt.id, label: opt.label, color: opt.color }
        : { key: String(value), label: String(value) }
    }
    case 'multi-select': {
      const options = (col.config as { options: SelectOption[] }).options ?? []
      const ids = asArray(value).slice().sort()
      const labels = ids.map((id) => options.find((o) => o.id === id)?.label ?? id)
      return { key: ids.join('|'), label: labels.join(', ') }
    }
    case 'date': {
      const ms = asNumber(value)
      if (ms == null) return { key: '∅', label: 'Empty' }
      const d = dayStart(ms)
      const label = new Date(d).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      })
      return { key: String(d), label }
    }
    case 'relation':
    case 'attachment': {
      const n = asArray(value).length
      return { key: String(n), label: n === 1 ? '1 item' : `${n} items` }
    }
    default:
      return { key: asString(value), label: asString(value) }
  }
}

// Split rows into ordered groups by a column. Empty always sorts last. For a
// single-select column the groups follow the option order; otherwise groups
// sort by label. `direction` flips the non-empty order.
export function groupRows(
  rows: FbRow[],
  col: FieldDefinition,
  direction: 'asc' | 'desc' = 'asc'
): RowGroup[] {
  const map = new Map<string, RowGroup>()
  for (const row of rows) {
    const { key, label, color } = groupKeyFor(col, row.cells[col.id])
    const existing = map.get(key)
    if (existing) existing.rows.push(row)
    else map.set(key, { key, label, color, rows: [row] })
  }

  const groups = Array.from(map.values())
  const empty = groups.filter((g) => g.key === '∅')
  const nonEmpty = groups.filter((g) => g.key !== '∅')

  if (col.type === 'single-select') {
    const options = (col.config as { options: SelectOption[] }).options ?? []
    const orderIndex = new Map(options.map((o, i) => [o.id, i]))
    nonEmpty.sort(
      (a, b) => (orderIndex.get(a.key) ?? 1e9) - (orderIndex.get(b.key) ?? 1e9)
    )
  } else if (col.type === 'date' || col.type === 'number') {
    nonEmpty.sort((a, b) => Number(a.key) - Number(b.key))
  } else if (col.type === 'checkbox') {
    nonEmpty.sort((a, b) => (a.key === 'true' ? -1 : 1) - (b.key === 'true' ? -1 : 1))
  } else {
    nonEmpty.sort((a, b) => a.label.localeCompare(b.label))
  }

  if (direction === 'desc') nonEmpty.reverse()
  return [...nonEmpty, ...empty]
}
