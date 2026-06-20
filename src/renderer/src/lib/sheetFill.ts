// Autofill series engine — the brain behind the fill handle, double-click fill,
// and Ctrl+D / Ctrl+R. Given the values currently in the source selection (in
// order along the fill axis), it produces the next N values the way Excel and
// Google Sheets do:
//
//   - formulas fill by copying with their relative references shifted (handled by
//     the injected rewriteFormula, which wraps the engine's rewriteFormulaRefs)
//   - 2+ numbers extrapolate a linear trend (1,2 -> 3,4,5 ; 2,4 -> 6,8)
//   - a single number copies (Excel needs Ctrl for a 1-cell series; the caller
//     offers a post-fill Copy/Series toggle for that)
//   - month and weekday names continue (Jan,Feb -> Mar ; single "Monday" -> Tue)
//   - ISO dates step by the detected interval (single date -> +1 day)
//   - text with a trailing number increments ("Item 1" -> "Item 2"), preserving
//     any zero-padding ("Q01" -> "Q02")
//   - anything else repeats/cycles the source
//
// Pure and dependency-light so it is unit-tested directly.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTHS_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAYS_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function isFormula(s: string): boolean {
  return s.trim().startsWith('=')
}

function fmtNum(v: number): string {
  return String(Math.round(v * 1e6) / 1e6)
}

// Apply the casing of a template word (e.g. "Jan", "MONDAY") to a lowercase name.
function applyCase(template: string, lower: string): string {
  if (template === template.toUpperCase() && template !== template.toLowerCase()) return lower.toUpperCase()
  if (template[0] === template[0]?.toUpperCase()) return lower[0].toUpperCase() + lower.slice(1)
  return lower
}

type SeriesFn = (t: number) => string

// Build a value(t) generator for the source, where t is the zero-based position
// along the axis (source occupies t = 0..n-1). Returns null to fall back to copy.
function detectSeries(source: string[]): SeriesFn | null {
  const n = source.length
  const trimmed = source.map((s) => s.trim())

  // Numbers — linear trend for 2+, copy for a single value (handled by caller).
  if (n >= 2 && trimmed.every((s) => s !== '' && Number.isFinite(Number(s)))) {
    const ys = trimmed.map(Number)
    const meanX = (n - 1) / 2
    const meanY = ys.reduce((a, b) => a + b, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (ys[i] - meanY)
      den += (i - meanX) ** 2
    }
    const slope = den === 0 ? 0 : num / den
    const intercept = meanY - slope * meanX
    return (t) => fmtNum(intercept + slope * t)
  }

  // Month / weekday names.
  const nameSeries = detectNameSeries(trimmed, MONTHS, MONTHS_ABBR) || detectNameSeries(trimmed, DAYS, DAYS_ABBR)
  if (nameSeries) return nameSeries

  // ISO dates (yyyy-mm-dd).
  const dateSeries = detectDateSeries(trimmed)
  if (dateSeries) return dateSeries

  // Text with a trailing integer ("Item 1", "Q01").
  const textNum = detectTextNumberSeries(source)
  if (textNum) return textNum

  return null
}

function detectNameSeries(values: string[], full: string[], abbr: string[]): SeriesFn | null {
  const idxOf = (s: string): { idx: number; abbr: boolean } | null => {
    const lc = s.toLowerCase()
    const fi = full.indexOf(lc)
    if (fi !== -1) return { idx: fi, abbr: false }
    const ai = abbr.indexOf(lc)
    if (ai !== -1) return { idx: ai, abbr: true }
    return null
  }
  const mapped = values.map(idxOf)
  if (mapped.some((m) => m === null)) return null
  const idxs = (mapped as { idx: number; abbr: boolean }[]).map((m) => m.idx)
  const useAbbr = (mapped as { idx: number; abbr: boolean }[])[values.length - 1].abbr
  const list = useAbbr ? abbr : full
  const len = list.length
  const step = idxs.length >= 2 ? idxs[idxs.length - 1] - idxs[idxs.length - 2] : 1
  const base = idxs[0]
  const tmpl = values[values.length - 1]
  return (t) => {
    const raw = ((base + step * t) % len + len) % len
    return applyCase(tmpl, list[raw])
  }
}

function detectDateSeries(values: string[]): SeriesFn | null {
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!values.every((v) => re.test(v))) return null
  const ms = values.map((v) => Date.parse(v + 'T00:00:00Z'))
  if (ms.some((m) => !Number.isFinite(m))) return null
  const day = 86400000
  const step = ms.length >= 2 ? ms[ms.length - 1] - ms[ms.length - 2] : day
  const base = ms[0]
  return (t) => new Date(base + step * t).toISOString().slice(0, 10)
}

function detectTextNumberSeries(source: string[]): SeriesFn | null {
  const parts = source.map((s) => s.match(/^(.*?)(\d+)$/))
  if (parts.some((m) => m === null)) return null
  const ms = parts as RegExpMatchArray[]
  const prefix = ms[0][1]
  // A bare number (no text prefix) is not a text+number series — single numbers
  // copy, and multi-number runs are handled by the numeric trend branch above.
  if (prefix === '') return null
  if (!ms.every((m) => m[1] === prefix)) return null
  const nums = ms.map((m) => parseInt(m[2], 10))
  const pad = Math.max(...ms.map((m) => m[2].length))
  const step = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 1
  const base = nums[0]
  return (t) => {
    const v = base + step * t
    const digits = String(Math.max(0, v))
    return prefix + (digits.length < pad ? digits.padStart(pad, '0') : digits)
  }
}

// Produce the next `count` values continuing `source` along the fill axis.
// `rewriteFormula(value, step)` shifts a formula by `step` cells along the axis
// (the caller maps step -> dRow/dCol via the engine's rewriteFormulaRefs).
export function extendSeries(
  source: string[],
  count: number,
  rewriteFormula: (value: string, step: number) => string
): string[] {
  const n = source.length
  if (n === 0 || count <= 0) return []

  // If any source cell is a formula, fill by copy-with-relative-shift (Excel
  // continues the formula pattern); literals in the mix just cycle.
  if (!source.some(isFormula)) {
    const series = detectSeries(source)
    if (series) return Array.from({ length: count }, (_, k) => series(n + k))
  }

  return Array.from({ length: count }, (_, k) => {
    const tgtPos = n + k
    const srcPos = tgtPos % n
    const v = source[srcPos]
    return isFormula(v) ? rewriteFormula(v, tgtPos - srcPos) : v
  })
}

// True when a numeric series is possible from this source — drives whether the
// post-fill "Copy / Series" toggle is shown (a single number, or 2+ numbers).
export function canToggleSeries(source: string[]): boolean {
  const t = source.map((s) => s.trim()).filter((s) => s !== '')
  return t.length >= 1 && t.every((s) => Number.isFinite(Number(s)))
}

// Force a numeric fill mode regardless of source length: 'copy' repeats the last
// value; 'series' extrapolates (step 1 for a single seed). Used by the toggle.
export function numericFill(source: string[], count: number, mode: 'copy' | 'series'): string[] {
  const nums = source.map((s) => s.trim()).filter((s) => s !== '').map(Number)
  if (!nums.length) return Array.from({ length: count }, () => source[source.length - 1] ?? '')
  if (mode === 'copy') {
    const last = nums[nums.length - 1]
    return Array.from({ length: count }, () => fmtNum(last))
  }
  const step = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 1
  const last = nums[nums.length - 1]
  return Array.from({ length: count }, (_, k) => fmtNum(last + step * (k + 1)))
}
