import { getTable, listRows } from '../db/tables'
import type { Widget } from '@shared/types'

// Shared, synchronous per-widget summariser. Used both for resolving a single
// agent input and for aggregating a whole desk behind a portal. Deliberately
// network-free: a browser contributes its URL + title only (deep page reads
// happen when a browser is wired DIRECTLY into an agent, via the live webview).

export function tiptapText(s: string): string {
  const out: string[] = []
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && out.length < 200) out.push(m[1])
  return out.join(' ').replace(/\\n/g, ' ')
}

export function tableText(tableId: string): string {
  const table = getTable(tableId)
  if (!table) return '(table not found)'
  const cols = table.schema.columns
  const header = cols.map((c) => c.label).join(' | ')
  const rows = listRows(tableId)
    .slice(0, 40)
    .map((r) => cols.map((c) => r.cells[c.id] ?? '').join(' | '))
  return [`Table "${table.title}"`, header, ...rows].join('\n')
}

export function summariseWidget(w: Widget): string {
  const raw = w.content ?? ''
  switch (w.kind) {
    case 'webview':
      return `Browser: ${w.title || raw || '(no URL)'}${w.title && raw ? ` (${raw})` : ''}`
    case 'table':
      return raw ? tableText(raw) : '(empty table)'
    case 'page':
      return tiptapText(raw) || '(empty document)'
    case 'field':
      try {
        const p = JSON.parse(raw || '{}') as { def?: { label?: string }; value?: unknown }
        return `${p.def?.label ?? 'Field'}: ${JSON.stringify(p.value ?? '')}`
      } catch {
        return raw
      }
    case 'card':
      try {
        const p = JSON.parse(raw || '{}') as { title?: string; body?: string }
        return `${p.title ?? ''}\n${p.body ?? ''}`.trim()
      } catch {
        return raw
      }
    case 'agent':
      try {
        return (JSON.parse(raw || '{}') as { lastOutput?: string }).lastOutput ?? ''
      } catch {
        return ''
      }
    case 'file':
    case 'image':
      return raw ? `File/link: ${raw}` : '(empty file)'
    // A portal inside an aggregated desk is summarised by name only here; its
    // full desk is pulled in when it is wired directly (the aggregator handles
    // that path with cycle + depth guards).
    case 'portal':
      return '(portal to another desk)'
    case 'sticky':
    case 'note':
    case 'markdown':
      return raw
    default:
      return raw
  }
}
