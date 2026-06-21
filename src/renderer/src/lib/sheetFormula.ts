// The spreadsheet formula engine.
//
// It evaluates A1-style references, ranges, arithmetic, comparisons, string
// concatenation, and a broad function library, to a real value of type number,
// string or boolean. The guiding rule is honesty: what it can compute it
// computes for real, and anything it cannot (a malformed formula, an unknown
// function, a reference cycle, a non-finite result) surfaces a visible #ERR
// rather than a plausible-looking number. A cell is a formula when it starts
// with "=".
//
// Coercion note: a referenced cell that holds non-numeric text counts as 0 in
// arithmetic, matching common spreadsheet behaviour (and the engine's original
// contract). Aggregate functions (SUM, AVERAGE, COUNT, ...) instead ignore
// non-numeric cells, so an average is over the numbers only.

export interface Grid {
  columns: string[]
  rows: string[][]
}

export type CellValue = number | string | boolean

// ── Cross-sheet workbook context ────────────────────────────────────────────
// A formula may reference another tab: =Sheet2!A1 or =SUM('My Tab'!A1:A9). The
// evaluator resolves the named tab's grid from this context, which is set for the
// duration of one top-level evaluation. Sheet names match case-insensitively.
export interface Workbook {
  byName: Map<string, Grid>
}
let WB: Workbook | null = null

// The grid a ref/range should read from: its own sheet's grid when it carries a
// sheet qualifier we can resolve, otherwise the formula's own (default) grid.
function pickGrid(def: Grid, sheet?: string): Grid {
  if (sheet && WB) {
    const g = WB.byName.get(sheet.toLowerCase())
    if (g) return g
  }
  return def
}

// Stable per-grid id so the cycle-detection key is sheet-aware (A1 on two
// different tabs must not be treated as the same cell).
let gridSeq = 0
const gridIds = new WeakMap<Grid, number>()
function gridId(grid: Grid): number {
  let id = gridIds.get(grid)
  if (id === undefined) {
    id = ++gridSeq
    gridIds.set(grid, id)
  }
  return id
}

// Build a Workbook from named tabs (the renderer passes its sheet list).
export function makeWorkbook(
  sheets: Array<{ name: string; columns: string[]; rows: string[][] }>
): Workbook {
  const byName = new Map<string, Grid>()
  for (const s of sheets) byName.set(s.name.toLowerCase(), { columns: s.columns, rows: s.rows })
  return { byName }
}

// The functions the engine supports, with a short signature hint. Drives the
// in-cell "type =" formula menu so users get quick, discoverable access.
export const SHEET_FUNCTIONS: Array<{ name: string; hint: string }> = [
  { name: 'SUM', hint: 'SUM(range) — add numbers' },
  { name: 'AVERAGE', hint: 'AVERAGE(range) — mean of numbers' },
  { name: 'MIN', hint: 'MIN(range) — smallest number' },
  { name: 'MAX', hint: 'MAX(range) — largest number' },
  { name: 'COUNT', hint: 'COUNT(range) — count of numbers' },
  { name: 'COUNTA', hint: 'COUNTA(range) — count of non-empty cells' },
  { name: 'PRODUCT', hint: 'PRODUCT(range) — multiply numbers' },
  { name: 'COUNTIF', hint: 'COUNTIF(range, criteria)' },
  { name: 'SUMIF', hint: 'SUMIF(range, criteria, [sumRange])' },
  { name: 'AVERAGEIF', hint: 'AVERAGEIF(range, criteria, [avgRange])' },
  { name: 'IF', hint: 'IF(test, ifTrue, ifFalse)' },
  { name: 'AND', hint: 'AND(a, b, …) — all true' },
  { name: 'OR', hint: 'OR(a, b, …) — any true' },
  { name: 'NOT', hint: 'NOT(x)' },
  { name: 'IFERROR', hint: 'IFERROR(value, fallback)' },
  { name: 'ROUND', hint: 'ROUND(number, decimals)' },
  { name: 'ROUNDUP', hint: 'ROUNDUP(number, decimals)' },
  { name: 'ROUNDDOWN', hint: 'ROUNDDOWN(number, decimals)' },
  { name: 'ABS', hint: 'ABS(number)' },
  { name: 'SQRT', hint: 'SQRT(number)' },
  { name: 'POWER', hint: 'POWER(base, exponent)' },
  { name: 'MOD', hint: 'MOD(number, divisor)' },
  { name: 'CONCAT', hint: 'CONCAT(a, b, …) — join text' },
  { name: 'LEN', hint: 'LEN(text)' },
  { name: 'LEFT', hint: 'LEFT(text, n)' },
  { name: 'RIGHT', hint: 'RIGHT(text, n)' },
  { name: 'MID', hint: 'MID(text, start, length)' },
  { name: 'UPPER', hint: 'UPPER(text)' },
  { name: 'LOWER', hint: 'LOWER(text)' },
  { name: 'TRIM', hint: 'TRIM(text)' },
  { name: 'VLOOKUP', hint: 'VLOOKUP(key, table, colIndex, [FALSE]) — look up a row' },
  { name: 'HLOOKUP', hint: 'HLOOKUP(key, table, rowIndex, [FALSE]) — look up a column' },
  { name: 'INDEX', hint: 'INDEX(range, row, [col]) — value at a position' },
  { name: 'MATCH', hint: 'MATCH(key, range, [type]) — position of a value' },
  { name: 'SUMIFS', hint: 'SUMIFS(sumRange, range1, crit1, …)' },
  { name: 'COUNTIFS', hint: 'COUNTIFS(range1, crit1, …)' },
  { name: 'AVERAGEIFS', hint: 'AVERAGEIFS(avgRange, range1, crit1, …)' },
  { name: 'SUMPRODUCT', hint: 'SUMPRODUCT(rangeA, rangeB, …)' },
  { name: 'MEDIAN', hint: 'MEDIAN(range) — middle value' },
  { name: 'STDEV', hint: 'STDEV(range) — sample standard deviation' },
  { name: 'VAR', hint: 'VAR(range) — sample variance' },
  { name: 'COUNTBLANK', hint: 'COUNTBLANK(range) — count of empty cells' },
  { name: 'INT', hint: 'INT(number) — round down to integer' },
  { name: 'TRUNC', hint: 'TRUNC(number, [decimals]) — drop decimals' },
  { name: 'CEILING', hint: 'CEILING(number, [significance])' },
  { name: 'FLOOR', hint: 'FLOOR(number, [significance])' },
  { name: 'FIND', hint: 'FIND(needle, text, [start]) — case-sensitive position' },
  { name: 'SEARCH', hint: 'SEARCH(needle, text, [start]) — case-insensitive position' },
  { name: 'SUBSTITUTE', hint: 'SUBSTITUTE(text, old, new, [nth])' },
  { name: 'REPLACE', hint: 'REPLACE(text, start, length, new)' },
  { name: 'TEXTJOIN', hint: 'TEXTJOIN(delim, ignoreEmpty, …)' },
  { name: 'PROPER', hint: 'PROPER(text) — Title Case' },
  { name: 'VALUE', hint: 'VALUE(text) — text to number' },
  { name: 'YEAR', hint: 'YEAR(date)' },
  { name: 'MONTH', hint: 'MONTH(date)' },
  { name: 'DAY', hint: 'DAY(date)' },
  { name: 'WEEKDAY', hint: 'WEEKDAY(date) — 1=Sunday' },
  { name: 'TODAY', hint: 'TODAY() — current date' },
  { name: 'NOW', hint: 'NOW() — current date and time' }
]

