// Translates AI ActionProposal objects into concrete workspace mutations.
//
// Lives in the renderer because that's where the relevant stores are. The main
// process only PROPOSES via tool-use; everything written here is what runs
// after the user clicks Apply on a proposal card.
//
// Each handler returns { ok, message } so the chat UI can show a confirmation
// chip ("✓ Created Project tracker" / "✗ Couldn't open URL") inline.

import type { ActionProposal, WidgetKind } from '@shared/types'
import type { FieldDefinition, TableSchema } from '@shared/fields'
import { defaultConfig, defaultValue } from '@shared/fields'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useFocusSessionStore } from '../stores/focusSession'
import { useTablesStore } from '../stores/tables'
import { catalogFor } from './widgetCatalog'

// Palette for auto-assigning select option colors when the AI doesn't specify.
const SELECT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899'
]

export interface ApplyResult {
  ok: boolean
  message: string
}

/**
 * Apply a single proposal. The active task id is required for most actions —
 * widgets need a parent task, focus sessions are bound to one. If the user is
 * in a non-task view (Home dashboard etc.), proposals that need a task fail
 * gracefully with a helpful message rather than silently doing nothing.
 */
export async function applyProposal(
  proposal: ActionProposal,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  switch (proposal.kind) {
    case 'create-widget':
      return applyCreateWidget(proposal, ctx)
    case 'open-url':
      return applyOpenUrl(proposal, ctx)
    case 'create-todo-list':
      return applyCreateTodoList(proposal, ctx)
    case 'create-page':
      return applyCreatePage(proposal, ctx)
    case 'create-task':
      return applyCreateTask(proposal)
    case 'start-focus-session':
      return applyStartFocusSession(proposal, ctx)
    case 'delete-widget':
      return applyDeleteWidget(proposal)
    case 'update-widget':
      return applyUpdateWidget(proposal)
    case 'create-table':
      return applyCreateTable(proposal, ctx)
    case 'add-table-row':
      return applyAddTableRow(proposal)
    case 'create-field':
      return applyCreateField(proposal, ctx)
    default:
      // Exhaustive switch — TS yells if a new kind is added without a handler.
      return { ok: false, message: 'Unknown action kind.' }
  }
}

async function applyCreateWidget(
  p: Extract<ActionProposal, { kind: 'create-widget' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — widgets need a canvas.' }
  }
  const entry = catalogFor(p.widgetKind)
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: p.widgetKind as WidgetKind,
    title: p.title ?? '',
    content: p.content ?? entry?.defaultContent ?? '',
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: p.widgetKind === 'sticky' ? '#fef08a' : null
  })
  return {
    ok: true,
    message: `Added ${entry?.label ?? p.widgetKind}${p.title ? ` "${p.title}"` : ''}`
  }
}

async function applyOpenUrl(
  p: Extract<ActionProposal, { kind: 'open-url' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — the browser needs a canvas.' }
  }
  if (!/^https?:\/\//i.test(p.url)) {
    return { ok: false, message: 'Skipped — URL must start with https://' }
  }
  const entry = catalogFor('webview')
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: 'webview',
    title: p.title ?? '',
    content: p.url,
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  let host = p.url
  try {
    host = new URL(p.url).hostname.replace(/^www\./, '')
  } catch {
    // ignore
  }
  return { ok: true, message: `Opened ${host}` }
}

async function applyCreateTodoList(
  p: Extract<ActionProposal, { kind: 'create-todo-list' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — todos need a canvas.' }
  }
  // Render as a markdown widget with GFM task-list syntax. Each item on its
  // own line with the strict `- [ ] ` prefix tiptap-markdown recognises.
  const md =
    `# ${p.title}\n\n` + p.items.map((item) => `- [ ] ${item.trim()}`).join('\n')
  const entry = catalogFor('markdown')
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: 'markdown',
    title: p.title,
    content: md,
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  return { ok: true, message: `Added todo list "${p.title}" (${p.items.length} items)` }
}

async function applyCreatePage(
  p: Extract<ActionProposal, { kind: 'create-page' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — pages need a canvas.' }
  }
  const entry = catalogFor('page')
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: 'page',
    title: p.title,
    content: p.content, // already serialized Tiptap JSON
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  return { ok: true, message: `Added page "${p.title}"` }
}

async function applyCreateTask(
  p: Extract<ActionProposal, { kind: 'create-task' }>
): Promise<ApplyResult> {
  const node = await useNodeStore.getState().create({
    parentId: p.parentId ?? null,
    kind: 'task',
    title: p.title,
    description: p.notes ?? ''
  })
  if (!node) return { ok: false, message: 'Could not create task.' }
  return { ok: true, message: `Created task "${p.title}"` }
}

