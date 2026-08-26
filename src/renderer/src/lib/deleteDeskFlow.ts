import type { FbNode } from '@shared/types'
import { promptText, confirmDialog } from '../components/plexi/PromptDialog'
import { useNodeStore } from '../stores/nodes'
import { useWorkItemStore } from '../stores/workItems'
import { useAccountStore } from '../stores/account'
import { revokeDeskAccess } from './deskShareClient'

// DEC-021 — the delete flows behind the lifecycle menu (TRACK-LIFECYCLE L2).
//
// D2: deleting a personal desk/room goes through ONE choice dialog. "Move to
// Trash" (the default) is exactly today's behavior — 7-day window, undo
// toast, memory untouched — finally stated in copy. "Delete everything
// permanently" purges the subtree's memory (facts, chunk derivations, review
// points) and hard-deletes immediately, behind a typed-name confirmation.
// Attention items are preserved on BOTH paths (R008: no work_item
// hard-delete) — trash sweeps them restorably, purge detaches them back to
// the Attention page — and the dialog says so.
//
// D1: shared desks never reach this dialog — the menu offers Archive-for-me
// and Leave-share instead (leaveSharedDesk below), with the trash action
// disabled and the reason shown.

export async function confirmDeleteDesk(node: FbNode): Promise<void> {
  const noun = node.kind === 'folder' ? 'room' : 'desk'
  const title = node.title || `Untitled ${noun}`
  const choice = await promptText({
    title: `Delete “${title}”?`,
    label: 'Attention items on it are preserved either way — they move to your Attention page.',
    choices: [
      {
        value: 'preserve',
        label: 'Move to Trash',
        hint: `The ${noun} is gone; what Plexii learned from it stays. Restorable for 7 days.`
      },
      {
        value: 'purge',
        label: 'Delete everything permanently',
        hint: 'Also erases its memory and document derivations. No trash window, no undo.'
      }
    ]
  })
  if (choice === 'preserve') {
    await useNodeStore.getState().remove(node.id)
    return
  }
  if (choice !== 'purge') return

  const expected = (node.title || '').trim()
  const typed = await promptText({
    title: `Type the ${noun}'s name to confirm`,
    label: `“${title}” and everything Plexii learned from it are erased immediately. This cannot be undone.`,
    placeholder: expected || `Untitled ${noun}`,
    confirmLabel: 'Delete permanently',
    danger: true,
    selectAll: false
  })
  if (typed == null) return
  if (expected && typed.trim().toLowerCase() !== expected.toLowerCase()) {
    await confirmDialog({
      title: 'Name did not match',
      body: `Nothing was deleted. Type “${expected}” exactly to confirm a permanent delete.`,
      confirmLabel: 'OK'
    })
    return
  }

  const result = await window.api.nodes.deletePermanent(node.id)
  // The subtree is gone and any attention items it held are back on the
  // Attention page — refresh both stores so every surface agrees.
  await useNodeStore.getState().refresh()
  await useWorkItemStore.getState().refresh()
  window.dispatchEvent(new CustomEvent('fb:workitems-changed'))
  if (result.revived > 0) {
    await confirmDialog({
      title: `“${title}” deleted permanently`,
      body: `${result.revived} attention item${result.revived === 1 ? ' was' : 's were'} preserved and moved to your Attention page.`,
      confirmLabel: 'OK'
    })
  }
}

/** D1's "Leave share" — the recipient side: give up this account's access,
 *  then prune the local materialization (detach-and-revive included). If the
 *  server declines the self-revocation, nothing local is touched. */
export async function leaveSharedDesk(node: FbNode): Promise<void> {
  const rootId = node.sharedRootId
  const accountId = useAccountStore.getState().account?.id
  if (!rootId || !accountId) return
  const ok = await confirmDialog({
    title: `Leave “${node.title || 'this desk'}”?`,
    body: 'It disappears from your workspace; the other participants keep it. Any attention items of yours on it move to your Attention page.',
    confirmLabel: 'Leave share',
    danger: true
  })
  if (!ok) return
  // revokeDeskAccess resolves null on ANY failure (offline, declined) —
  // leave nothing local half-removed in that case.
  const revoked = await revokeDeskAccess(rootId, accountId)
  if (!revoked) {
    await confirmDialog({
      title: 'Could not leave the share',
      body: 'The server declined or was unreachable — nothing changed. Ask the owner to remove you if it persists.',
      confirmLabel: 'OK'
    })
    return
  }
  await window.api.workspaceSync.pruneSharedDesk(rootId)
  await useNodeStore.getState().refresh()
  await useWorkItemStore.getState().refresh()
}
