import type { FbNode } from '@shared/types'
import type { CtxMenuItem } from '../components/CanvasContextMenu'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { leaveSharedDesk } from './deleteDeskFlow'

// ONE lifecycle menu definition for every desk/room card surface (L1/S6):
// DeskGallery, the Stage Manager strip, the canvas breadcrumb, AND (via
// lifecycleIndexActions below) the All Desks / All Rooms index pages all
// build their lifecycle actions here, so they can never drift.
//
// DEC-021 (reshaped by operator QA): "Move to Trash" is DIRECT — undoable,
// 7-day window, memory untouched (the contract is stated on the Trash page,
// where "Delete permanently" lives). Shared desks (D1) get Archive-for-me
// (scope-local: the archived flag is stripped from shared sync in both
// directions) and, for received shares, Leave share; trash renders disabled
// with the reason.

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
    label: 'Move to Trash',
    icon: 'delete',
    onClick: () => {
      void useNodeStore.getState().remove(node.id)
    }
  })
  return items
}

// The same lifecycle set in the index pages' action shape (hover strip +
// right-click). `disabled` rows are informational (the D1 reason).
export interface LifecycleIndexAction {
  key: string
  icon: string
  label: string
  inStrip?: boolean
  disabled?: boolean
  onClick: () => void
}

export function lifecycleIndexActions(node: FbNode): LifecycleIndexAction[] {
  const noun = node.kind === 'folder' ? 'room' : 'desk'
  if (node.sharedRootId) {
    const out: LifecycleIndexAction[] = [
      {
        key: 'archive',
        icon: node.archived ? 'unarchive' : 'archive',
        label: node.archived ? 'Unarchive for me' : 'Archive for me',
        inStrip: false,
        onClick: () => {
          void useNodeStore.getState().update(node.id, { archived: !node.archived })
        }
      }
    ]
    if (node.sharedFromHandle) {
      out.push({
        key: 'leave-share',
        icon: 'logout',
        label: 'Leave share',
        inStrip: false,
        onClick: () => {
          void leaveSharedDesk(node)
        }
      })
    }
    out.push({
      key: 'shared-note',
      icon: 'group',
      label: node.sharedFromHandle
        ? `Shared by @${node.sharedFromHandle} — leave or archive instead`
        : 'Shared — unshare it before deleting',
      inStrip: false,
      disabled: true,
      onClick: () => {}
    })
    return out
  }
  return [
    {
      key: 'archive',
      icon: node.archived ? 'unarchive' : 'archive',
      label: node.archived ? `Unarchive ${noun}` : `Archive ${noun}`,
      inStrip: false,
      onClick: () => {
        void useNodeStore.getState().update(node.id, { archived: !node.archived })
      }
    },
    {
      key: 'trash',
      icon: 'delete',
      label: 'Move to Trash',
      inStrip: false,
      onClick: () => {
        void useNodeStore.getState().remove(node.id)
      }
    }
  ]
}
