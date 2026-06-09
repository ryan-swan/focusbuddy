import type { WidgetDraft } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'

// Reconstruct an accepted share snapshot into real nodes + widgets in the
// recipient's workspace. This is the missing half of the share feature: the
// snapshot is captured at share-time (see lib/shareSnapshot.ts) and stored in
// the inbox, and THIS turns it back into folders/tasks/widgets the recipient
// owns. The reconstructed root carries `sharedFromHandle` so the sidebar can
// badge it as "Shared by <handle>".
//
// The snapshot shapes mirror lib/shareSnapshot.ts (the wire contract). We keep
// a local structural copy so the renderer doesn't depend on main-only types,
// and read defensively — a snapshot minted by an older/newer app build may be
// missing fields.

interface SerWidget {
  kind: string
  title?: string
  content?: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string | null
}
interface SerNode {
  kind: 'folder' | 'task'
  title?: string
  description?: string
  dueDate?: number | null
  estimateMinutes?: number | null
}
interface SerTask extends SerNode {
  kind: 'task'
  widgets?: SerWidget[]
}
export interface FolderSnap {
  kind: 'folder'
  fromHandle?: string
  folder: SerNode
  tasks?: SerTask[]
}
export interface TaskSnap {
  kind: 'task'
  fromHandle?: string
  task: SerTask
}
export interface WidgetSnap {
  kind: 'widget'
  fromHandle?: string
  widget: SerWidget
}
export type ShareSnap = FolderSnap | TaskSnap | WidgetSnap

export const SHARED_FOLDER_TITLE = 'Shared with me'

// Find (or create once) the dedicated top-level "Shared with me" folder.
// Accepted shares nest under it so they (a) don't burn a free-plan desk slot
// and (b) live together, matching "land in shared folders".
async function ensureSharedFolder(): Promise<string> {
  const store = useNodeStore.getState()
  const existing = store.nodes.find(
    (n) => n.parentId === null && n.kind === 'folder' && n.title === SHARED_FOLDER_TITLE
  )
  if (existing) return existing.id
  const created = await store.create({
    parentId: null,
    kind: 'folder',
    title: SHARED_FOLDER_TITLE
  })
  return created.id
}

async function createWidgetsFor(taskId: string, widgets: SerWidget[] | undefined): Promise<void> {
  if (!widgets || widgets.length === 0) return
  const create = useWidgetStore.getState().create
  for (const w of widgets) {
    await create({
      taskId,
      kind: w.kind as WidgetDraft['kind'],
      title: w.title ?? '',
      content: w.content ?? '',
      x: typeof w.x === 'number' ? w.x : 80,
      y: typeof w.y === 'number' ? w.y : 80,
      width: typeof w.width === 'number' ? w.width : 280,
      height: typeof w.height === 'number' ? w.height : 200,
      color: w.color ?? null
    })
  }
}

// Reconstruct the snapshot. Returns the root node id + kind so the caller can
// navigate to it. `opts.parentFolderId` lets the recipient drop the share into
// an existing folder instead of the default "Shared with me".
export async function acceptShareIntoWorkspace(
  snapshot: ShareSnap,
  opts?: { parentFolderId?: string | null }
): Promise<{ rootNodeId: string; rootKind: 'folder' | 'task' }> {
  const createNode = useNodeStore.getState().create
  const handle = (snapshot.fromHandle || 'someone').trim() || 'someone'
  const parentId =
    opts && opts.parentFolderId !== undefined && opts.parentFolderId !== null
      ? opts.parentFolderId
      : await ensureSharedFolder()

  if (snapshot.kind === 'folder') {
    const folder = await createNode({
      parentId,
      kind: 'folder',
      title: snapshot.folder.title || 'Shared folder',
      description: snapshot.folder.description || '',
      sharedFromHandle: handle
    })
    for (const t of snapshot.tasks ?? []) {
      const task = await createNode({
        parentId: folder.id,
        kind: 'task',
        title: t.title || 'Shared task',
        description: t.description || '',
        dueDate: t.dueDate ?? null,
        estimateMinutes: t.estimateMinutes ?? null,
        sharedFromHandle: handle
      })
      await createWidgetsFor(task.id, t.widgets)
    }
    return { rootNodeId: folder.id, rootKind: 'folder' }
  }

  if (snapshot.kind === 'task') {
    const task = await createNode({
      parentId,
      kind: 'task',
      title: snapshot.task.title || 'Shared task',
      description: snapshot.task.description || '',
      dueDate: snapshot.task.dueDate ?? null,
      estimateMinutes: snapshot.task.estimateMinutes ?? null,
      sharedFromHandle: handle
    })
    await createWidgetsFor(task.id, snapshot.task.widgets)
    return { rootNodeId: task.id, rootKind: 'task' }
  }

  // widget: wrap it in a task so it has a desk to live on.
  const task = await createNode({
    parentId,
    kind: 'task',
    title: snapshot.widget.title || `Shared ${snapshot.widget.kind}`,
    sharedFromHandle: handle
  })
  await createWidgetsFor(task.id, [snapshot.widget])
  return { rootNodeId: task.id, rootKind: 'task' }
}
