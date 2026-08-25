import type { FbNode } from '@shared/types'
import type { CtxMenuItem } from '../components/CanvasContextMenu'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'

// ONE lifecycle menu definition for every desk/room card surface (L1/S6):
// DeskGallery, the Stage Manager strip, and the canvas breadcrumb all build
// their context menus here, so the actions can never drift from the index
// pages' set. Trash rides the standard store.remove flow (undo toast);
// shared desks hold both actions until the sharing rules land (D1).

export function deskLifecycleMenuItems(node: FbNode, opts?: { includeOpen?: boolean }): CtxMenuItem[] {
  const items: CtxMenuItem[] = []
  if (opts?.includeOpen !== false) {
    items.push({
      label: node.kind === 'folder' ? 'Open room' : 'Open desk',
      icon: 'chevron_right',
      onClick: () => {
        const view = useViewStore.getState()
        useNodeStore.getState().setActive(node.id)
        if (node.kind === 'folder') view.goProject(node.id)
        else view.goTask(node.id)
      }
    })
    items.push({ separator: true })
  }
  if (node.sharedRootId) {
    items.push({
      label: 'Shared — lifecycle options arrive with sharing rules',
      icon: 'group',
      disabled: true
    })
    return items
  }
  items.push({
    label: node.archived
      ? node.kind === 'folder'
        ? 'Unarchive room'
        : 'Unarchive desk'
      : node.kind === 'folder'
        ? 'Archive room'
        : 'Archive desk',
    icon: node.archived ? 'unarchive' : 'archive',
    onClick: () => {
      void useNodeStore.getState().update(node.id, { archived: !node.archived })
    }
  })
  items.push({
    label: 'Move to Trash',
    icon: 'delete',
    onClick: () => {
      void useNodeStore.getState().remove(node.id)
    }
  })
  return items
}
