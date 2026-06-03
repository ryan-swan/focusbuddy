// File import — turns the contents of a picked file into a draft widget
// the renderer can drop onto the canvas. Four flavours:
//   .txt / .md       → page | markdown | note (caller picks kind)
//   .csv              → table (columns inferred from header row)
//   .json (array)     → table (columns inferred from union of object keys)
//   .json (object)    → page with the JSON pretty-printed inside a code
//                       block — fallback for non-tabular structure
//
// Returns a *draft* — the renderer is responsible for the actual widget
// creation through the existing widgetStore.create() pipeline. That way
// import shares the same persistence + canvas drop semantics as a
// manually-created widget.

import { dialog } from 'electron'
import { extname, basename } from 'path'
import { readFile } from 'fs/promises'
import type { FieldDefinition, TableSchema } from '@shared/fields'

export type ImportTargetKind = 'page' | 'markdown' | 'note'

export interface ImportTextDraft {
  kind: 'text'
  // Pre-converted body the renderer can stuff straight into widget
  // content. For 'page' we ship a Tiptap-compatible doc JSON; for
  // markdown/note we ship the raw markdown / plain text.
  targetKind: ImportTargetKind
  title: string
  content: string
  sourcePath: string
}

export interface ImportTableDraft {
  kind: 'table'
  title: string
  schema: TableSchema
  rows: Array<Record<string, string>>
  sourcePath: string
}

export interface ImportPageDraft {
  kind: 'page-from-json'
  title: string
  // Tiptap doc JSON
  content: string
  sourcePath: string
}

export type ImportDraft = ImportTextDraft | ImportTableDraft | ImportPageDraft

export interface ImportError {
  ok: false
  error: string
  reason: 'cancelled' | 'unsupported' | 'parse' | 'read' | 'docx_not_supported'
}

const ALL_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json'] as const
type SupportedExt = (typeof ALL_EXTENSIONS)[number]

function pickExt(path: string): SupportedExt | 'docx' | 'doc' | null {
  const raw = extname(path).toLowerCase().replace(/^\./, '')
  if (raw === 'markdown') return 'md'
  if (raw === 'docx') return 'docx'
  if (raw === 'doc') return 'doc'
  return (ALL_EXTENSIONS as readonly string[]).includes(raw)
    ? (raw as SupportedExt)
    : null
}

/**
 * Open the system file picker, scoped to the formats we can import.
 * Returns the absolute path or null if the user cancelled.
 */
export async function pickFileForImport(): Promise<string | null> {
  const res = await dialog.showOpenDialog({
    title: 'Import file',
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['txt', 'md', 'markdown'] },
      { name: 'Spreadsheets / Data', extensions: ['csv', 'json'] },
      { name: 'All importable', extensions: ['txt', 'md', 'markdown', 'csv', 'json'] }
    ]
  })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
}

/**
 * Read a file off disk and turn it into a widget draft. The caller
 * picks the target widget kind for plain-text formats; the import
 * routine always emits a table for csv and tries to for array-of-
 * object json.
 */
