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

// Turn the approved item texts into a block of content in the widget's format.
export function formatSetupItems(applyAs: WidgetSetupApplyAs, items: string[]): string {
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

// Append the approved items to the widget, preserving whatever is already there.
export async function applyWidgetSetup(
  widgetId: string,
  applyAs: WidgetSetupApplyAs,
  items: string[]
): Promise<void> {
  const store = useWidgetStore.getState()
  const w = store.widgets.find((x) => x.id === widgetId)
  if (!w) return
  const block = formatSetupItems(applyAs, items)
  if (!block) return
  const existing = (w.content || '').replace(/\s+$/, '')
  const next = existing ? `${existing}\n${block}` : block
  await store.update(widgetId, { content: next })
}