// ── References ────────────────────────────────────────────────────────────────

function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function refToCoord(
  ref: string
): { r: number; c: number; absR: boolean; absC: boolean } | null {
  // Optional $ before the column letters and/or the row number (e.g. $A$1, A$1).
  const m = ref.toUpperCase().match(/^(\$?)([A-Z]+)(\$?)(\d+)$/)
  if (!m) return null
  const absC = m[1] === '$'
  const c = colToIndex(m[2])
  const absR = m[3] === '$'
  const r = parseInt(m[4], 10) - 1
  if (r < 0 || c < 0) return null
  return { r, c, absR, absC }
}

// Render a column index back to letters (A, B, …, AA). Local copy so the engine
// stays self-contained (sheetBody.colLabel is the renderer-facing twin).
function indexToCol(c: number): string {
  let s = ''
  let n = c
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// Render a single A1 reference with its absolute markers preserved.
function refToA1(r: number, c: number, absR: boolean, absC: boolean): string {
  return `${absC ? '$' : ''}${indexToCol(c)}${absR ? '$' : ''}${r + 1}`
}

function cellRaw(grid: Grid, r: number, c: number): string {
  return grid.rows[r]?.[c] ?? ''
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string; sheet?: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }
  | { t: 'colon' }

function tokenize(s: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '"') {
      let str = ''
      i++
      while (i < s.length && s[i] !== '"') {
        str += s[i]
        i++
      }
      if (s[i] !== '"') throw new Error('unterminated string')
      i++
      toks.push({ t: 'str', v: str })
      continue
    }
    // Sheet-qualified reference: Sheet1!A1 or 'My Sheet'!A1. The qualifier binds
    // to the cell ref that follows; for a range (Sheet1!A1:B2) the colon + second
    // ref are tokenized normally and the parser carries the sheet onto the range.
    const sheetMatch = s
      .slice(i)
      .match(/^(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!(\$?[A-Za-z]+\$?\d+)/)
    if (sheetMatch) {
      toks.push({ t: 'ident', v: sheetMatch[3], sheet: sheetMatch[1] ?? sheetMatch[2] })
      i += sheetMatch[0].length
      continue
    }
    const numMatch = s.slice(i).match(/^\d+(\.\d+)?/)
    if (numMatch) {
      toks.push({ t: 'num', v: parseFloat(numMatch[0]) })
      i += numMatch[0].length
      continue
    }
    // Identifiers double as function names AND cell references. Allow optional
    // `$` markers so absolute references ($A$1, A$1, $A1) tokenize as one ident;
    // function names never carry `$`, so this is unambiguous.
    const idMatch = s.slice(i).match(/^\$?[A-Za-z]+\$?\d*/)
    if (idMatch) {
      toks.push({ t: 'ident', v: idMatch[0] })
      i += idMatch[0].length
      continue
    }
    const two = s.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      toks.push({ t: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/^&=<>'.includes(ch)) {
      toks.push({ t: 'op', v: ch })
      i++
      continue
    }
    if (ch === '(') { toks.push({ t: 'lp' }); i++; continue }
    if (ch === ')') { toks.push({ t: 'rp' }); i++; continue }
    if (ch === ',') { toks.push({ t: 'comma' }); i++; continue }
    if (ch === ':') { toks.push({ t: 'colon' }); i++; continue }
    throw new Error(`unexpected char ${ch}`)
  }
  return toks
}

// ── AST ───────────────────────────────────────────────────────────────────────

// `absR`/`absC` mark a `$`-anchored row/column (e.g. $A$1). The evaluator ignores
// them; only the reference-rewriter (autofill / copy) and the serializer read
// them, so an absolute ref stays put while a relative one shifts by the fill
// offset, exactly like Excel and Sheets.
type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; r: number; c: number; absR?: boolean; absC?: boolean; sheet?: string }
  | {
      k: 'range'
      r1: number
      c1: number
      r2: number
      c2: number
      absR1?: boolean
      absC1?: boolean
      absR2?: boolean
      absC2?: boolean
      sheet?: string
    }
  | { k: 'unary'; op: string; x: Node }
  | { k: 'binary'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }

function parse(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const next = (): Tok => toks[p++]

  function parseExpr(): Node {
    return parseComparison()
  }
  function parseComparison(): Node {
    let a = parseConcat()
    while (peek()?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      a = { k: 'binary', op, a, b: parseConcat() }
    }
    return a
  }
  function parseConcat(): Node {
    let a = parseAdd()
    while (peek()?.t === 'op' && (peek() as { v: string }).v === '&') {
      next()
      a = { k: 'binary', op: '&', a, b: parseAdd() }
    }
    return a
  }
  function parseAdd(): Node {
    let a = parseMul()
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      a = { k: 'binary', op, a, b: parseMul() }
    }
    return a
  }
  function parseMul(): Node {
    let a = parsePow()
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      a = { k: 'binary', op, a, b: parsePow() }
    }
    return a
  }
  function parsePow(): Node {
    const a = parseUnary()
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
      next()
      return { k: 'binary', op: '^', a, b: parsePow() } // right-assoc
    }
    return a
  }
  function parseUnary(): Node {
    if (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      return { k: 'unary', op, x: parseUnary() }
    }
    return parsePrimary()
  }
  function parsePrimary(): Node {
    const tok = peek()
    if (!tok) throw new Error('unexpected end')
    if (tok.t === 'num') { next(); return { k: 'num', v: tok.v } }
    if (tok.t === 'str') { next(); return { k: 'str', v: tok.v } }
    if (tok.t === 'lp') {
      next()
      const e = parseExpr()
      if (peek()?.t !== 'rp') throw new Error('missing )')
      next()
      return e
    }
    if (tok.t === 'ident') {
      next()
      const name = tok.v
      if (peek()?.t === 'lp') {
        next()
        const args: Node[] = []
        if (peek()?.t !== 'rp') {
          args.push(parseArg())
          while (peek()?.t === 'comma') {
            next()
            args.push(parseArg())
          }
        }
        if (peek()?.t !== 'rp') throw new Error('missing ) in call')
        next()
        return { k: 'call', name: name.toUpperCase(), args }
      }
      const upper = name.toUpperCase()
      if (upper === 'TRUE') return { k: 'bool', v: true }
      if (upper === 'FALSE') return { k: 'bool', v: false }
      const coord = refToCoord(name)
      if (!coord) throw new Error(`bad ref ${name}`)
      return {
        k: 'ref',
        r: coord.r,
        c: coord.c,
        absR: coord.absR,
        absC: coord.absC,
        ...(tok.sheet ? { sheet: tok.sheet } : {})
      }
    }
    throw new Error('parse error')
  }
  // An argument may be a range (ref:ref). Otherwise a normal expression.
  function parseArg(): Node {
    const start = p
    const tok = peek()
    if (tok?.t === 'ident' && toks[p + 1]?.t === 'colon') {
      const a = refToCoord(tok.v)
      const endTok = toks[p + 2]
      if (a && endTok?.t === 'ident') {
        const b = refToCoord(endTok.v)
        if (b) {
          p += 3
          // Normalize each axis independently, keeping each endpoint's $-flag
          // attached to whichever side it lands on after min/max.
          const rowFirst = a.r <= b.r
          const colFirst = a.c <= b.c
          return {
            k: 'range',
            r1: Math.min(a.r, b.r),
            c1: Math.min(a.c, b.c),
            r2: Math.max(a.r, b.r),
            c2: Math.max(a.c, b.c),
            absR1: rowFirst ? a.absR : b.absR,
            absC1: colFirst ? a.absC : b.absC,
            absR2: rowFirst ? b.absR : a.absR,
            absC2: colFirst ? b.absC : a.absC,
            // The sheet qualifier (if any) rides on the first ref and covers the
            // whole range, e.g. Sheet2!A1:B10.
            ...(tok.sheet ? { sheet: tok.sheet } : {})
          }
        }
      }
      p = start
    }
    return parseExpr()
  }

  const node = parseExpr()
  if (p !== toks.length) throw new Error('trailing tokens')
  return node
}

// ── Serialization & reference rewriting (autofill / copy) ──────────────────────

const PREC: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5
}

// Turn an AST back into a formula string. Precedence-aware so it adds parentheses
// only where they're needed to preserve meaning (and round-trips through parse).
// Render a sheet qualifier for serialization: bare when it is a simple name,
// single-quoted when it contains spaces or punctuation (e.g. 'Q1 Plan'!A1).
function sheetPrefix(sheet?: string): string {
  if (!sheet) return ''
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet) ? `${sheet}!` : `'${sheet}'!`
}