async function applyStartFocusSession(
  p: Extract<ActionProposal, { kind: 'start-focus-session' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return {
      ok: false,
      message: 'Open a task first — focus sessions are task-bound.'
    }
  }
  await useFocusSessionStore
    .getState()
    .start(ctx.activeTaskId, Math.max(60, p.minutes * 60), `${p.minutes}min`)
  return { ok: true, message: `Started ${p.minutes}-minute focus session` }
}

async function applyDeleteWidget(
  p: Extract<ActionProposal, { kind: 'delete-widget' }>
): Promise<ApplyResult> {
  await useWidgetStore.getState().remove(p.widgetId)
  return { ok: true, message: `Removed ${p.label}` }
}

async function applyUpdateWidget(
  p: Extract<ActionProposal, { kind: 'update-widget' }>
): Promise<ApplyResult> {
  const widgets = useWidgetStore.getState().widgets
  const target = widgets.find((w) => w.id === p.widgetId)
  if (!target) {
    return { ok: false, message: `No widget found with id ${p.widgetId.slice(0, 8)}…` }
  }
  const patch: { title?: string; content?: string } = {}
  if (p.title !== undefined) patch.title = p.title
  if (p.content !== undefined) patch.content = p.content
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Nothing to update — no title or content provided.' }
  }
  await useWidgetStore.getState().update(p.widgetId, patch)
  return { ok: true, message: `Updated ${p.label}` }
}

// Translate the AI's column shorthand (label/type/options strings) into the
// strict FieldDefinition shape the table widget expects, including stable
// ids + hex colors for select options.
function buildSchemaFromAiColumns(
  cols: Extract<ActionProposal, { kind: 'create-table' }>['columns']
): TableSchema {
  return {
    columns: cols.map((c, i) => {
      const id = `c-${Date.now().toString(36)}-${i}`
      const baseConfig = defaultConfig(c.type)
      // For select types, materialise the options array.
      let config: unknown = baseConfig
      if (
        (c.type === 'single-select' || c.type === 'multi-select') &&
        Array.isArray(c.options) &&
        c.options.length > 0
      ) {
        config = {
          options: c.options.map((label, oi) => ({
            id: `o-${Date.now().toString(36)}-${i}-${oi}`,
            label,
            color: SELECT_COLORS[oi % SELECT_COLORS.length]
          }))
        }
      }
      return {
        id,
        type: c.type,
        label: c.label,
        config
      } as FieldDefinition
    })
  }
}

async function applyCreateTable(
  p: Extract<ActionProposal, { kind: 'create-table' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — tables need a canvas.' }
  }
  const schema = buildSchemaFromAiColumns(p.columns)
  // Create the backing table FIRST so the widget can spawn pre-configured —
  // mirrors the AI Builder accept path.
  const table = await useTablesStore.getState().createTable({
    taskId: ctx.activeTaskId,
    title: p.title,
    schema
  })
  const entry = catalogFor('table')
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: 'table',
    title: p.title,
    content: table.id,
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  return {
    ok: true,
    message: `Added table "${p.title}" (${schema.columns.length} columns)`
  }
}

async function applyAddTableRow(
  p: Extract<ActionProposal, { kind: 'add-table-row' }>
): Promise<ApplyResult> {
  // Resolve the table + its schema so we can map AI-provided column labels
  // (or ids) to actual column ids + coerce values to the right primitive.
  const tablesState = useTablesStore.getState()
  const table = await tablesState.ensureTableLoaded(p.tableId)
  if (!table) {
    return { ok: false, message: `No table with id ${p.tableId.slice(0, 8)}…` }
  }
  // Build a label→column lookup (case-insensitive, trimmed) alongside the
  // direct id match so the AI can refer to columns by either.
  const byKey = new Map<string, (typeof table.schema.columns)[number]>()
  for (const col of table.schema.columns) {
    byKey.set(col.id, col)
    byKey.set(col.label.toLowerCase().trim(), col)
  }
  const cells: Record<string, unknown> = {}
  const unrecognised: string[] = []
  for (const [key, raw] of Object.entries(p.cells)) {
    const col = byKey.get(key) ?? byKey.get(key.toLowerCase().trim())
    if (!col) {
      unrecognised.push(key)
      continue
    }
    cells[col.id] = coerceCellValue(col.type, raw, col.config)
  }
  if (Object.keys(cells).length === 0) {
    return {
      ok: false,
      message:
        unrecognised.length > 0
          ? `No matching columns for: ${unrecognised.join(', ')}`
          : 'No cell values provided.'
    }
  }
  await tablesState.addRow(p.tableId, cells)
  return {
    ok: true,
    message: `Added row to "${table.title}"${unrecognised.length > 0 ? ` (skipped: ${unrecognised.join(', ')})` : ''}`
  }
}