export async function importFile(
  path: string,
  preferredTextKind: ImportTargetKind = 'page'
): Promise<ImportDraft | ImportError> {
  const ext = pickExt(path)
  if (ext === null) {
    return {
      ok: false,
      error: `Unsupported file type. Supported: ${ALL_EXTENSIONS.join(', ')}.`,
      reason: 'unsupported'
    }
  }
  if (ext === 'doc' || ext === 'docx') {
    return {
      ok: false,
      error:
        'Word (.doc / .docx) import is coming soon. For now, save the file as .md or .txt and import that instead.',
      reason: 'docx_not_supported'
    }
  }
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't read file: ${(err as Error).message}`,
      reason: 'read'
    }
  }
  const title = basename(path).replace(/\.(txt|md|markdown|csv|json)$/i, '')

  if (ext === 'csv') {
    return parseCsvAsTable(raw, title, path)
  }
  if (ext === 'json') {
    return parseJsonAsTableOrPage(raw, title, path)
  }
  // txt / md — wrap as the caller's preferred widget kind.
  return {
    kind: 'text',
    targetKind: preferredTextKind,
    title,
    content:
      preferredTextKind === 'page'
        ? JSON.stringify(textToTiptap(raw, ext === 'md'))
        : raw,
    sourcePath: path
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function parseCsvAsTable(
  raw: string,
  title: string,
  sourcePath: string
): ImportTableDraft | ImportError {
  const rows = parseCsv(raw)
  if (rows.length === 0) {
    return { ok: false, error: 'CSV file appears to be empty.', reason: 'parse' }
  }
  const header = rows[0].map((h, i) => (h.trim() || `Column ${i + 1}`))
  const dataRows = rows.slice(1)
  const schema: TableSchema = {
    columns: header.map((label, i) => {
      const id = `c-${Date.now().toString(36)}-${i}`
      // Infer column type from the first ~20 sample values. If everything
      // parses as a number, use 'number'. If everything is a "yes/no" or
      // "true/false", use 'checkbox'. Otherwise default to short-text.
      const sample = dataRows
        .slice(0, 20)
        .map((r) => (r[i] ?? '').trim())
        .filter((v) => v !== '')
      let type: FieldDefinition['type'] = 'text-short'
      if (sample.length > 0) {
        if (sample.every((v) => /^-?\d+(\.\d+)?$/.test(v))) type = 'number'
        else if (sample.every((v) => /^(true|false|yes|no|1|0)$/i.test(v))) type = 'checkbox'
        else if (sample.some((v) => v.length > 80)) type = 'text-long'
      }
      return {
        id,
        type,
        label,
        config: {} as FieldDefinition['config']
      } as FieldDefinition
    })
  }
  // Materialise rows keyed by the human label (not the column id) — the
  // executor coerces on the way in, and keeping labels makes the
  // payload self-descriptive in logs / serialisations.
  const tableRows = dataRows
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      header.forEach((h, i) => {
        obj[h] = r[i] ?? ''
      })
      return obj
    })
  return {
    kind: 'table',
    title,
    schema,
    rows: tableRows,
    sourcePath
  }
}