function nodeToString(node: Node): string {
  switch (node.k) {
    case 'num':
      return String(node.v)
    case 'str':
      return `"${node.v.replace(/"/g, '""')}"`
    case 'bool':
      return node.v ? 'TRUE' : 'FALSE'
    case 'ref':
      return sheetPrefix(node.sheet) + refToA1(node.r, node.c, !!node.absR, !!node.absC)
    case 'range':
      return (
        sheetPrefix(node.sheet) +
        refToA1(node.r1, node.c1, !!node.absR1, !!node.absC1) +
        ':' +
        refToA1(node.r2, node.c2, !!node.absR2, !!node.absC2)
      )
    case 'unary': {
      const inner = nodeToString(node.x)
      return `${node.op}${node.x.k === 'binary' ? `(${inner})` : inner}`
    }
    case 'binary': {
      const p = PREC[node.op] ?? 0
      const rightAssoc = node.op === '^'
      const wrap = (child: Node, isRight: boolean): string => {
        const s = nodeToString(child)
        if (child.k !== 'binary') return s
        const cp = PREC[child.op] ?? 0
        // Lower-precedence children always need parens. Equal precedence needs
        // parens on the associativity-breaking side (right side for left-assoc
        // ops, left side for the right-assoc ^).
        const needs = cp < p || (cp === p && (rightAssoc ? !isRight : isRight))
        return needs ? `(${s})` : s
      }
      return `${wrap(node.a, false)}${node.op}${wrap(node.b, true)}`
    }
    case 'call':
      return `${node.name}(${node.args.map(nodeToString).join(', ')})`
  }
}

// Shift every RELATIVE reference in a formula by (dRow, dCol); absolute ($) parts
// stay pinned. Coordinates clamp at 0 so a fill near the top edge can't go
// negative. Used when a formula is dragged with the fill handle or pasted to a
// new origin, so =B2 dragged one row down becomes =B3, exactly like Excel/Sheets.
// `formula` may include the leading '='. Unparseable input is returned unchanged.
export function rewriteFormulaRefs(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula
  const hadEquals = formula.startsWith('=')
  const src = hadEquals ? formula.slice(1) : formula
  if (src.trim() === '') return formula
  let ast: Node
  try {
    ast = parse(src)
  } catch {
    return formula
  }
  const shift = (coord: number, abs: boolean | undefined, delta: number): number =>
    abs ? coord : Math.max(0, coord + delta)
  const rewrite = (n: Node): Node => {
    switch (n.k) {
      case 'ref':
        return { ...n, r: shift(n.r, n.absR, dRow), c: shift(n.c, n.absC, dCol) }
      case 'range':
        return {
          ...n,
          r1: shift(n.r1, n.absR1, dRow),
          c1: shift(n.c1, n.absC1, dCol),
          r2: shift(n.r2, n.absR2, dRow),
          c2: shift(n.c2, n.absC2, dCol)
        }
      case 'unary':
        return { ...n, x: rewrite(n.x) }
      case 'binary':
        return { ...n, a: rewrite(n.a), b: rewrite(n.b) }
      case 'call':
        return { ...n, args: n.args.map(rewrite) }
      default:
        return n
    }
  }
  return (hadEquals ? '=' : '') + nodeToString(rewrite(ast))
}

// ── Evaluation ────────────────────────────────────────────────────────────────

function toNum(v: CellValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function toStr(v: CellValue): string {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6)
  return v
}
function toBool(v: CellValue): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const t = v.trim().toLowerCase()
  if (t === 'true') return true
  if (t === 'false' || t === '') return false
  return true
}
// Parse a date cell for the date functions: an epoch-ms integer or any string
// Date can read (ISO dates parse as UTC). null when it is not a date.
function parseDate(s: string): Date | null {
  const t = s.trim()
  if (t === '') return null
  const d = /^\d+$/.test(t) ? new Date(Number(t)) : new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

// The evaluated value of a cell (following a formula), or its raw text/number.
function cellValue(grid: Grid, r: number, c: number, seen: Set<string>): CellValue {
  const key = `${gridId(grid)}:${r},${c}`
  if (seen.has(key)) throw new Error('cycle')
  const raw = cellRaw(grid, r, c).trim()
  if (raw.startsWith('=')) {
    const nextSeen = new Set(seen)
    nextSeen.add(key)
    return evalNode(parse(raw.slice(1)), grid, nextSeen)
  }
  if (raw === '') return ''
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) ? n : raw
}

// The numeric value of a cell, or null if it is not a number (for aggregates).
function cellNumeric(grid: Grid, r: number, c: number, seen: Set<string>): number | null {
  const v = cellValue(grid, r, c, seen)
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

function rangeCoords(node: Extract<Node, { k: 'range' }>): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = []
  for (let r = node.r1; r <= node.r2; r++) for (let c = node.c1; c <= node.c2; c++) out.push({ r, c })
  return out
}

function compare(op: string, a: CellValue, b: CellValue): boolean {
  const bothNum = typeof a === 'number' && typeof b === 'number'
  let cmp: number
  if (bothNum) cmp = (a as number) - (b as number)
  else cmp = String(toStr(a)).localeCompare(String(toStr(b)))
  switch (op) {
    case '=':
      return cmp === 0
    case '<>':
      return cmp !== 0
    case '<':
      return cmp < 0
    case '>':
      return cmp > 0
    case '<=':
      return cmp <= 0
    case '>=':
      return cmp >= 0
    default:
      throw new Error(`bad comparison ${op}`)
  }
}

