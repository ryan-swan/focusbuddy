// Widens "ask your workspace" beyond documents: it also grounds answers in your
// tasks, your database tables, and the notes/sticky/markdown/page content sitting
// on your desks. All keyword-ranked through the same pure rankSources the
// document path uses, so scores are comparable and nothing is fabricated (a pool
// with no term hits contributes nothing).

import { listNodes } from './db/nodes'
import { listTables, listRows } from './db/tables'
import { listWidgetsByKind } from './db/widgets'
import { rankSources, extractDocText, type WorkspaceSource } from './workspaceRank'
import type { FbTable, FbRow } from '@shared/fields'

type Candidate = { docId: string; title: string; docType: string; text: string }

// A table flattened to text: title, column headers, then each row's cell values.
export function tableToText(table: FbTable, rows: FbRow[]): string {
  const cols = table.schema.columns
  const header = cols.map((c) => c.label).filter(Boolean).join(' | ')
  const body = rows
    .slice(0, 40)
    .map((r) =>
      cols
        .map((c) => {
          const v = r.cells[c.id]
          if (v == null) return ''
          if (Array.isArray(v)) return v.join(' ')
          return typeof v === 'object' ? JSON.stringify(v) : String(v)
        })
        .join(' | ')
    )
    .join('\n')
  return `${table.title}\n${header}\n${body}`.trim()
}

// A canvas note's text. A 'page' widget stores Tiptap JSON; the rest are plain.
export function noteWidgetText(kind: string, content: string): string {
  if (kind === 'page') {
    try {
      return extractDocText('doc', JSON.parse(content))
    } catch {
      return content
    }
  }
  return content
}

// Gather and keyword-rank workspace content that is NOT a document: tasks,
// tables, and canvas notes. Returns the top matches as WorkspaceSources.
//
// scopeNodeIds encodes user-driven relatedness: when provided, only content
// belonging to those desks (the current desk plus the desks the user explicitly
// related to it) is considered, so the brain never assumes two unrelated desks
// in the same org have anything to do with each other. Omit it for an explicit
// whole-workspace search.
export function collectExtraSources(
  query: string,
  limit = 6,
  scopeNodeIds?: string[]
): WorkspaceSource[] {
  const scope = scopeNodeIds ? new Set(scopeNodeIds) : null
  const inScopeTask = (taskId: string | null | undefined): boolean =>
    !scope || (taskId != null && scope.has(taskId))
  const pool: Candidate[] = []

  for (const n of listNodes()) {
    if (n.kind !== 'task') continue
    if (scope && !scope.has(n.id)) continue
    const text = `${n.title}\n${n.description ?? ''}`.trim()
    if (text) pool.push({ docId: n.id, title: n.title || 'Untitled task', docType: 'task', text })
  }

  for (const t of listTables()) {
    if (!inScopeTask(t.taskId)) continue
    const text = tableToText(t, listRows(t.id))
    if (text) pool.push({ docId: t.id, title: t.title || 'Untitled table', docType: 'table', text })
  }

  for (const kind of ['note', 'sticky', 'markdown', 'page'] as const) {
    for (const w of listWidgetsByKind(kind)) {
      if (!inScopeTask(w.taskId)) continue
      const text = noteWidgetText(kind, w.content || '').trim()
      if (text) pool.push({ docId: w.id, title: w.title || text.slice(0, 40), docType: 'note', text })
    }
  }

  return rankSources(query, pool, limit)
}
