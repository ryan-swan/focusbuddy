import type { FbNode } from '@shared/types'
import { startPromptForItem, startPromptForMany } from './startPrompt'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { useAssistantChrome } from '../stores/assistantChrome'

// DEC-128 — "Start it with Plexii", extracted from the Attention page so the
// widget rows (home, desk, the assistant's Attention tab) offer the same door
// with the same behaviour. When the work belongs to a desk we go there first,
// so the assistant has that desk's context in its prompt rather than
// answering in the abstract; the prompt is staged into the panel's composer
// twice — the panel may still be mounting (the capture console's own
// belt-and-braces). Returns false when there was nothing to start.
export function startWithPlexii(list: FbNode[], nodes: readonly FbNode[]): boolean {
  if (list.length === 0) return false
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const prompt =
    list.length === 1 ? startPromptForItem(list[0], nodesById) : startPromptForMany(list, nodesById)
  if (!prompt) return false
  const deskId = list.length === 1 ? list[0].parentId : null
  if (deskId && nodes.some((n) => n.id === deskId && n.kind === 'task')) {
    useNodeStore.getState().setActive(deskId)
    useViewStore.getState().goTask(deskId)
  }
  const chrome = useAssistantChrome.getState()
  chrome.setTab('chat')
  chrome.openPanel()
  const stage = (): void => {
    window.dispatchEvent(new CustomEvent('fb:composer-stage', { detail: prompt }))
  }
  stage()
  setTimeout(stage, 400)
  return true
}
