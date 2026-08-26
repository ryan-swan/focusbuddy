import type { FbNode } from '@shared/types'
import type { CtxMenuItem } from '../components/CanvasContextMenu'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { confirmDeleteDesk, leaveSharedDesk } from './deleteDeskFlow'

// ONE lifecycle menu definition for every desk/room card surface (L1/S6):
// DeskGallery, the Stage Manager strip, and the canvas breadcrumb all build
// their context menus here, so the actions can never drift from the index
// pages' set.
//
// DEC-021: delete goes through the D2 choice dialog (preserve-in-memory
// default / permanent purge). Shared desks (D1) never see it — they get
// Archive-for-me (scope-local: the archived flag is stripped from shared
// sync in both directions) and, for received shares, Leave share; the delete
// entry renders disabled with the reason.

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
    // D1 (DEC-021): no unilateral trash of a shared desk in v1.
    items.push({
      label: node.archived ? 'Unarchive for me' : 'Archive for me',
      icon: node.archived ? 'unarchive' : 'archive',
      onClick: () => {
        void useNodeStore.getState().update(node.id, { archived: !node.archived })
      }
    })
    if (node.sharedFromHandle) {
      // A received share: leaving is this account's own right.
      items.push({
        label: 'Leave share',
        icon: 'logout',
        onClick: () => {
          void leaveSharedDesk(node)
        }
      })
    }
    items.push({
      label: node.sharedFromHandle
        ? `Shared by @${node.sharedFromHandle} — leave or archive instead`
        : 'Shared — unshare it before deleting',
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
    label: 'Delete…',
    icon: 'delete',
    onClick: () => {
      void confirmDeleteDesk(node)
    }
  })
  return items
}
