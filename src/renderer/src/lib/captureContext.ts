import type { FbNode } from '@shared/types'

// V2 (DEC-023): capture-from-desk parenting. When the capture console opens
// while a DESK view is on screen, the filed item is parented to that desk —
// it still lives on the Attention page (desk surfaces stay blind to work
// items by construction), but it carries its origin: the By-origin lens
// groups it, and trashing the desk later detaches-and-revives it visibly.
//
// Deliberately conservative: only a real, live, PERSONAL desk view counts.
// Shared desks are excluded — §2.6 keeps work items personal at P0, so a
// capture over a shared desk files standalone rather than stamping a
// personal item into a shared subtree.

export function deskCaptureContext(
  view: { kind: string; taskId?: string },
  nodes: FbNode[]
): { id: string; title: string } | null {
  if (view.kind !== 'task') return null
  const taskId = (view as { taskId?: string }).taskId
  if (!taskId) return null
  const n = nodes.find((x) => x.id === taskId)
  if (!n || n.kind !== 'task' || n.archived || n.sharedRootId) return null
  return { id: n.id, title: n.title || 'Untitled desk' }
}