// Match a cell value against a COUNTIF/SUMIF criterion such as ">10" or "x".
function matchCriteria(value: CellValue, criterion: CellValue): boolean {
  const cr = typeof criterion === 'string' ? criterion : toStr(criterion)
  const m = cr.match(/^(<=|>=|<>|<|>|=)(.*)$/)
  if (m) {
    const op = m[1]
    const rhsRaw = m[2].trim()
    const rhs: CellValue = rhsRaw !== '' && Number.isFinite(Number(rhsRaw)) ? Number(rhsRaw) : rhsRaw
    return compare(op === '=' ? '=' : op, value, rhs)
  }
  // Bare value: equality.
  const rhs: CellValue = cr !== '' && Number.isFinite(Number(cr)) ? Number(cr) : cr
  return compare('=', value, rhs)
}

function evalNode(node: Node, grid: Grid, seen: Set<string>): CellValue {
  switch (node.k) {
    case 'num':
      return node.v
    case 'str':
      return node.v
    case 'bool':
      return node.v
    case 'ref':
      return cellValue(pickGrid(grid, node.sheet), node.r, node.c, seen)
    case 'range':
      throw new Error('range not allowed here')
    case 'unary': {
      const x = toNum(evalNode(node.x, grid, seen))
      return node.op === '-' ? -x : x
    }
    case 'binary': {
      if (node.op === '&') return toStr(evalNode(node.a, grid, seen)) + toStr(evalNode(node.b, grid, seen))
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        return compare(node.op, evalNode(node.a, grid, seen), evalNode(node.b, grid, seen))
      }
      const a = toNum(evalNode(node.a, grid, seen))
      const b = toNum(evalNode(node.b, grid, seen))
      let r: number
      switch (node.op) {
        case '+': r = a + b; break
        case '-': r = a - b; break
        case '*': r = a * b; break
        case '/': r = a / b; break
        case '^': r = Math.pow(a, b); break
        default: throw new Error(`bad op ${node.op}`)
      }
      if (!Number.isFinite(r)) throw new Error('not finite')
      return r
    }
    case 'call':
      return evalCall(node, grid, seen)
  }
}

// Collect the numeric values implied by an argument list (ranges expand to their
// numeric cells; scalars coerce to numbers).
function collectNumbers(args: Node[], grid: Grid, seen: Set<string>): number[] {
  const out: number[] = []
  for (const arg of args) {
    if (arg.k === 'range') {
      const g = pickGrid(grid, arg.sheet)
      for (const { r, c } of rangeCoords(arg)) {
        const n = cellNumeric(g, r, c, seen)
        if (n !== null) out.push(n)
      }
    } else {
      out.push(toNum(evalNode(arg, grid, seen)))
    }
  }
  return out
}

