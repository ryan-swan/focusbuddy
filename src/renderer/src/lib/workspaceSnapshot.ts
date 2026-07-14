// Layer 1 of the chat's workspace awareness: the deterministic index.
//
// Gathers a cheap, structural map of the ENTIRE workspace — every desk, task,
// widget, and document — as ids + titles + kinds only (never bodies). This is
// small even at scale (a few dozen bytes per item), so the assistant can always
// be told WHAT EXISTS and WHERE, workspace-wide, and reference/act on real items
// by id. The heavy content of any single item is fetched on demand later
// (Layer 2: retrieval), keyed on the ids this snapshot surfaces.
//
// Pure read from the live stores — no IPC, no async, no fabrication. Bounded so
// an enormous workspace can't blow the request; when capped, `truncated` is set
// so the prompt can say so honestly rather than silently dropping items.

import type {
  WorkspaceSnapshot,
  WorkspaceDeskSummary,
  WorkspaceTaskSummary,
  WorkspaceWidgetSummary,
  WorkspaceDocumentSummary
} from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useDocumentsStore } from '../stores/documents'

// Caps chosen to keep the index comfortably within a small token budget while
// covering any realistic workspace. If a limit bites, `truncated` is flagged.
const MAX_DESKS = 60
const MAX_TASKS = 400
const MAX_WIDGETS = 600
const MAX_DOCS = 200

// Resolve which top-level desk (folder with parentId===null) a node belongs to,
// by walking parents. Returns null if the node isn't under a desk.
function deskIdOf(
  nodeId: string,
  byId: Map<string, { id: string; parentId: string | null; kind: string }>
): string | null {
  let cur = byId.get(nodeId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (cur.parentId === null && cur.kind === 'folder') return cur.id
    if (cur.parentId === null) return cur.kind === 'folder' ? cur.id : null
    cur = cur.parentId ? byId.get(cur.parentId) ?? undefined : undefined
  }
  return null
}

export function gatherWorkspaceSnapshot(): WorkspaceSnapshot {
  const nodes = useNodeStore.getState().nodes.filter((n) => !n.archived)
  const activeTaskId = useNodeStore.getState().activeTaskId
  const widgets = useWidgetStore.getState().widgets.filter((w) => !w.archived)
  const docs = useDocumentsStore.getState().list

  const byId = new Map(nodes.map((n) => [n.id, { id: n.id, parentId: n.parentId, kind: n.kind }]))

  let truncated = false

  // Desks = top-level folders. Tasks = task / task-item nodes, mapped to a desk.
  const deskNodes = nodes.filter((n) => n.parentId === null && n.kind === 'folder')
  const taskNodes = nodes.filter((n) => n.kind === 'task' || n.kind === 'task-item')

  const cappedTasks = taskNodes.slice(0, MAX_TASKS)
  if (cappedTasks.length < taskNodes.length) truncated = true

  const tasks: WorkspaceTaskSummary[] = cappedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    deskId: deskIdOf(t.id, byId),
    active: t.id === activeTaskId
  }))

  // Group task ids under their desk for the tree shape.
  const taskIdsByDesk = new Map<string, string[]>()
  for (const t of tasks) {
    if (!t.deskId) continue
    const list = taskIdsByDesk.get(t.deskId) ?? []
    list.push(t.id)
    taskIdsByDesk.set(t.deskId, list)
  }

  const cappedDesks = deskNodes.slice(0, MAX_DESKS)
  if (cappedDesks.length < deskNodes.length) truncated = true
  const desks: WorkspaceDeskSummary[] = cappedDesks.map((d) => ({
    id: d.id,
    title: d.title,
    taskIds: taskIdsByDesk.get(d.id) ?? []
  }))

  // Widgets: id + owning task + kind + title. Section widgets are structural
  // containers, not content — skip them to keep the index about real items.
  const contentWidgets = widgets.filter((w) => w.kind !== 'section')
  const cappedWidgets = contentWidgets.slice(0, MAX_WIDGETS)
  if (cappedWidgets.length < contentWidgets.length) truncated = true
  const widgetSummaries: WorkspaceWidgetSummary[] = cappedWidgets.map((w) => ({
    id: w.id,
    taskId: w.taskId,
    kind: w.kind,
    title: w.title || ''
  }))

  const cappedDocs = docs.slice(0, MAX_DOCS)
  if (cappedDocs.length < docs.length) truncated = true
  const documents: WorkspaceDocumentSummary[] = cappedDocs.map((d) => ({
    id: d.id,
    docType: d.docType,
    title: d.title || ''
  }))

  return {
    activeTaskId,
    desks,
    tasks,
    widgets: widgetSummaries,
    documents,
    truncated: truncated || undefined
  }
}

// Expose the real gatherer on window so e2e specs can assert what the agent is
// actually fed against a seeded workspace — a thin handle to the shipping
// function, not a mock. Changes nothing for users.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbWorkspaceSnapshot?: typeof gatherWorkspaceSnapshot }).__fbWorkspaceSnapshot =
    gatherWorkspaceSnapshot
}
