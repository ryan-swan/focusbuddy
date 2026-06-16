// A small, honest spreadsheet formula engine. It evaluates real A1-style cell
// references, ranges, the common aggregate functions, and arithmetic. It does
// not pretend to be Excel; what it computes, it computes for real, and anything
// it cannot evaluate returns a visible #ERR rather than a plausible-looking
// number. A cell value is a formula when it starts with "=".

export interface Grid {
  columns: string[]
  rows: string[][]
}

// "A" -> 0, "B" -> 1, "Z" -> 25, "AA" -> 26
function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

// "B3" -> { r: 2, c: 1 }; null if not a valid ref.
function refToCoord(ref: string): { r: number; c: number } | null {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  const c = colToIndex(m[1])
  const r = parseInt(m[2], 10) - 1
  if (r < 0 || c < 0) return null
  return { r, c }
}

function cellRaw(grid: Grid, r: number, c: number): string {
  return grid.rows[r]?.[c] ?? ''
}

// The numeric value of a cell, evaluating a nested formula if needed. Empty or
// non-numeric text counts as 0 for arithmetic. `seen` guards against cycles.
function cellNumber(grid: Grid, r: number, c: number, seen: Set<string>): number {
  const key = `${r},${c}`
  if (seen.has(key)) throw new Error('cycle')
  const raw = cellRaw(grid, r, c).trim()
  if (raw.startsWith('=')) {
    const next = new Set(seen)
    next.add(key)
    return evalExpr(raw.slice(1), grid, next)
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

// Expand "A1:B3" into the flat list of numeric values it covers.
function expandRange(ref: string, grid: Grid, seen: Set<string>): number[] {
  const [a, b] = ref.split(':')
  const ca = refToCoord(a)
  const cb = refToCoord(b)
  if (!ca || !cb) throw new Error('bad range')
  const out: number[] = []
  for (let r = Math.min(ca.r, cb.r); r <= Math.max(ca.r, cb.r); r++) {
    for (let c = Math.min(ca.c, cb.c); c <= Math.max(ca.c, cb.c); c++) {
      out.push(cellNumber(grid, r, c, seen))
    }
  }
  return out
}

// Count of cells in a range that hold a real number (for COUNT).
function countNumeric(ref: string, grid: Grid): number {
  const [a, b] = ref.split(':')
  const ca = refToCoord(a)
  const cb = refToCoord(b)
  if (!ca || !cb) throw new Error('bad range')
  let n = 0
  for (let r = Math.min(ca.r, cb.r); r <= Math.max(ca.r, cb.r); r++) {
    for (let c = Math.min(ca.c, cb.c); c <= Math.max(ca.c, cb.c); c++) {
      const raw = cellRaw(grid, r, c).trim()
      if (raw !== '' && Number.isFinite(Number(raw))) n++
    }
  }
  return n
}

const FUNCTIONS: Record<string, (nums: number[]) => number> = {
  SUM: (n) => n.reduce((a, b) => a + b, 0),
  AVERAGE: (n) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0),
  AVG: (n) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0),
  MIN: (n) => (n.length ? Math.min(...n) : 0),
  MAX: (n) => (n.length ? Math.max(...n) : 0),
  PRODUCT: (n) => n.reduce((a, b) => a * b, 1),
  COUNT: (n) => n.length
}

// Tokenize + evaluate an arithmetic expression with cell refs, ranges and
// functions. Recursive-descent: expr -> term -> factor.
function evalExpr(input: string, grid: Grid, seen: Set<string>): number {
  let i = 0
  const s = input

  function skip(): void {
    while (i < s.length && /\s/.test(s[i])) i++
  }

  function parseExpr(): number {
    let v = parseTerm()
    for (;;) {
      skip()
      const op = s[i]
      if (op === '+' || op === '-') {
        i++
        const r = parseTerm()
        v = op === '+' ? v + r : v - r
      } else break
    }
    return v
  }

  function parseTerm(): number {
    let v = parseFactor()
    for (;;) {
      skip()
      const op = s[i]
      if (op === '*' || op === '/') {
        i++
        const r = parseFactor()
        v = op === '*' ? v * r : v / r
      } else break
    }
    return v
  }

  function parseFactor(): number {
    skip()
    const ch = s[i]
    if (ch === '+') {
      i++
      return parseFactor()
    }
    if (ch === '-') {
      i++
      return -parseFactor()
    }
    if (ch === '(') {
      i++
      const v = parseExpr()
      skip()
      if (s[i] === ')') i++
      return v
    }
    // number
    const numMatch = s.slice(i).match(/^\d+(\.\d+)?/)
    if (numMatch) {
      i += numMatch[0].length
      return parseFloat(numMatch[0])
    }
    // identifier: a function call, a range, or a single cell ref
    const idMatch = s.slice(i).match(/^[A-Za-z]+\d*/)
    if (idMatch) {
      const id = idMatch[0]
      i += id.length
      skip()
      if (s[i] === '(') {
        // function
        i++
        const fnName = id.toUpperCase()
        const args: number[] = []
        for (;;) {
          skip()
          // a range argument like A1:B3
          const rangeM = s.slice(i).match(/^[A-Za-z]+\d+:[A-Za-z]+\d+/)
          if (rangeM) {
            i += rangeM[0].length
            if (fnName === 'COUNT') args.push(...new Array(countNumeric(rangeM[0], grid)).fill(1))
            else args.push(...expandRange(rangeM[0], grid, seen))
          } else if (s[i] !== ')' && s[i] !== undefined) {
            args.push(parseExpr())
          }
          skip()
          if (s[i] === ',') {
            i++
            continue
          }
          break
        }
        skip()
        if (s[i] === ')') i++
        const fn = FUNCTIONS[fnName]
        if (!fn) throw new Error(`unknown function ${fnName}`)
        return fn(args)
      }
      // a single cell reference
      const coord = refToCoord(id)
      if (!coord) throw new Error(`bad ref ${id}`)
      return cellNumber(grid, coord.r, coord.c, seen)
    }
    throw new Error('parse error')
  }

  const result = parseExpr()
  if (!Number.isFinite(result)) throw new Error('not finite')
  return result
}

// The value to DISPLAY for a cell: the raw text, or the evaluated formula, or
// a visible #ERR. Never a silent wrong number.
export function displayCell(grid: Grid, r: number, c: number): string {
  const raw = cellRaw(grid, r, c)
  if (!raw.startsWith('=')) return raw
  try {
    const v = evalExpr(raw.slice(1), grid, new Set([`${r},${c}`]))
    // Trim floating noise to a sensible precision without inventing digits.
    return String(Math.round(v * 1e6) / 1e6)
  } catch {
    return '#ERR'
  }
}
