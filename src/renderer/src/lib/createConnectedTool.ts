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

import type { WidgetKind, WireType } from '@shared/types'
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
  /**
   * Wire type for the auto-created source → new-tool link. Defaults to the
   * passive 'context' so a spawn never triggers autonomous behaviour on its
   * own. The "Automate with an agent" entry leaves this at 'context' because
   * an agent consumes every widget wired INTO it regardless of wire type.
   */
  wireType?: WireType
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
    await linksStore.create(input.sourceWidgetId, created.id, taskId, input.wireType)
    return { ok: true, newWidgetId: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Spawn failed.' }
  }
}

interface AgentFromSourcesResult {
  ok: boolean
  newWidgetId?: string
  linkedCount?: number
  error?: string
}

/**
 * Bulk "Automate with an agent": spawn ONE agent tool and wire every given
 * source widget INTO it, so the agent runs its instruction over all of them.
 * This is the multi-select counterpart to the single-widget create-and-connect
 * agent entry — it removes the "arm the hub button N times" friction called out
 * by widget-link-owner.
 *
 * Placement is to the right of the selection's bounding box, vertically centred
 * on it. Section inheritance only happens when every source shares one section
 * (otherwise the agent is a free top-level tool, since it belongs to no single
 * section). All spawns go through the widget store; all wires are passive
 * 'context' (an agent consumes every widget wired into it regardless of type).
 */
export async function createAgentFromSources(
  sourceWidgetIds: string[]
): Promise<AgentFromSourcesResult> {
  const store = useWidgetStore.getState()
  const linksStore = useLinksStore.getState()
  const sources = sourceWidgetIds
    .map((id) => store.widgets.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w))
  if (sources.length === 0) return { ok: false, error: 'No source tools found.' }
  const taskId = sources[0].taskId
  if (!taskId) return { ok: false, error: 'Source tools have no active task.' }

  const entry = catalogFor('agent')
  const w = entry?.defaultWidth ?? 320
  const h = entry?.defaultHeight ?? 300

  // Bounding box of the selection → place the agent just past its right edge,
  // vertically centred so the fan-in wires read as converging on it.
  const right = Math.max(...sources.map((s) => s.x + s.width))
  const top = Math.min(...sources.map((s) => s.y))
  const bottom = Math.max(...sources.map((s) => s.y + s.height))
  const x = Math.round(right + ADJACENT_GAP)
  const y = Math.round((top + bottom) / 2 - h / 2)

  // Inherit a section only when the whole selection lives in the same one.
  const sectionIds = new Set(sources.map((s) => s.parentSectionId ?? null))
  const sharedSection = sectionIds.size === 1 ? (sources[0].parentSectionId ?? null) : null

  try {
    const created = await store.create({
      taskId,
      kind: 'agent',
      title: entry?.label ?? 'Agent',
      content: entry?.defaultContent ?? '',
      x,
      y,
      width: w,
      height: h
    })
    if (!created?.id) return { ok: false, error: 'Agent create returned no id.' }
    if (sharedSection) {
      await store.update(created.id, { parentSectionId: sharedSection })
    }
    let linkedCount = 0
    for (const s of sources) {
      const link = await linksStore.create(s.id, created.id, taskId)
      if (link) linkedCount++
    }
    return { ok: true, newWidgetId: created.id, linkedCount }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Agent spawn failed.' }
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
  // Automate is listed first because it's the entry that turns a connection
  // into action — the whole point of the wire overhaul. It spawns an agent
  // tool wired to read this widget; the user then types what it should do.
  { label: 'Automate with an agent', icon: 'smart_toy', kind: 'agent' },
  { label: 'Send to a URL',  icon: 'webhook',       kind: 'webhook' },
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
