// Applies an approved AI setup draft to a widget in that widget's own format.
// The draft is a flat list of item strings; how they become content depends on
// the widget kind, which the main process named via applyAs. A sticky gets
// checklist lines, a note gets note lines, markdown and a card get bullets.
// Kept pure (formatSetupItems) so the formatting is unit-testable.

import { useWidgetStore } from '../stores/widgets'

export type WidgetSetupApplyAs =
  | 'sticky-checklist'
  | 'note-lines'
  | 'markdown-bullets'
  | 'card-bullets'
  | 'mindmap-nodes'

// Text-format kinds whose items are appended to the widget's text content.
type TextApplyAs = Exclude<WidgetSetupApplyAs, 'mindmap-nodes'>

// Turn the approved item texts into a block of content in a text widget's
// format. Mindmap is handled separately because its content is JSON.
export function formatSetupItems(applyAs: TextApplyAs, items: string[]): string {
  const clean = items.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  switch (applyAs) {
    case 'sticky-checklist':
      // Matches the sticky's own checklist syntax so the boxes are tickable.
      // Strip any leading checkbox or bullet the model already added.
      return clean.map((t) => `[ ] ${t.replace(/^(\[\s?\]\s*|[-*]\s+)/, '')}`).join('\n')
    case 'note-lines':
    case 'markdown-bullets':
    case 'card-bullets':
      return clean.map((t) => `- ${t.replace(/^[-*]\s+/, '')}`).join('\n')
  }
}

// Append the approved labels to a mind map's JSON as new children of the root,
// preserving the rest of the persisted state. Defends against an empty or
// malformed content by starting from a minimal valid tree.
export function applyMindmapNodes(content: string, labels: string[]): string {
  interface Node {
    id: string
    label: string
    kind: string
    children: Node[]
    attachedWidgetIds: string[]
    assignedAgentSlugs: string[]
    pendingChildren: Node[]
  }
  let state: { root?: Node; [k: string]: unknown } | null = null
  try {
    state = JSON.parse(content)
  } catch {
    state = null
  }
  if (!state || typeof state !== 'object' || !state.root) {
    state = {
      root: {
        id: 'root',
        label: 'New idea',
        kind: 'idea',
        children: [],
        attachedWidgetIds: [],
        assignedAgentSlugs: [],
        pendingChildren: []
      },
      selectedId: 'root',
      viewRootId: 'root',
      agentSuggestions: {},
      agentConversations: {},
      agentStats: {}
    }
  }
  const root = state.root as Node
  const newChildren: Node[] = labels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => ({
      id: makeNodeId(),
      label,
      kind: 'idea',
      children: [],
      attachedWidgetIds: [],
      assignedAgentSlugs: [],
      pendingChildren: []
    }))
  root.children = [...(root.children ?? []), ...newChildren]
  return JSON.stringify(state)
}

function makeNodeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `n-${Math.random().toString(36).slice(2)}`
}

// Append the approved items to the widget, preserving whatever is already there.
export async function applyWidgetSetup(
  widgetId: string,
  applyAs: WidgetSetupApplyAs,
  items: string[]
): Promise<void> {
  const store = useWidgetStore.getState()
  const w = store.widgets.find((x) => x.id === widgetId)
  if (!w) return
  if (applyAs === 'mindmap-nodes') {
    const nextJson = applyMindmapNodes(w.content || '', items)
    await store.update(widgetId, { content: nextJson })
    return
  }
  const block = formatSetupItems(applyAs, items)
  if (!block) return
  const existing = (w.content || '').replace(/\s+$/, '')
  const next = existing ? `${existing}\n${block}` : block
  await store.update(widgetId, { content: next })
}