// Tiny RFC4180-flavour CSV parser. Handles quoted fields, embedded
// commas, embedded newlines inside quotes, and double-quote escapes.
// Does NOT handle BOM auto-strip or non-UTF-8 encodings — the spec
// for this project is "modern files only".
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Strip BOM if present.
  if (input.charCodeAt(0) === 0xfeff) i = 1
  while (i < input.length) {
    const c = input[i]
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }
    if (c === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (c === '\r') {
      i += 1
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += c
    i += 1
  }
  // Flush the final field/row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ── JSON ────────────────────────────────────────────────────────────────────

function parseJsonAsTableOrPage(
  raw: string,
  title: string,
  sourcePath: string
): ImportDraft | ImportError {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${(err as Error).message}`,
      reason: 'parse'
    }
  }
  // Array of objects → table. Other shapes → fall through to page.
  if (Array.isArray(parsed) && parsed.length > 0) {
    const objRows = parsed.filter(
      (x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)
    )
    if (objRows.length === parsed.length) {
      return jsonArrayToTable(objRows, title, sourcePath)
    }
  }
  // Pretty-print + wrap as a page widget (Tiptap doc with one paragraph
  // containing a code block).
  const pretty = JSON.stringify(parsed, null, 2)
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: title }]
      },
      {
        type: 'codeBlock',
        attrs: { language: 'json' },
        content: [{ type: 'text', text: pretty }]
      }
    ]
  }
  return {
    kind: 'page-from-json',
    title,
    content: JSON.stringify(doc),
    sourcePath
  }
}

function jsonArrayToTable(
  rows: Record<string, unknown>[],
  title: string,
  sourcePath: string
): ImportTableDraft {
  // Union of keys across all rows, preserving insertion order from the
  // first row that introduced each key.
  const keyOrder: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        keyOrder.push(k)
      }
    }
  }
  const schema: TableSchema = {
    columns: keyOrder.map((label, i) => {
      const id = `c-${Date.now().toString(36)}-${i}`
      // Sample first 20 values for type inference.
      const sample = rows
        .slice(0, 20)
        .map((r) => r[label])
        .filter((v) => v !== undefined && v !== null)
      let type: FieldDefinition['type'] = 'text-short'
      if (sample.length > 0) {
        if (sample.every((v) => typeof v === 'number')) type = 'number'
        else if (sample.every((v) => typeof v === 'boolean')) type = 'checkbox'
        else if (sample.some((v) => typeof v === 'string' && v.length > 80)) type = 'text-long'
      }
      return {
        id,
        type,
        label,
        config: {} as FieldDefinition['config']
      } as FieldDefinition
    })
  }
  const tableRows = rows.map((r) => {
    const obj: Record<string, string> = {}
    for (const k of keyOrder) {
      const v = r[k]
      if (v === undefined || v === null) {
        obj[k] = ''
      } else if (typeof v === 'string') {
        obj[k] = v
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        obj[k] = String(v)
      } else {
        obj[k] = JSON.stringify(v)
      }
    }
    return obj
  })
  return {
    kind: 'table',
    title,
    schema,
    rows: tableRows,
    sourcePath
  }
}

// ── Text → Tiptap ───────────────────────────────────────────────────────────

// Minimal markdown / plain-text → Tiptap conversion. Only supports the
// nodes we actually want from an imported document: headings (#-####),
// task lists (- [ ]), bullet lists (- ), ordered lists (1. ), code
// fences, blockquotes (> ), and paragraphs. Anything more exotic
// (tables, footnotes, html) collapses to plain paragraphs — better an
// imported doc than a parser error.
function textToTiptap(raw: string, isMarkdown: boolean): {
  type: 'doc'
  content: object[]
} {
  if (!isMarkdown) {
    // .txt — every blank-line-separated block becomes its own paragraph.
    const blocks = raw.split(/\n{2,}/).map((b) => b.replace(/\n+/g, ' ').trim()).filter(Boolean)
    if (blocks.length === 0) {
      return { type: 'doc', content: [{ type: 'paragraph' }] }
    }
    return {
      type: 'doc',
      content: blocks.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }))
    }
  }
  // Lightweight markdown parser — line-based. Good enough for imported
  // notes; a future iteration can swap to marked / remark for
  // full-fidelity conversion.
  const lines = raw.split('\n')
  const out: object[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      out.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: [{ type: 'text', text: heading[2].trim() }]
      })
      i += 1
      continue
    }
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i])
        i += 1
      }
      i += 1 // skip closing fence
      out.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: buf.join('\n') }]
      })
      continue
    }
    if (line.startsWith('> ')) {
      const buf = [line.slice(2)]
      i += 1
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2))
        i += 1
      }
      out.push({
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: buf.join(' ') }] }
        ]
      })
      continue
    }
    // Task list — consume the run of consecutive task items.
    if (/^- \[[ xX]\]\s/.test(line)) {
      const items: object[] = []
      while (i < lines.length && /^- \[[ xX]\]\s/.test(lines[i])) {
        const m = lines[i].match(/^- \[([ xX])\]\s+(.*)$/)
        if (m) {
          items.push({
            type: 'taskItem',
            attrs: { checked: m[1].toLowerCase() === 'x' },
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: m[2].trim() }] }
            ]
          })
        }
        i += 1
      }
      out.push({ type: 'taskList', content: items })
      continue
    }
    // Bullet list.
    if (/^[-*]\s+/.test(line)) {
      const items: object[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[i].replace(/^[-*]\s+/, '').trim() }]
            }
          ]
        })
        i += 1
      }
      out.push({ type: 'bulletList', content: items })
      continue
    }
    // Ordered list.
    if (/^\d+\.\s+/.test(line)) {
      const items: object[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[i].replace(/^\d+\.\s+/, '').trim() }]
            }
          ]
        })
        i += 1
      }
      out.push({ type: 'orderedList', content: items })
      continue
    }
    // Plain paragraph — read forward until blank line.
    const buf = [line]
    i += 1
    while (i < lines.length && lines[i].trim() !== '') {
      buf.push(lines[i])
      i += 1
    }
    out.push({
      type: 'paragraph',
      content: [{ type: 'text', text: buf.join(' ').trim() }]
    })
  }
  if (out.length === 0) out.push({ type: 'paragraph' })
  return { type: 'doc', content: out }
}
