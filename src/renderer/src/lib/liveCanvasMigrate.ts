// WS01 lock-retire, stage C — convert a legacy LIVE CANVAS into a real shared desk.
//
// A live canvas used to be a server-canonical CanvasBody (widgets + wires) behind
// the check-out lock, rendered through a hidden mirror task. The canvas mechanism is
// being retired in favour of shared desks (lock-free, per-object, wires included on
// the substrate), so an existing live canvas is converted the first time it is
// opened: its board is materialised into a fresh real desk, and if the opener owns
// the canvas the new desk is shared with the canvas's members so everyone converges
// on the substrate. Idempotent per device via a small localStorage map, so a second
// open navigates to the already-converted desk instead of duplicating it.
//
// Legacy multi-party caveat, stated honestly: the old live-canvas body carries no
// link back to any real desk, so a non-owner who opens the canvas before the owner
// has converted-and-shared gets their own private desk copy of the content rather
// than joining the owner's. These are abandoned snapshots of a lightly-used path;
// content is preserved for everyone and real collaboration henceforth is the shared
// desk. New canvases are never created this way (stage B rerouted creation).

import { getLiveDoc } from './docCollabClient'
import { coerceCanvasBody, applyCanvasBodyToTask } from './liveCanvas'
import { shareDeskLive } from './deskShareClient'
import { useNodeStore } from '../stores/nodes'

const MIGRATED_KEY = 'fb.livecanvas.migrated'

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MIGRATED_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}
function writeMap(m: Record<string, string>): void {
  try {
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(m))
  } catch {
    // best-effort — a lost map just means a re-open re-converts (harmless duplicate)
  }
}

export async function convertLiveCanvasToDesk(
  liveCanvasId: string,
  token: string,
  myAccountId: string | null
): Promise<string | null> {
  // Already converted on this device — reuse the desk if it still exists.
  const map = readMap()
  const known = map[liveCanvasId]
  if (known) {
    const existing = await window.api.nodes.get(known)
    if (existing) return existing.id
  }

  const full = await getLiveDoc(token, liveCanvasId)
  if (!full) return null
  let body: unknown = null
  try {
    body = full.body ? JSON.parse(full.body) : null
  } catch {
    body = null
  }
  const canvas = coerceCanvasBody(body)

  // A fresh real desk owned by the opener, then materialise the board into it.
  const node = await window.api.nodes.create({ parentId: null, kind: 'task', title: full.title || 'Shared desk' })
  if (canvas) await applyCanvasBodyToTask(node.id, canvas)
  const st = useNodeStore.getState()
  if (!st.nodes.some((n) => n.id === node.id)) useNodeStore.setState({ nodes: [...st.nodes, node] })

  // If the opener owns the canvas, share the new desk with its other members so they
  // converge on the substrate (shareDeskLive also seeds the wires via seedDeskLinks).
  if (myAccountId && full.ownerAccountId === myAccountId) {
    const invites = (full.members ?? [])
      .filter((m) => m.accountId && m.accountId !== myAccountId)
      .map((m) => ({ accountId: m.accountId, permission: 'edit' as const }))
    if (invites.length) await shareDeskLive(node.id, invites, 'edit')
  }

  map[liveCanvasId] = node.id
  writeMap(map)
  return node.id
}
