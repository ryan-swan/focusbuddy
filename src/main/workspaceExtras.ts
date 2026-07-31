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

// ── The widget content-extraction dispatcher (plexi-brain P2.5 — Layer 1) ────────
// One function turns ANY widget's stored `content` into plain, ingestible text, so BOTH
// the keyword extras pool (collectExtraSources) and the semantic indexer ('widget'
// sourceType) call the same extractor — no duplication, no drift.
//
// The discipline: return '' for a kind we don't extract (media / UI-state / container /
// pointer) so the caller SKIPS it — never index noise. Text-bearing kinds return their
// real prose; JSON-config kinds are parsed main-side (widget configs round-trip as opaque
// strings through the store, so this is a pure JSON.parse — no renderer import).
//
// Kinds carrying NO extractable text, OR whose text is already indexed elsewhere — skip
// them so recall isn't diluted and nothing is double-counted:
const NON_TEXT_WIDGET_KINDS: ReadonlySet<string> = new Set([
  // genuine NONE — media / UI-state / containers / freehand
  'minimap', 'calculator', 'timer', 'color', 'scratchpad', 'section', 'image', 'video',
  'shape', 'task-list',
  // pointers whose target is already indexed (emit edges later, never re-extract text)
  'task-link', 'portal', 'doc', 'sheet', 'slides', 'map', 'drive', 'file',
  // external/live surfaces — deferred to a later increment (url+title / capture seam)
  'webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email', 'chat-thread',
  // structured/thin kinds deferred to later increments (need id→label resolution)
  'field', 'custom-block', 'diagram', 'chart', 'streamdeck', 'local-app-launcher'
])

export function widgetText(kind: string, content: string): string {
  const c = content || ''
  if (NON_TEXT_WIDGET_KINDS.has(kind)) return ''

  // Tiptap-JSON kinds: parse the ProseMirror tree to text (fall back to the raw string
  // for legacy bare-string content). 'page' and 'living-doc' share this exact shape.
  if (kind === 'page' || kind === 'living-doc') {
    try {
      return extractDocText('doc', JSON.parse(c))
    } catch {
      return c
    }
  }

  // 'card' stores JSON {title, body, ...}; join title + body. Parse-fail ⇒ treat the
  // whole string as body (a legacy or plain card).
  if (kind === 'card') {
    try {
      const d = JSON.parse(c) as { title?: string; body?: string }
      return [d.title, d.body].filter(Boolean).join('\n').trim()
    } catch {
      return c
    }
  }

  // sticky / note / markdown (and any other plain-text kind) store the text verbatim.
  return c
}

// Back-compat alias — the original name kept so existing callers are untouched.
export function noteWidgetText(kind: string, content: string): string {
  return widgetText(kind, content)
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
