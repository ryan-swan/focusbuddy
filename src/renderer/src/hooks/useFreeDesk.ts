import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { chimeIn } from '../lib/audioBeep'

/**
 * Shared hook for creating and managing "Free Desks" — standalone task nodes
 * with no parent.
 *
 * createFreeDesk: creates immediately with title "Untitled" and navigates to it.
 * assignToRoom: patches a free desk's parentId to the given room id.
 * createRoomAndAssign: creates a new top-level folder (room), then assigns the
 *   desk into it.
 */
export function useFreeDesk(): {
  createFreeDesk: () => Promise<void>
  assignToRoom: (deskId: string, roomId: string) => Promise<void>
  createRoomAndAssign: (deskId: string, roomTitle?: string) => Promise<void>
} {
  const create = useNodeStore((s) => s.create)
  const update = useNodeStore((s) => s.update)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)

  async function createFreeDesk(): Promise<void> {
    try {
      const created = await create({ parentId: null, kind: 'task', title: 'Untitled' })
      setActive(created.id)
      goTask(created.id)
      chimeIn()
    } catch {
      // create() handles user-facing feedback (e.g. desk limit upgrade prompt)
    }
  }

  async function assignToRoom(deskId: string, roomId: string): Promise<void> {
    await update(deskId, { parentId: roomId })
  }

  async function createRoomAndAssign(deskId: string, roomTitle = 'New Room'): Promise<void> {
    const room = await create({ parentId: null, kind: 'folder', title: roomTitle })
    await update(deskId, { parentId: room.id })
  }

  return { createFreeDesk, assignToRoom, createRoomAndAssign }
}
