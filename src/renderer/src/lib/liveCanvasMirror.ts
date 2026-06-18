// The local "mirror" task that backs a live canvas, plus the promote helper.
//
// A live canvas's canonical state lives on the signal server. To RENDER it the
// app reuses the normal Canvas, which draws whatever task is active — so each
// live canvas is mirrored into a hidden local task. The mirror is archived so
// it never appears in the sidebar or desk lists, but it is injected into the
// node store so the Canvas's `nodes.find(activeTaskId)` resolves. One mirror per
// live canvas id, remembered across sessions in localStorage so reopening reuses
// the same task instead of piling up duplicates.

import type { FbNode } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { createLiveDoc } from './docCollabClient'
import { serializeCanvasBody } from './liveCanvas'

const MIRROR_MAP_KEY = 'fb.livecanvas.mirrors'

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MIRROR_MAP_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeMap(m: Record<string, string>): void {
  try {
    localStorage.setItem(MIRROR_MAP_KEY, JSON.stringify(m))
  } catch {
    // localStorage unavailable — the mirror still works for this session, it
    // just won't be reused after a reload. Not worth failing the open over.
  }
}

// Add the mirror node to the node store if absent, so the Canvas can find it by
// id. Archived, so the sidebar (which filters archived) never shows it.
function injectMirrorNode(node: FbNode): void {
  const store = useNodeStore.getState()
  if (store.nodes.some((n) => n.id === node.id)) return
  useNodeStore.setState({ nodes: [...store.nodes, node] })
}

// Stop the Canvas from auto-creating its corner minimap on the mirror — it's a
// per-desk affordance, not part of the shared board.
function suppressMinimap(taskId: string): void {
  try {
    localStorage.setItem(`fb-minimap-dismissed:${taskId}`, '1')
  } catch {
    // best-effort only
  }
}

// Find or create the hidden mirror task for a live canvas. Returns its task id.
export async function ensureMirrorTask(liveCanvasId: string, title: string): Promise<string> {
  const map = readMap()
  const known = map[liveCanvasId]
  if (known) {
    const existing = await window.api.nodes.get(known)
    if (existing) {
      injectMirrorNode(existing)
      suppressMinimap(existing.id)
      return existing.id
    }
  }
  // Create via the low-level API (not the node store's create) to skip the
  // desk-limit gate and the undo recording — a mirror is infrastructure, not
  // user-authored work.
  const node = await window.api.nodes.create({
    parentId: null,
    kind: 'task',
    title: title || 'Live canvas'
  })
  await window.api.nodes.update(node.id, { archived: true })
  const archived: FbNode = { ...node, archived: true }
  injectMirrorNode(archived)
  suppressMinimap(node.id)
  map[liveCanvasId] = node.id
  writeMap(map)
  return node.id
}

// Promote a local desk (task) to a live canvas: serialize the board, create the
// server entity (docType 'canvas'), and return the new live id. Returns null on
// failure (no token / network), so the caller can surface an honest error.
export async function promoteToLiveCanvas(task: FbNode, token: string): Promise<string | null> {
  const body = await serializeCanvasBody(task)
  const created = await createLiveDoc(token, {
    docType: 'canvas',
    title: task.title || 'Live canvas',
    body
  })
  return created?.id ?? null
}
