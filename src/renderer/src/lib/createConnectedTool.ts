// Shared "spawn a new tool and auto-link it to the source" helper.
//
// Used by the right-click context menu on every content surface (Sticky,
// Note, Markdown, Page, Table cell, Field). The flow:
//   1. Compute a position next to the source tool (no overlap).
//   2. Create the new tool via the widget store (which assigns an id).
//   3. Create a persisted widget_link from source → new tool.
//   4. Return the new tool's id so the caller can focus it / scroll into view.
//
// IMPORTANT (per tool-spawn-owner invariants):
// - All spawns go through useWidgetStore.create() (no direct IPC).
// - Defaults come from widgetCatalog (no hardcoded dimensions).
// - Newly-spawned tools inherit the source's parentSectionId IF the
//   source is in a section — keeps the visual association intact.
// - Newly-spawned tools are NEVER pinned by default.

import type { WidgetKind } from '@shared/types'
import { useWidgetStore } from '../stores/widgets'
import { useLinksStore } from '../stores/links'
import { catalogFor } from './widgetCatalog'

interface CreateConnectedInput {
  sourceWidgetId: string
  /** Tool kind to spawn — must exist in widgetCatalog. */
  kind: WidgetKind
  /** Optional seed content / title. */
  title?: string
  content?: string
  /** Optional override of the catalog's default size. */
  width?: number
  height?: number
}

interface CreateConnectedResult {
  ok: boolean
  newWidgetId?: string
  error?: string
}

const ADJACENT_GAP = 40 // px to the right of the source tool

export async function createConnectedTool(
  input: CreateConnectedInput
): Promise<CreateConnectedResult> {
  const store = useWidgetStore.getState()
  const linksStore = useLinksStore.getState()
  const source = store.widgets.find((w) => w.id === input.sourceWidgetId)
  if (!source) return { ok: false, error: 'Source tool not found.' }
  // Same task as the source.
  const taskId = source.taskId
  if (!taskId) return { ok: false, error: 'Source tool has no active task.' }

  const entry = catalogFor(input.kind)
  const w = input.width ?? entry?.defaultWidth ?? 280
  const h = input.height ?? entry?.defaultHeight ?? 200

  // Position: to the right of the source, vertically aligned to the
  // source's top edge. The store will dedupe overlaps via its own
  // placement logic on free-layout siblings.
  const x = Math.round(source.x + source.width + ADJACENT_GAP)
  const y = Math.round(source.y)

  try {
    const created = await store.create({
      taskId,
      kind: input.kind,
      title: input.title ?? entry?.label ?? '',
      content: input.content ?? entry?.defaultContent ?? '',
      x,
      y,
      width: w,
      height: h,
      color: source.color
    })
    if (!created?.id) return { ok: false, error: 'Tool create returned no id.' }
    // Section inheritance is a second step because `parentSectionId`
    // isn't on `WidgetDraft` — it's a mutable field set via `update`.
    // When the source lives in a section, point the new tool at the
    // same parent so they stay visually grouped.
    if (source.parentSectionId) {
      await store.update(created.id, { parentSectionId: source.parentSectionId })
    }
    await linksStore.create(input.sourceWidgetId, created.id, taskId)
    return { ok: true, newWidgetId: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Spawn failed.' }
  }
}

/**
 * The list of tool kinds the right-click "Create + connect" menu offers.
 * Centralised so adding a kind to one surface adds it to all of them.
 * Image / email / task-link / color-picker are listed even if they map
 * to existing kinds with seed content — the user thinks of them as
 * separate offerings.
 */
export interface CreateMenuEntry {
  label: string
  icon: string
  kind: WidgetKind
  seedTitle?: string
  seedContent?: string
}

export const CREATE_AND_CONNECT_MENU: CreateMenuEntry[] = [
  { label: 'Sticky',         icon: 'sticky_note_2', kind: 'sticky' },
  { label: 'Note',           icon: 'description',   kind: 'note' },
  { label: 'Markdown',       icon: 'subject',       kind: 'markdown' },
  { label: 'Page',           icon: 'article',       kind: 'page' },
  { label: 'File',           icon: 'attach_file',   kind: 'file' },
  { label: 'Field',          icon: 'input',         kind: 'field' },
  { label: 'Table',          icon: 'table_chart',   kind: 'table' },
  { label: 'Color',          icon: 'palette',       kind: 'color' },
  { label: 'Email',          icon: 'mail',          kind: 'email',  seedContent: 'https://mail.google.com' },
  { label: 'Task link',      icon: 'task_alt',      kind: 'task-link' }
]
