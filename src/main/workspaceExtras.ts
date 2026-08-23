// Widens "ask your workspace" beyond documents: it also grounds answers in your
// tasks, your database tables, and the notes/sticky/markdown/page content sitting
// on your desks. All keyword-ranked through the same pure rankSources the
// document path uses, so scores are comparable and nothing is fabricated (a pool
// with no term hits contributes nothing).

import { listNodes } from './db/nodes'
import { listTables, listRows } from './db/tables'
import { listWidgetsByKind } from './db/widgets'
import { rankSources, mergeScopedPools, extractDocText, type WorkspaceSource } from './workspaceRank'
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
// scopeNodeIds encodes user-driven relatedness: the current desk plus the
// desks the user explicitly related to it. Scoped content leads; everything
// else in the SAME org is demoted, never excluded (#12) — the answer sitting
// on an unrelated desk must still be findable, just ranked behind on-desk
// matches. Omit scopeNodeIds for a flat whole-workspace search.
//
// The org boundary is absolute and separate from scope: tables and widgets
// carry no org of their own, only a desk id, so anything whose desk is not one
// of the active org's nodes never enters the pool at all. (Before this check
// an unscoped search read every org's tables and canvas notes — a leak, not a
// demotion candidate.)
export function collectExtraSources(
  query: string,
  limit = 6,
  scopeNodeIds?: string[]
): WorkspaceSource[] {
  const scope = scopeNodeIds && scopeNodeIds.length > 0 ? new Set(scopeNodeIds) : null
  const orgNodeIds = new Set<string>()
  const inPool: Candidate[] = []
  const offPool: Candidate[] = []
  const add = (taskId: string | null | undefined, c: Candidate): void => {
    if (taskId == null || !orgNodeIds.has(taskId)) return
    ;(!scope || scope.has(taskId) ? inPool : offPool).push(c)
  }

  for (const n of listNodes()) {
    orgNodeIds.add(n.id)
    if (n.kind !== 'task') continue
    const text = `${n.title}\n${n.description ?? ''}`.trim()
    if (!text) continue
    const cand = { docId: n.id, title: n.title || 'Untitled task', docType: 'task', text }
    ;(!scope || scope.has(n.id) ? inPool : offPool).push(cand)
  }

  for (const t of listTables()) {
    const text = tableToText(t, listRows(t.id))
    if (text) add(t.taskId, { docId: t.id, title: t.title || 'Untitled table', docType: 'table', text })
  }

  for (const kind of ['note', 'sticky', 'markdown', 'page'] as const) {
    for (const w of listWidgetsByKind(kind)) {
      const text = noteWidgetText(kind, w.content || '').trim()
      if (text) add(w.taskId, { docId: w.id, title: w.title || text.slice(0, 40), docType: 'note', text })
    }
  }

  return mergeScopedPools(rankSources(query, inPool, limit), rankSources(query, offPool, limit), limit)
}
