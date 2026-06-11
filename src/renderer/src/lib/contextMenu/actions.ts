// Concrete handlers the universal providers bind to. Each is a thin wrapper
// over primitives that already exist: createConnectedTool for spawn-and-link,
// the widget store for create/update/remove/archive/bringToFront, the catalog
// for defaults, and the AI Assist preview store for the inline transform flow.
// Keeping them here means the providers stay declarative and the store calls
// live in one auditable place.

import type { WidgetKind } from '@shared/types'
import { useWidgetStore } from '../../stores/widgets'
import { useAiAssistPreview } from '../../stores/aiAssistPreview'
import { catalogFor } from '../widgetCatalog'
import { createConnectedTool } from '../createConnectedTool'
import type { MenuContext } from './types'

// The text a context can offer for seeding or AI work: the selection if there
// is one, otherwise the source widget's own content when it is a text widget.
const TEXT_KINDS: WidgetKind[] = ['sticky', 'note', 'markdown', 'page', 'card', 'living-doc']

export function isTextKind(kind: WidgetKind): boolean {
  return TEXT_KINDS.includes(kind)
}

export function sourceWidget(ctx: MenuContext) {
  if (ctx.object.type === 'widget') return ctx.object.widget
  return null
}

// The text AI Assist or a seed should operate on, and whether it is the whole
// widget content (versus a sub-selection).
export function workingText(ctx: MenuContext): { text: string; whole: boolean } {
  if (ctx.selection?.text && ctx.selection.text.trim()) {
    return { text: ctx.selection.text, whole: false }
  }
  const w = sourceWidget(ctx)
  if (w && isTextKind(w.kind)) return { text: w.content || '', whole: true }
  return { text: '', whole: true }
}

export function hasWorkableText(ctx: MenuContext): boolean {
  return workingText(ctx).text.trim().length > 0
}

// ── Create / Convert ─────────────────────────────────────────────────────────

// Spawn a new widget. From a widget or a selection it spawns connected and
// seeded; from empty canvas it drops at the click point.
export async function createWidget(ctx: MenuContext, kind: WidgetKind, seedText?: string): Promise<void> {
  const entry = catalogFor(kind)
  const src = sourceWidget(ctx)
  if (src) {
    await createConnectedTool({
      sourceWidgetId: src.id,
      kind,
      content: seedText && isTextKind(kind) ? seedText.slice(0, 2000) : undefined
    })
    return
  }
  // Empty canvas (or multi): drop at the click point.
  if (!ctx.taskId) return
  const w = entry?.defaultWidth ?? 280
  const h = entry?.defaultHeight ?? 200
  await useWidgetStore.getState().create({
    taskId: ctx.taskId,
    kind,
    title: entry?.label ?? '',
    content: seedText && isTextKind(kind) ? seedText.slice(0, 2000) : entry?.defaultContent ?? '',
    x: Math.round(ctx.canvasPoint.x - w / 2),
    y: Math.round(ctx.canvasPoint.y - 20),
    width: w,
    height: h,
    color: kind === 'sticky' ? '#fef08a' : null
  })
}

// Convert is the same spawn-and-link, but seeded from the whole source content
// rather than just a sub-selection, because a conversion reinterprets the whole
// object. On a text selection Create and Convert collapse to the same operation,
// which is why the resolver merges them into one "Turn into" submenu there.
export async function convertWidget(ctx: MenuContext, kind: WidgetKind): Promise<void> {
  const { text } = workingText(ctx)
  await createWidget(ctx, kind, text)
}

// ── Organise ─────────────────────────────────────────────────────────────────

export async function bringToFront(ctx: MenuContext): Promise<void> {
  const store = useWidgetStore.getState()
  if (ctx.object.type === 'multi') {
    for (const w of ctx.object.widgets) await store.bringToFront(w.id)
    return
  }
  const w = sourceWidget(ctx)
  if (w) await store.bringToFront(w.id)
}

export async function ejectFromSection(ctx: MenuContext): Promise<void> {
  const w = sourceWidget(ctx)
  if (w) await useWidgetStore.getState().update(w.id, { parentSectionId: null })
}

// ── Share ────────────────────────────────────────────────────────────────────

export async function copyText(ctx: MenuContext): Promise<void> {
  let toCopy = ''
  if (ctx.object.type === 'multi') {
    toCopy = ctx.object.widgets
      .filter((w) => isTextKind(w.kind) && w.content.trim())
      .map((w) => w.content)
      .join('\n\n')
  } else {
    const { text } = workingText(ctx)
    toCopy = text || sourceWidget(ctx)?.content || ''
  }
  if (!toCopy) return
  try {
    await navigator.clipboard.writeText(toCopy)
  } catch {
    // Clipboard can be blocked; fail quietly rather than break the menu.
  }
}

// ── Advanced ─────────────────────────────────────────────────────────────────

export async function duplicateWidget(ctx: MenuContext): Promise<void> {
  const w = sourceWidget(ctx)
  if (!w) return
  await useWidgetStore.getState().create({
    taskId: w.taskId,
    kind: w.kind,
    title: w.title,
    content: w.content,
    x: w.x + 28,
    y: w.y + 28,
    width: w.width,
    height: w.height,
    color: w.color
  })
}

// ── Destructive ──────────────────────────────────────────────────────────────

export async function archiveWidget(ctx: MenuContext): Promise<void> {
  const w = sourceWidget(ctx)
  if (w) await useWidgetStore.getState().archive(w.id)
}

export async function deleteWidget(ctx: MenuContext): Promise<void> {
  const store = useWidgetStore.getState()
  if (ctx.object.type === 'multi') {
    for (const w of ctx.object.widgets) await store.remove(w.id)
    store.clearSelection()
    return
  }
  const w = sourceWidget(ctx)
  if (w) await store.remove(w.id)
}

// ── AI Assist ────────────────────────────────────────────────────────────────

// Open the preview for an AI Assist action. The preview component runs the IPC
// and applies the result; this only stages the request.
export function runAiAssist(
  ctx: MenuContext,
  label: string,
  instruction: string,
  awaitInput = false
): void {
  const w = sourceWidget(ctx)
  if (!w) return
  const { text, whole } = workingText(ctx)
  if (!text.trim()) return
  useAiAssistPreview.getState().start({
    label,
    instruction,
    sourceWidgetId: w.id,
    sourceKind: w.kind,
    text,
    wholeContent: whole,
    awaitInput
  })
}
