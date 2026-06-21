import type {
  SheetCellFormat,
  SheetCondRule,
  SheetValidation,
  SheetValidationRule
} from '@shared/types'

// Pure logic for Sheets conditional formatting and data validation. Kept free of
// React so the matching rules are unit-tested directly. A1 parsing lives here too
// (small and self-contained) so these features don't reach into the formula engine.

// "AB" -> column index (0-based). Returns -1 for an empty/invalid string.
export function colFromLetters(s: string): number {
  const up = s.toUpperCase()
  if (!/^[A-Z]+$/.test(up)) return -1
  let n = 0
  for (const ch of up) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export interface A1Range {
  r1: number
  c1: number
  r2: number
  c2: number
}

function parseCell(ref: string): { r: number; c: number } | null {
  const m = ref.trim().match(/^\$?([A-Za-z]+)\$?(\d+)$/)
  if (!m) return null
  const c = colFromLetters(m[1])
  const r = parseInt(m[2], 10) - 1
  if (c < 0 || r < 0 || !Number.isFinite(r)) return null
  return { r, c }
}

// Parse "B2", "B2:D10" (any corner order) into a normalised range. null if bad.
export function parseA1Range(range: string): A1Range | null {
  const parts = range.split(':')
  const a = parseCell(parts[0])
  if (!a) return null
  const b = parts[1] ? parseCell(parts[1]) : a
  if (!b) return null
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c)
  }
}

export function rangeHas(range: string, r: number, c: number): boolean {
  const p = parseA1Range(range)
  if (!p) return false
  return r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2
}

function asNumber(v: string): number | null {
  if (v == null) return null
  const cleaned = v.replace(/[\s,$%]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// Does a cell's computed/displayed value satisfy a conditional-format rule?
export function matchCond(computed: string, rule: SheetCondRule): boolean {
  const v = computed ?? ''
  switch (rule.op) {
    case 'empty':
      return v.trim() === ''
    case 'notEmpty':
      return v.trim() !== ''
    case 'contains':
      return !!rule.value && v.toLowerCase().includes(rule.value.toLowerCase())
    case 'eq':
    case 'ne': {
      const a = asNumber(v)
      const b = asNumber(rule.value ?? '')
      const equal = a !== null && b !== null ? a === b : v.trim() === (rule.value ?? '').trim()
      return rule.op === 'eq' ? equal : !equal
    }
    case 'gt':
    case 'lt':
    case 'ge':
    case 'le': {
      const a = asNumber(v)
      const b = asNumber(rule.value ?? '')
      if (a === null || b === null) return false
      if (rule.op === 'gt') return a > b
      if (rule.op === 'lt') return a < b
      if (rule.op === 'ge') return a >= b
      return a <= b
    }
    case 'between': {
      const a = asNumber(v)
      const lo = asNumber(rule.value ?? '')
      const hi = asNumber(rule.value2 ?? '')
      if (a === null || lo === null || hi === null) return false
      const min = Math.min(lo, hi)
      const max = Math.max(lo, hi)
      return a >= min && a <= max
    }
    default:
      return false
  }
}

// Overlay every matching rule's paint onto the base format (later rules win per
// property). Returns the base unchanged when nothing matches, so callers can keep
// using the existing object identity where possible.
export function applyCondFormat(
  base: SheetCellFormat | undefined,
  rules: SheetCondRule[] | undefined,
  r: number,
  c: number,
  computed: string
): SheetCellFormat | undefined {
  if (!rules || rules.length === 0) return base
  let out = base
  for (const rule of rules) {
    if (!rangeHas(rule.range, r, c)) continue
    if (!matchCond(computed, rule)) continue
    out = { ...(out ?? {}) }
    if (rule.bg) out.bg = rule.bg
    if (rule.color) out.color = rule.color
    if (rule.bold) out.bold = true
  }
  return out
}

// ── Column filters ──────────────────────────────────────────────────────────

// Is a row hidden, given its displayed value for each filtered column? A column's
// filter is the set of values to HIDE; a row is hidden when any filtered column's
// value is in that set. Pure so the hide logic is unit-tested directly.
export function isRowHidden(
  rowValues: Record<number, string>,
  filters?: Record<number, string[]>
): boolean {
  if (!filters) return false
  for (const key of Object.keys(filters)) {
    const c = Number(key)
    const hide = filters[c]
    if (hide && hide.length && hide.includes(rowValues[c] ?? '')) return true
  }
  return false
}

// The distinct, sorted set of displayed values in a column (for the filter
// dropdown's checkbox list). Empty cells collapse to one '' entry.
export function distinctValues(values: string[]): string[] {
  const seen = new Set(values.map((v) => v ?? ''))
  return [...seen].sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb) && a !== '' && b !== '') return na - nb
    return a.localeCompare(b)
  })
}

// ── Data validation ─────────────────────────────────────────────────────────

export function validationForCell(
  validations: SheetValidation[] | undefined,
  r: number,
  c: number
): SheetValidation | undefined {
  if (!validations) return undefined
  // Last defined rule covering the cell wins (matches how users expect a newer
  // rule to take over an overlapping older one).
  let found: SheetValidation | undefined
  for (const v of validations) if (rangeHas(v.range, r, c)) found = v
  return found
}

// Is a value allowed by a validation rule? An empty value is always allowed
// (validation constrains content, it does not make a cell required).
export function valueIsValid(value: string, rule: SheetValidationRule): boolean {
  const v = (value ?? '').trim()
  if (v === '') return true
  if (rule.kind === 'list') return rule.values.includes(value) || rule.values.includes(v)
  if (rule.kind === 'textNotEmpty') return v !== ''
  // number rule
  const n = asNumber(v)
  if (n === null) return false
  switch (rule.op) {
    case 'gt':
      return n > rule.value
    case 'lt':
      return n < rule.value
    case 'ge':
      return n >= rule.value
    case 'le':
      return n <= rule.value
    case 'eq':
      return n === rule.value
    case 'between': {
      const hi = rule.value2 ?? rule.value
      return n >= Math.min(rule.value, hi) && n <= Math.max(rule.value, hi)
    }
    default:
      return false
  }
}