// Best-effort coercion from the AI's string-only cells map to the typed value
// each column expects. Falls back to defaultValue when parsing fails so we
// never insert garbage that breaks the table widget's rendering.
function coerceCellValue(
  type: string,
  raw: string,
  config: unknown
): unknown {
  const v = raw.trim()
  switch (type) {
    case 'text-short':
    case 'text-long':
    case 'text-rich':
      return v
    case 'number': {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    case 'checkbox': {
      const lower = v.toLowerCase()
      return ['true', 'yes', 'y', '1', '✓', 'done', 'checked'].includes(lower)
    }
    case 'single-select':
    case 'multi-select': {
      const opts =
        (config as { options?: Array<{ id: string; label: string }> })
          .options ?? []
      // Match by label first; fall through to id.
      const matchOne = (input: string): string | null => {
        const lc = input.toLowerCase().trim()
        const byLabel = opts.find((o) => o.label.toLowerCase().trim() === lc)
        if (byLabel) return byLabel.id
        const byId = opts.find((o) => o.id === input)
        return byId ? byId.id : null
      }
      if (type === 'single-select') return matchOne(v)
      // Multi: split on comma + match each.
      const parts = v.split(',').map((p) => p.trim()).filter(Boolean)
      return parts.map((p) => matchOne(p)).filter((x): x is string => x !== null)
    }
    case 'date': {
      const t = Date.parse(v)
      return Number.isFinite(t) ? t : null
    }
    default:
      return defaultValue(type as Parameters<typeof defaultValue>[0])
  }
}

async function applyCreateField(
  p: Extract<ActionProposal, { kind: 'create-field' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — fields need a canvas.' }
  }
  // Build a FieldDefinition + initial value blob for the FieldWidget's
  // content (which is the JSON of {def, value}).
  let config: unknown = defaultConfig(p.fieldType)
  if (
    (p.fieldType === 'single-select' || p.fieldType === 'multi-select') &&
    Array.isArray(p.options) &&
    p.options.length > 0
  ) {
    config = {
      options: p.options.map((label, oi) => ({
        id: `o-${Date.now().toString(36)}-${oi}`,
        label,
        color: SELECT_COLORS[oi % SELECT_COLORS.length]
      }))
    }
  }
  const def: FieldDefinition = {
    id: `f-${Date.now().toString(36)}`,
    type: p.fieldType,
    label: p.label,
    config
  } as FieldDefinition
  const content = JSON.stringify({ def, value: defaultValue(p.fieldType) })
  const entry = catalogFor('field')
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: 'field',
    title: p.label,
    content,
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  return { ok: true, message: `Added field "${p.label}" (${p.fieldType})` }
}

// Display-name + icon for the proposal type — used by ChatPanel's proposal cards.
export function describeProposal(
  p: ActionProposal
): { icon: string; verb: string; subject: string } {
  switch (p.kind) {
    case 'create-widget':
      return {
        icon: catalogFor(p.widgetKind)?.icon ?? 'widgets',
        verb: 'Add',
        subject: `${catalogFor(p.widgetKind)?.label ?? p.widgetKind}${p.title ? ` "${p.title}"` : ''}`
      }
    case 'open-url': {
      let host = p.url
      try {
        host = new URL(p.url).hostname.replace(/^www\./, '')
      } catch {
        // ignore
      }
      return { icon: 'public', verb: 'Open', subject: p.title ? `${p.title} (${host})` : host }
    }
    case 'create-todo-list':
      return {
        icon: 'checklist',
        verb: 'Add todo list',
        subject: `${p.title} · ${p.items.length} items`
      }
    case 'create-page':
      return { icon: 'description', verb: 'Add page', subject: p.title }
    case 'create-task':
      return { icon: 'task_alt', verb: 'New task', subject: p.title }
    case 'start-focus-session':
      return {
        icon: 'timer',
        verb: 'Start',
        subject: `${p.minutes}-minute focus session`
      }
    case 'delete-widget':
      return { icon: 'delete', verb: 'Remove', subject: p.label }
    case 'update-widget':
      return { icon: 'edit', verb: 'Update', subject: p.label }
    case 'create-table':
      return {
        icon: 'table_chart',
        verb: 'Add table',
        subject: `${p.title} · ${p.columns.length} columns`
      }
    case 'add-table-row': {
      const preview = Object.values(p.cells).slice(0, 3).join(' · ')
      return {
        icon: 'add_row_above',
        verb: 'Add row',
        subject: preview || 'new row'
      }
    }
    case 'create-field':
      return {
        icon: 'edit_note',
        verb: 'Add field',
        subject: `${p.label} · ${p.fieldType}`
      }
    default:
      return { icon: 'auto_awesome', verb: 'Action', subject: '' }
  }
}
