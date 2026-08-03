// Infer a table column type from sample string values. Shared by the main-side
// grid reader (new-table-from-file) and the renderer-side import wizard
// (suggesting a type for a newly created column). Order matters: number before
// checkbox before date, then long-vs-short text. Conservative so a stray digit
// is not mislabelled.

import type { FieldType } from './fields'

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/

export function inferColumnType(samples: string[]): FieldType {
  const s = samples.map((v) => (v ?? '').toString().trim()).filter((v) => v !== '')
  if (s.length === 0) return 'text-short'
  if (s.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number'
  if (s.every((v) => /^(true|false|yes|no)$/i.test(v))) return 'checkbox'
  if (s.every((v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v)))) return 'date'
  if (s.some((v) => v.length > 80)) return 'text-long'
  return 'text-short'
}