function evalCall(node: Extract<Node, { k: 'call' }>, grid: Grid, seen: Set<string>): CellValue {
  const name = node.name
  const args = node.args
  const arg = (i: number): CellValue => evalNode(args[i], grid, seen)
  // The grid a range argument reads from — its own sheet's grid when qualified
  // (e.g. SUM(Sheet2!A1:A9)), otherwise this formula's grid.
  const gridOf = (n: Node | undefined): Grid =>
    pickGrid(grid, n && (n.k === 'range' || n.k === 'ref') ? n.sheet : undefined)

  switch (name) {
    // Aggregates
    case 'SUM':
      return collectNumbers(args, grid, seen).reduce((a, b) => a + b, 0)
    case 'AVERAGE':
    case 'AVG': {
      const ns = collectNumbers(args, grid, seen)
      if (!ns.length) throw new Error('AVERAGE of nothing')
      return ns.reduce((a, b) => a + b, 0) / ns.length
    }
    case 'MIN': {
      const ns = collectNumbers(args, grid, seen)
      return ns.length ? Math.min(...ns) : 0
    }
    case 'MAX': {
      const ns = collectNumbers(args, grid, seen)
      return ns.length ? Math.max(...ns) : 0
    }
    case 'PRODUCT':
      return collectNumbers(args, grid, seen).reduce((a, b) => a * b, 1)
    case 'COUNT': {
      let n = 0
      for (const a of args) {
        if (a.k === 'range') {
          const g = gridOf(a)
          for (const { r, c } of rangeCoords(a)) if (cellNumeric(g, r, c, seen) !== null) n++
        } else if (typeof evalNode(a, grid, seen) === 'number') n++
      }
      return n
    }
    case 'COUNTA': {
      let n = 0
      for (const a of args) {
        if (a.k === 'range') {
          const g = gridOf(a)
          for (const { r, c } of rangeCoords(a)) if (cellRaw(g, r, c).trim() !== '') n++
        } else {
          const v = evalNode(a, grid, seen)
          if (!(typeof v === 'string' && v === '')) n++
        }
      }
      return n
    }
    case 'COUNTIF': {
      if (args[0]?.k !== 'range') throw new Error('COUNTIF needs a range')
      const crit = arg(1)
      const g = gridOf(args[0])
      let n = 0
      for (const { r, c } of rangeCoords(args[0])) if (matchCriteria(cellValue(g, r, c, seen), crit)) n++
      return n
    }
    case 'SUMIF':
    case 'AVERAGEIF': {
      if (args[0]?.k !== 'range') throw new Error(`${name} needs a range`)
      const crit = arg(1)
      const sumRange = args[2]?.k === 'range' ? args[2] : args[0]
      const critGrid = gridOf(args[0])
      const sumGrid = gridOf(sumRange)
      const cells = rangeCoords(args[0])
      const sumCells = rangeCoords(sumRange)
      let sum = 0
      let count = 0
      for (let i = 0; i < cells.length; i++) {
        if (matchCriteria(cellValue(critGrid, cells[i].r, cells[i].c, seen), crit)) {
          const sc = sumCells[i] ?? cells[i]
          const n = cellNumeric(sumGrid, sc.r, sc.c, seen)
          if (n !== null) { sum += n; count++ }
        }
      }
      if (name === 'AVERAGEIF') {
        if (!count) throw new Error('AVERAGEIF of nothing')
        return sum / count
      }
      return sum
    }
    // Logical
    case 'IF':
      return toBool(arg(0)) ? arg(1) : args.length > 2 ? arg(2) : false
    case 'AND':
      return args.every((_, i) => toBool(arg(i)))
    case 'OR':
      return args.some((_, i) => toBool(arg(i)))
    case 'NOT':
      return !toBool(arg(0))
    case 'IFERROR':
      try {
        return arg(0)
      } catch {
        return arg(1)
      }
    // Math
    case 'ROUND': {
      const d = args.length > 1 ? toNum(arg(1)) : 0
      const f = Math.pow(10, d)
      return Math.round(toNum(arg(0)) * f) / f
    }
    case 'ROUNDUP': {
      const d = args.length > 1 ? toNum(arg(1)) : 0
      const f = Math.pow(10, d)
      return Math.ceil(Math.abs(toNum(arg(0))) * f) / f * Math.sign(toNum(arg(0)) || 1)
    }
    case 'ROUNDDOWN': {
      const d = args.length > 1 ? toNum(arg(1)) : 0
      const f = Math.pow(10, d)
      return Math.floor(Math.abs(toNum(arg(0))) * f) / f * Math.sign(toNum(arg(0)) || 1)
    }
    case 'ABS':
      return Math.abs(toNum(arg(0)))
    case 'SQRT': {
      const x = toNum(arg(0))
      if (x < 0) throw new Error('SQRT of negative')
      return Math.sqrt(x)
    }
    case 'POWER':
      return Math.pow(toNum(arg(0)), toNum(arg(1)))
    case 'MOD': {
      const b = toNum(arg(1))
      if (b === 0) throw new Error('MOD by zero')
      return toNum(arg(0)) % b
    }
    // Text
    case 'CONCAT':
    case 'CONCATENATE': {
      let out = ''
      for (const a of args) {
        if (a.k === 'range') {
          const g = gridOf(a)
          for (const { r, c } of rangeCoords(a)) out += toStr(cellValue(g, r, c, seen))
        } else out += toStr(evalNode(a, grid, seen))
      }
      return out
    }
    case 'LEN':
      return toStr(arg(0)).length
    case 'LEFT':
      return toStr(arg(0)).slice(0, args.length > 1 ? toNum(arg(1)) : 1)
    case 'RIGHT': {
      const n = args.length > 1 ? toNum(arg(1)) : 1
      const s = toStr(arg(0))
      return n <= 0 ? '' : s.slice(Math.max(0, s.length - n))
    }
    case 'MID': {
      const start = Math.max(1, toNum(arg(1)))
      return toStr(arg(0)).slice(start - 1, start - 1 + toNum(arg(2)))
    }
    case 'UPPER':
      return toStr(arg(0)).toUpperCase()
    case 'LOWER':
      return toStr(arg(0)).toLowerCase()
    case 'TRIM':
      return toStr(arg(0)).trim()
    case 'FIND':
    case 'SEARCH': {
      const needle = toStr(arg(0))
      const hay = toStr(arg(1))
      const start = args.length > 2 ? Math.max(1, toNum(arg(2))) : 1
      const idx =
        name === 'SEARCH'
          ? hay.toLowerCase().indexOf(needle.toLowerCase(), start - 1)
          : hay.indexOf(needle, start - 1)
      if (idx < 0) throw new Error(`${name}: not found`)
      return idx + 1
    }
    case 'SUBSTITUTE': {
      const s = toStr(arg(0))
      const oldT = toStr(arg(1))
      const newT = toStr(arg(2))
      if (oldT === '') return s
      if (args.length > 3) {
        const nth = toNum(arg(3))
        let count = 0
        let i = 0
        let out = ''
        while (i < s.length) {
          if (s.startsWith(oldT, i)) {
            count++
            if (count === nth) return out + newT + s.slice(i + oldT.length)
            out += oldT
            i += oldT.length
          } else {
            out += s[i]
            i++
          }
        }
        return out
      }
      return s.split(oldT).join(newT)
    }
    case 'REPLACE': {
      const s = toStr(arg(0))
      const start = Math.max(1, toNum(arg(1)))
      const len = toNum(arg(2))
      return s.slice(0, start - 1) + toStr(arg(3)) + s.slice(start - 1 + len)
    }
    case 'REPT':
      return toStr(arg(0)).repeat(Math.max(0, toNum(arg(1))))
    case 'PROPER':
      return toStr(arg(0))
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
    case 'EXACT':
      return toStr(arg(0)) === toStr(arg(1))
    case 'VALUE': {
      const n = Number(toStr(arg(0)).replace(/[\s,$%]/g, ''))
      if (!Number.isFinite(n)) throw new Error('VALUE: not a number')
      return n
    }
    case 'TEXTJOIN': {
      const delim = toStr(arg(0))
      const ignoreEmpty = toBool(arg(1))
      const parts: string[] = []
      for (let i = 2; i < args.length; i++) {
        const a = args[i]
        if (a.k === 'range') {
          const g = gridOf(a)
          for (const { r, c } of rangeCoords(a)) {
            const v = toStr(cellValue(g, r, c, seen))
            if (!ignoreEmpty || v !== '') parts.push(v)
          }
        } else {
          const v = toStr(evalNode(a, grid, seen))
          if (!ignoreEmpty || v !== '') parts.push(v)
        }
      }
      return parts.join(delim)
    }
    // Statistical
    case 'MEDIAN': {
      const ns = collectNumbers(args, grid, seen).sort((a, b) => a - b)
      if (!ns.length) throw new Error('MEDIAN of nothing')
      const mid = Math.floor(ns.length / 2)
      return ns.length % 2 ? ns[mid] : (ns[mid - 1] + ns[mid]) / 2
    }
    case 'STDEV':
    case 'STDEVP':
    case 'VAR':
    case 'VARP': {
      const ns = collectNumbers(args, grid, seen)
      const pop = name.endsWith('P')
      if (ns.length < (pop ? 1 : 2)) throw new Error(`${name} needs more numbers`)
      const mean = ns.reduce((a, b) => a + b, 0) / ns.length
      const ss = ns.reduce((a, b) => a + (b - mean) ** 2, 0)
      const variance = ss / (pop ? ns.length : ns.length - 1)
      return name.startsWith('VAR') ? variance : Math.sqrt(variance)
    }
    case 'COUNTBLANK': {
      let n = 0
      for (const a of args) {
        if (a.k === 'range') {
          const g = gridOf(a)
          for (const { r, c } of rangeCoords(a)) if (cellRaw(g, r, c).trim() === '') n++
        } else {
          const v = evalNode(a, grid, seen)
          if (typeof v === 'string' && v.trim() === '') n++
        }
      }
      return n
    }
    // Multi-criteria
    case 'SUMIFS':
    case 'AVERAGEIFS':
    case 'COUNTIFS': {
      const isCount = name === 'COUNTIFS'
      const sumRange = isCount ? null : args[0]?.k === 'range' ? args[0] : null
      if (!isCount && !sumRange) throw new Error(`${name} needs a sum range`)
      const pairStart = isCount ? 0 : 1
      const pairs: Array<{ range: Extract<Node, { k: 'range' }>; crit: CellValue }> = []
      for (let i = pairStart; i + 1 < args.length; i += 2) {
        const rangeNode = args[i]
        if (rangeNode.k !== 'range') throw new Error(`${name}: criteria range expected`)
        pairs.push({ range: rangeNode, crit: evalNode(args[i + 1], grid, seen) })
      }
      if (!pairs.length) throw new Error(`${name} needs a range/criteria pair`)
      const coordsList = pairs.map((p) => rangeCoords(p.range))
      const pairGrids = pairs.map((p) => gridOf(p.range))
      const len = coordsList[0].length
      const sumCells = sumRange ? rangeCoords(sumRange) : null
      const sumGrid = sumRange ? gridOf(sumRange) : grid
      let sum = 0
      let count = 0
      for (let i = 0; i < len; i++) {
        const ok = pairs.every((p, pi) =>
          matchCriteria(cellValue(pairGrids[pi], coordsList[pi][i].r, coordsList[pi][i].c, seen), p.crit)
        )
        if (!ok) continue
        count++
        if (sumCells) {
          const sc = sumCells[i]
          const v = cellNumeric(sumGrid, sc.r, sc.c, seen)
          if (v !== null) sum += v
        }
      }
      if (isCount) return count
      if (name === 'AVERAGEIFS') {
        if (!count) throw new Error('AVERAGEIFS of nothing')
        return sum / count
      }
      return sum
    }
    case 'SUMPRODUCT': {
      const ranges = args.filter((a) => a.k === 'range') as Array<Extract<Node, { k: 'range' }>>
      if (!ranges.length) throw new Error('SUMPRODUCT needs ranges')
      const coordsList = ranges.map(rangeCoords)
      const rangeGrids = ranges.map((rg) => gridOf(rg))
      const len = coordsList[0].length
      let total = 0
      for (let i = 0; i < len; i++) {
        let prod = 1
        for (let ri = 0; ri < ranges.length; ri++) {
          const { r, c } = coordsList[ri][i]
          prod *= cellNumeric(rangeGrids[ri], r, c, seen) ?? 0
        }
        total += prod
      }
      return total
    }
    // Math (extra)
    case 'INT':
      return Math.floor(toNum(arg(0)))
    case 'TRUNC': {
      const d = args.length > 1 ? toNum(arg(1)) : 0
      const f = Math.pow(10, d)
      return Math.trunc(toNum(arg(0)) * f) / f
    }
    case 'CEILING': {
      const sig = args.length > 1 ? toNum(arg(1)) : 1
      return sig === 0 ? 0 : Math.ceil(toNum(arg(0)) / sig) * sig
    }
    case 'FLOOR': {
      const sig = args.length > 1 ? toNum(arg(1)) : 1
      return sig === 0 ? 0 : Math.floor(toNum(arg(0)) / sig) * sig
    }
    case 'SIGN':
      return Math.sign(toNum(arg(0)))
    case 'EXP':
      return Math.exp(toNum(arg(0)))
    case 'LN': {
      const x = toNum(arg(0))
      if (x <= 0) throw new Error('LN domain')
      return Math.log(x)
    }
    case 'LOG10': {
      const x = toNum(arg(0))
      if (x <= 0) throw new Error('LOG10 domain')
      return Math.log10(x)
    }
    case 'LOG': {
      const x = toNum(arg(0))
      const base = args.length > 1 ? toNum(arg(1)) : 10
      if (x <= 0) throw new Error('LOG domain')
      return Math.log(x) / Math.log(base)
    }
    // Date
    case 'YEAR':
    case 'MONTH':
    case 'DAY':
    case 'WEEKDAY': {
      const d = parseDate(toStr(arg(0)))
      if (!d) throw new Error(`${name}: bad date`)
      if (name === 'YEAR') return d.getUTCFullYear()
      if (name === 'MONTH') return d.getUTCMonth() + 1
      if (name === 'DAY') return d.getUTCDate()
      return d.getUTCDay() + 1 // WEEKDAY: Sunday = 1
    }
    case 'TODAY': {
      const d = new Date()
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
    case 'NOW':
      return new Date().toISOString()
    // Lookup
    case 'MATCH': {
      const key = arg(0)
      if (args[1]?.k !== 'range') throw new Error('MATCH needs a range')
      const g = gridOf(args[1])
      const coords = rangeCoords(args[1])
      const type = args.length > 2 ? toNum(arg(2)) : 1
      if (type === 0) {
        for (let i = 0; i < coords.length; i++)
          if (compare('=', cellValue(g, coords[i].r, coords[i].c, seen), key)) return i + 1
        throw new Error('MATCH: not found')
      }
      let best = -1
      for (let i = 0; i < coords.length; i++) {
        const v = cellValue(g, coords[i].r, coords[i].c, seen)
        if (type === 1 ? compare('<=', v, key) : compare('>=', v, key)) best = i
      }
      if (best < 0) throw new Error('MATCH: not found')
      return best + 1
    }
    case 'INDEX': {
      if (args[0]?.k !== 'range') throw new Error('INDEX needs a range')
      const rg = args[0]
      const g = gridOf(rg)
      const rows = rg.r2 - rg.r1 + 1
      const cols = rg.c2 - rg.c1 + 1
      const a1 = toNum(arg(1))
      let rr: number
      let cc: number
      if (args.length <= 2 && rows === 1) {
        rr = rg.r1
        cc = rg.c1 + (a1 - 1)
      } else if (args.length <= 2 && cols === 1) {
        rr = rg.r1 + (a1 - 1)
        cc = rg.c1
      } else {
        rr = rg.r1 + (a1 - 1)
        cc = rg.c1 + ((args.length > 2 ? toNum(arg(2)) : 1) - 1)
      }
      if (rr < rg.r1 || rr > rg.r2 || cc < rg.c1 || cc > rg.c2) throw new Error('INDEX out of range')
      return cellValue(g, rr, cc, seen)
    }
    case 'VLOOKUP':
    case 'HLOOKUP': {
      const key = arg(0)
      if (args[1]?.k !== 'range') throw new Error(`${name} needs a table range`)
      const rg = args[1]
      const g = gridOf(rg)
      const idx = toNum(arg(2))
      const exact = args.length > 3 ? !toBool(arg(3)) : true
      const horizontal = name === 'HLOOKUP'
      if (idx < 1) throw new Error(`${name}: bad index`)
      const lineVal = (i: number): CellValue =>
        horizontal ? cellValue(g, rg.r1, i, seen) : cellValue(g, i, rg.c1, seen)
      const resultVal = (i: number): CellValue =>
        horizontal ? cellValue(g, rg.r1 + idx - 1, i, seen) : cellValue(g, i, rg.c1 + idx - 1, seen)
      const lo = horizontal ? rg.c1 : rg.r1
      const hi = horizontal ? rg.c2 : rg.r2
      const lim = horizontal ? rg.r1 + idx - 1 : rg.c1 + idx - 1
      if (lim > (horizontal ? rg.r2 : rg.c2)) throw new Error(`${name}: index out of range`)
      for (let i = lo; i <= hi; i++) if (compare('=', lineVal(i), key)) return resultVal(i)
      if (!exact) {
        let best = -1
        for (let i = lo; i <= hi; i++) if (compare('<=', lineVal(i), key)) best = i
        if (best >= 0) return resultVal(best)
      }
      throw new Error(`${name}: not found`)
    }
    default:
      throw new Error(`unknown function ${name}`)
  }
}

// Evaluate a formula string (without the leading '=') against the grid. Exposed
// for unit testing the engine directly. Pass a Workbook to resolve cross-sheet
// references (Sheet2!A1).
export function evaluateFormula(
  grid: Grid,
  formula: string,
  seedKey = '__seed__',
  wb?: Workbook
): CellValue {
  WB = wb ?? null
  try {
    return evalNode(parse(formula), grid, new Set([`${gridId(grid)}:${seedKey}`]))
  } finally {
    WB = null
  }
}

// True if a formula string parses (syntax only — it may still reference empty
// cells). The AI formula assistant uses this as an honesty gate so a formula the
// engine cannot even parse is never offered for insertion.
export function isParseableFormula(formula: string): boolean {
  const src = formula.startsWith('=') ? formula.slice(1) : formula
  if (src.trim() === '') return false
  try {
    parse(src)
    return true
  } catch {
    return false
  }
}

// The value to DISPLAY for a cell: raw text, the evaluated formula, or #ERR.
// Never a silent wrong number.
export function displayCell(grid: Grid, r: number, c: number, wb?: Workbook): string {
  const raw = cellRaw(grid, r, c)
  if (!raw.startsWith('=')) return raw
  WB = wb ?? null
  try {
    const v = evalNode(parse(raw.slice(1)), grid, new Set([`${gridId(grid)}:${r},${c}`]))
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return '#ERR'
      return String(Math.round(v * 1e6) / 1e6)
    }
    return v
  } catch {
    return '#ERR'
  } finally {
    WB = null
  }
}
