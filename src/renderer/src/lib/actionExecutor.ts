// Translates AI ActionProposal objects into concrete workspace mutations.
//
// Lives in the renderer because that's where the relevant stores are. The main
// process only PROPOSES via tool-use; everything written here is what runs
// after the user clicks Apply on a proposal card.
//
// Each handler returns { ok, message } so the chat UI can show a confirmation
// chip ("✓ Created Project tracker" / "✗ Couldn't open URL") inline.

import type { ActionProposal, WidgetKind, WidgetPatch, NodePatch, TaskStatus } from '@shared/types'
import type { FieldDefinition, TableSchema } from '@shared/fields'
import { defaultConfig, defaultValue } from '@shared/fields'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useFocusSessionStore } from '../stores/focusSession'
import { useTablesStore } from '../stores/tables'
import { useLinksStore } from '../stores/links'
import { useKnowledgeStore } from '../stores/knowledge'
import { useDocumentsStore } from '../stores/documents'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useMailStore } from '../stores/mail'
import { useMessagingStore } from '../stores/messaging'
import { useViewStore } from '../stores/view'
import { catalogFor } from './widgetCatalog'
import { spawnPositionFor } from './spawnPosition'

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
 *
 * `resolvedIds` is a shared map keyed by proposal.id → newly-created entity id
 * (e.g. table id from a create-table). Lets a follow-up add-table-row in the
 * same batch reference the table that was just created with a symbolic
 * "$<proposalId>" instead of an id that doesn't exist yet. Pass the same map
 * across an applyAll() loop; pass `undefined` (or omit) for one-off calls and
 * symbolic refs will fail validation as before.
 */
export async function applyProposal(
  proposal: ActionProposal,
  ctx: { activeTaskId: string | null; resolvedIds?: Map<string, string>; destinationFolderId?: string | null }
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
      return applyCreateTask(proposal, ctx)
    case 'start-focus-session':
      return applyStartFocusSession(proposal, ctx)
    case 'delete-widget':
      return applyDeleteWidget(proposal)
    case 'update-widget':
      return applyUpdateWidget(proposal)
    case 'link-widgets':
      return applyLinkWidgets(proposal, ctx)
    case 'focus-widget':
      return applyFocusWidget(proposal)
    case 'toggle-todo-item':
      return applyToggleTodoItem(proposal)
    case 'drill-in-widget':
      return applyDrillInWidget(proposal)
    case 'arrange-widgets':
      return applyArrangeWidgets(proposal, ctx)
    case 'create-table':
      return applyCreateTable(proposal, ctx)
    case 'add-table-row':
      return applyAddTableRow(proposal, ctx)
    case 'create-field':
      return applyCreateField(proposal, ctx)
    case 'update-task':
      return applyUpdateTask(proposal, ctx)
    case 'create-knowledge-entry':
      return applyCreateKnowledgeEntry(proposal)
    case 'create-document':
      return applyCreateDocument(proposal, ctx)
    case 'edit-document':
      return applyEditDocument(proposal, ctx)
    case 'set-cell':
      return applySetCell(proposal, ctx)
    case 'schedule-event':
      return applyScheduleEvent(proposal, ctx)
    case 'compose-mail':
      return applyComposeMail(proposal)
    case 'post-chat':
      return applyPostChat(proposal)
    default: {
      // Compile-time exhaustiveness: adding a kind to the union without a case
      // here fails `npm run typecheck` instead of silently no-oping at Apply
      // time (the applier owner's prerequisite 1).
      const _exhaustive: never = proposal
      void _exhaustive
      return { ok: false, message: 'Unknown action kind.' }
    }
  }
}

// ── The suite-wide actions (Plexi 3.0): the AI acts beyond the canvas ────────

// Minimal markdown-ish text → Tiptap nodes: '#'-prefixed lines become headings,
// blank-line-separated runs become paragraphs. Deliberately simple — rich
// inline marks can come later; content is never lost, only plainly formatted.
function textToTiptapNodes(text: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = []
  for (const chunk of text.split(/\n{2,}/)) {
    const line = chunk.trim()
    if (!line) continue
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      nodes.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: [{ type: 'text', text: heading[2] }]
      })
    } else {
      nodes.push({ type: 'paragraph', content: [{ type: 'text', text: line.replace(/\n/g, ' ') }] })
    }
  }
  return nodes
}

async function applyEditDocument(
  p: Extract<ActionProposal, { kind: 'edit-document' }>,
  ctx: { resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  let documentId = p.documentId
  if (documentId.startsWith('$')) {
    const resolved = ctx.resolvedIds?.get(documentId.slice(1))
    if (!resolved) {
      return { ok: false, message: 'Edit references a document that was not created in this batch.' }
    }
    documentId = resolved
  }
  const doc = await window.api.documents.get(documentId)
  if (!doc) return { ok: false, message: 'That document no longer exists.' }
  if (doc.docType !== 'doc') {
    return { ok: false, message: 'AI edits cover written documents for now; use set-cell for sheets.' }
  }
  try {
    if (p.body !== undefined) {
      // Doc bodies come in two shapes: bare Tiptap {type:'doc',content} or the
      // brand-kit wrapper {doc, headingStyles}. Edit the inner doc either way.
      const raw = doc.body as Record<string, unknown>
      const wrapped = 'doc' in raw && raw.doc && typeof raw.doc === 'object'
      const inner = (wrapped ? raw.doc : raw) as { type?: string; content?: unknown[] }
      const existing = Array.isArray(inner.content) ? inner.content : []
      const incoming = textToTiptapNodes(p.body)
      const op = p.operation ?? 'append' // least destructive default
      const content =
        op === 'replace' ? incoming : op === 'prepend' ? [...incoming, ...existing] : [...existing, ...incoming]
      const nextInner = { ...inner, type: 'doc', content }
      const nextBody = wrapped ? { ...raw, doc: nextInner } : nextInner
      await window.api.documents.update(
        documentId,
        { body: nextBody as never, ...(p.title ? { title: p.title } : {}) },
        'AI edit' // labelled snapshot: distinguishable in Version history
      )
    } else if (p.title) {
      await window.api.documents.update(documentId, { title: p.title }, 'AI edit')
    }
    // Refresh the hub list and (if this doc is open) the editor.
    const store = useDocumentsStore.getState()
    await store.refresh()
    if (store.active?.id === documentId) await store.open(documentId)
    const what = p.operation === 'replace' ? 'Rewrote' : 'Updated'
    return { ok: true, message: `${what} "${p.label}" — recoverable in Version history` }
  } catch (e) {
    return { ok: false, message: `Could not edit the document: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function applySetCell(
  p: Extract<ActionProposal, { kind: 'set-cell' }>,
  ctx: { resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  let tableId = p.tableId
  if (tableId.startsWith('$')) {
    const resolved = ctx.resolvedIds?.get(tableId.slice(1))
    if (!resolved) return { ok: false, message: 'Cell references a table that was not created in this batch.' }
    tableId = resolved
  }
  // Same widget-id fallback as add-table-row: the model may only have seen the
  // table WIDGET's id; its content field holds the real backing-table id.
  const maybeWidget = useWidgetStore.getState().widgets.find((w) => w.id === tableId)
  if (maybeWidget && maybeWidget.kind === 'table' && maybeWidget.content) tableId = maybeWidget.content
  const tablesState = useTablesStore.getState()
  const table = await tablesState.ensureTableLoaded(tableId)
  if (!table) return { ok: false, message: `No table with id ${tableId.slice(0, 8)}…` }
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
      message: unrecognised.length ? `No matching columns for: ${unrecognised.join(', ')}` : 'No cell values provided.'
    }
  }
  try {
    await tablesState.updateCells(p.rowId, cells)
    return { ok: true, message: `Updated ${Object.keys(cells).length} cell${Object.keys(cells).length === 1 ? '' : 's'} in "${table.title || 'table'}"` }
  } catch (e) {
    return { ok: false, message: `Could not update the row: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function applyScheduleEvent(
  p: Extract<ActionProposal, { kind: 'schedule-event' }>,
  ctx: { activeTaskId: string | null; resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  let taskId = p.taskId ?? null
  if (taskId && taskId.startsWith('$')) {
    taskId = ctx.resolvedIds?.get(taskId.slice(1)) ?? null
  }
  try {
    // Goes through the store so it lands on the shared undo timeline and the
    // open calendar refreshes.
    const block = await useTimeBlockStore.getState().create({
      taskId,
      title: p.title,
      startMs: p.startMs,
      durationMin: p.durationMinutes,
      recurrence: p.recurrence ?? null
    })
    const when = new Date(block.startMs).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    return { ok: true, message: `Scheduled "${p.title}" for ${when}${p.recurrence ? `, repeats ${p.recurrence}` : ''}` }
  } catch (e) {
    return { ok: false, message: `Could not schedule that: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// DRAFT ONLY: opens the composer pre-filled; the human reviews and sends.
// Deliberately never touches the undo timeline (nothing was mutated) and never
// sends — the same contract as PlexiDesk Mail's own reply drafts.
async function applyComposeMail(
  p: Extract<ActionProposal, { kind: 'compose-mail' }>
): Promise<ApplyResult> {
  const mail = useMailStore.getState()
  if (!mail.account && mail.loadedAccount) {
    return { ok: false, message: 'Connect a mailbox in Mail first — then I can pre-fill drafts.' }
  }
  useViewStore.getState().goMail()
  mail.startCompose({ to: p.to, subject: p.subject, text: p.body, aiDrafted: true })
  return { ok: true, message: 'Opened a pre-filled draft — review and send it yourself' }
}

// DRAFT ONLY: navigates to the conversation and pre-fills the chat composer.
async function applyPostChat(
  p: Extract<ActionProposal, { kind: 'post-chat' }>
): Promise<ApplyResult> {
  const messaging = useMessagingStore.getState()
  const conv = messaging.conversations.find((c) => c.id === p.conversationId)
  if (!conv) {
    return { ok: false, message: 'That conversation is not in your chat list (sign in and open Chat once, then retry).' }
  }
  messaging.setPendingDraft({ conversationId: p.conversationId, text: p.body })
  useViewStore.getState().goOffice('chat')
  void messaging.setActive(p.conversationId)
  return { ok: true, message: `Drafted a message in "${p.conversationLabel ?? 'the conversation'}" — press send yourself` }
}

// Update an existing task. taskId comes from the model's context (a real node
// id); falls back to the active task if the model omitted it. Validates status
// before writing so an invalid value can't silently corrupt the node. Goes
// through the node store so the in-memory list stays in sync and undo is logged.
async function applyUpdateTask(
  p: Extract<ActionProposal, { kind: 'update-task' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  const nodeId = p.taskId || ctx.activeTaskId
  if (!nodeId) return { ok: false, message: 'No task to update.' }
  const node = useNodeStore.getState().nodes.find((n) => n.id === nodeId)
  if (!node) return { ok: false, message: `Task "${p.label || nodeId.slice(0, 8)}…" not found.` }
  const patch: NodePatch = {}
  if (p.title !== undefined) patch.title = p.title
  if (p.notes !== undefined) patch.description = p.notes
  if (p.status !== undefined) {
    const VALID: TaskStatus[] = ['open', 'in_progress', 'done', 'parked']
    if (!VALID.includes(p.status)) return { ok: false, message: `Invalid status "${p.status}".` }
    patch.status = p.status
  }
  if (p.dueDate !== undefined) patch.dueDate = p.dueDate
  if (Object.keys(patch).length === 0) return { ok: false, message: 'Nothing to update.' }
  await useNodeStore.getState().update(nodeId, patch)
  return { ok: true, message: `Updated task "${node.title}"` }
}

// Save a fact / decision / process into PlexiBrain. The body is real content the
// model captured from the conversation (the prompt forbids fabrication).
async function applyCreateKnowledgeEntry(
  p: Extract<ActionProposal, { kind: 'create-knowledge-entry' }>
): Promise<ApplyResult> {
  const entry = await useKnowledgeStore.getState().create({
    title: p.title,
    body: p.body ?? '',
    tags: p.tags ?? [],
    pinned: p.pinned ?? false
  })
  if (!entry) return { ok: false, message: 'Could not save to PlexiBrain.' }
  return { ok: true, message: `Added "${p.title}" to PlexiBrain` }
}

// Create a standalone document (doc / sheet / slides) in the Documents library,
// carrying the proposal's title. A real fb_documents row, the same as the New
// button makes, so it opens and edits normally.
async function applyCreateDocument(
  p: Extract<ActionProposal, { kind: 'create-document' }>,
  ctx: { destinationFolderId?: string | null; resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  try {
    const doc = await useDocumentsStore.getState().createBlank(p.docType, p.title)
    // Register the real id so a sibling edit-document can reference this
    // proposal symbolically ("$<proposalId>") in the same batch.
    if (doc) ctx.resolvedIds?.set(p.id, doc.id)
    const label =
      p.docType === 'sheet'
        ? 'spreadsheet'
        : p.docType === 'slides'
          ? 'deck'
          : p.docType === 'map'
            ? 'diagram'
            : p.docType === 'design'
              ? 'design'
              : 'document'
    // File the new document into the meeting's folder when one was chosen, so
    // deliverables stay with the meeting rather than scattering to the root.
    if (doc && ctx.destinationFolderId) {
      await window.api.fileManager.fileDocument(doc.id, ctx.destinationFolderId).catch(() => null)
    }
    return { ok: true, message: doc ? `Created ${label} "${p.title}"` : `Could not create the ${label}.` }
  } catch (e) {
    return { ok: false, message: `Could not create the document: ${e instanceof Error ? e.message : String(e)}` }
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
  // A table widget's content is its backing-table id, NOT free text. If the AI
  // emits create-widget(table) with arbitrary content, that becomes a dangling
  // table id and the widget hangs on "Loading table…". Force empty so the table
  // widget self-provisions a real backing table. (Proper table creation goes
  // through the create-table proposal, which builds the schema + rows.)
  const content = p.widgetKind === 'table' ? '' : p.content ?? entry?.defaultContent ?? ''
  await useWidgetStore.getState().create({
    taskId: ctx.activeTaskId,
    kind: p.widgetKind as WidgetKind,
    title: p.title ?? '',
    content,
    ...spawnPositionFor(entry?.defaultWidth ?? 280, entry?.defaultHeight ?? 200),
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
    ...spawnPositionFor(entry?.defaultWidth ?? 360, entry?.defaultHeight ?? 280),
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
    ...spawnPositionFor(entry?.defaultWidth ?? 280, entry?.defaultHeight ?? 220),
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
    ...spawnPositionFor(entry?.defaultWidth ?? 360, entry?.defaultHeight ?? 320),
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  return { ok: true, message: `Added page "${p.title}"` }
}

async function applyCreateTask(
  p: Extract<ActionProposal, { kind: 'create-task' }>,
  ctx?: { resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  const node = await useNodeStore.getState().create({
    parentId: p.parentId ?? null,
    kind: 'task',
    title: p.title,
    description: p.notes ?? ''
  })
  if (!node) return { ok: false, message: 'Could not create task.' }
  // Register the real id so a sibling schedule-event can bind to this task
  // symbolically in the same batch.
  ctx?.resolvedIds?.set(p.id, node.id)
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
  const patch: WidgetPatch = {}
  if (p.title !== undefined) patch.title = p.title
  if (p.content !== undefined) {
    const op = p.operation ?? 'replace'
    if (op === 'append') {
      const sep = target.content && !target.content.endsWith('\n') ? '\n' : ''
      patch.content = `${target.content || ''}${sep}${p.content}`
    } else if (op === 'prepend') {
      const sep = p.content.endsWith('\n') ? '' : '\n'
      patch.content = `${p.content}${sep}${target.content || ''}`
    } else {
      patch.content = p.content
    }
  }
  if (p.x !== undefined) patch.x = p.x
  if (p.y !== undefined) patch.y = p.y
  if (p.width !== undefined) patch.width = Math.max(120, p.width)
  if (p.height !== undefined) patch.height = Math.max(80, p.height)
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Nothing to update.' }
  }
  await useWidgetStore.getState().update(p.widgetId, patch)
  return { ok: true, message: `Updated ${p.label}` }
}

async function applyLinkWidgets(
  p: Extract<ActionProposal, { kind: 'link-widgets' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — links live on a canvas.' }
  }
  const widgets = useWidgetStore.getState().widgets
  const src = widgets.find((w) => w.id === p.sourceWidgetId)
  const tgt = widgets.find((w) => w.id === p.targetWidgetId)
  if (!src || !tgt) {
    return { ok: false, message: 'One of the linked widgets no longer exists.' }
  }
  const link = await useLinksStore
    .getState()
    .create(p.sourceWidgetId, p.targetWidgetId, ctx.activeTaskId)
  if (!link) {
    return { ok: false, message: 'Link already exists or was rejected by the server.' }
  }
  return { ok: true, message: `Linked ${p.sourceLabel} → ${p.targetLabel}` }
}

async function applyFocusWidget(
  p: Extract<ActionProposal, { kind: 'focus-widget' }>
): Promise<ApplyResult> {
  const widgets = useWidgetStore.getState().widgets
  const target = widgets.find((w) => w.id === p.widgetId)
  if (!target) {
    return { ok: false, message: `No widget found with id ${p.widgetId.slice(0, 8)}…` }
  }
  await useWidgetStore.getState().bringToFront(p.widgetId)
  useWidgetStore.getState().setActive(p.widgetId)
  useWidgetStore.getState().focusOn(p.widgetId)
  return { ok: true, message: `Focused ${p.label}` }
}

async function applyDrillInWidget(
  p: Extract<ActionProposal, { kind: 'drill-in-widget' }>
): Promise<ApplyResult> {
  const widgets = useWidgetStore.getState().widgets
  const target = widgets.find((w) => w.id === p.widgetId)
  if (!target) {
    return { ok: false, message: `No widget found with id ${p.widgetId.slice(0, 8)}…` }
  }
  // setFocused opens the WidgetFocusMode modal (single-widget zoomed view).
  // bringToFront so the widget renders above any siblings in case the
  // modal mounts inline.
  await useWidgetStore.getState().bringToFront(p.widgetId)
  useWidgetStore.getState().setFocused(p.widgetId)
  return { ok: true, message: `Opened ${p.label} in focus mode` }
}

async function applyToggleTodoItem(
  p: Extract<ActionProposal, { kind: 'toggle-todo-item' }>
): Promise<ApplyResult> {
  const widgets = useWidgetStore.getState().widgets
  const target = widgets.find((w) => w.id === p.widgetId)
  if (!target) {
    return { ok: false, message: `No widget found with id ${p.widgetId.slice(0, 8)}…` }
  }
  const lines = (target.content || '').split('\n')
  const needle = p.itemMatch.trim().toLowerCase()
  // Match either Markdown task list (`- [ ] item`) or plain bullet
  // ("- item") that we should convert to a task box. Lines starting with
  // any leading whitespace are tolerated.
  const taskBoxRe = /^(\s*)([-*])\s+(\[[ xX]\])\s+(.*)$/
  const bulletRe = /^(\s*)([-*])\s+(.*)$/
  let mutated = false
  const next = lines.map((line) => {
    if (!line.toLowerCase().includes(needle)) return line
    const tm = line.match(taskBoxRe)
    if (tm) {
      mutated = true
      const box = p.checked ? '[x]' : '[ ]'
      return `${tm[1]}${tm[2]} ${box} ${tm[4]}`
    }
    const bm = line.match(bulletRe)
    if (bm && !mutated) {
      mutated = true
      const box = p.checked ? '[x]' : '[ ]'
      return `${bm[1]}${bm[2]} ${box} ${bm[3]}`
    }
    return line
  })
  if (!mutated) {
    return {
      ok: false,
      message: `Couldn't find an item containing "${p.itemMatch}" in ${p.widgetLabel}.`
    }
  }
  await useWidgetStore.getState().update(p.widgetId, { content: next.join('\n') })
  return {
    ok: true,
    message: p.checked
      ? `Checked off "${p.itemMatch}" in ${p.widgetLabel}`
      : `Re-opened "${p.itemMatch}" in ${p.widgetLabel}`
  }
}

async function applyArrangeWidgets(
  p: Extract<ActionProposal, { kind: 'arrange-widgets' }>,
  ctx: { activeTaskId: string | null }
): Promise<ApplyResult> {
  if (!ctx.activeTaskId) {
    return { ok: false, message: 'Open a task first — nothing to arrange.' }
  }
  const store = useWidgetStore.getState()
  // Resolve the set we're arranging: explicit list, or every visible
  // free-position widget on the active task.
  const explicitIds = p.widgetIds && p.widgetIds.length > 0 ? new Set(p.widgetIds) : null
  const targets = store.widgets.filter((w) => {
    if (w.archived) return false
    if (w.pinned) return false
    if (w.parentSectionId) return false // section children laid out by their section
    if (explicitIds) return explicitIds.has(w.id)
    return true
  })
  if (targets.length === 0) {
    return { ok: false, message: 'No widgets to arrange on the current canvas.' }
  }
  // Simple grid: square-ish layout, 320px columns × 240px rows + 24px gutter.
  // Anchored near the top-left of the visible viewport (origin (0,0)) so
  // even an off-screen mess gets pulled into view.
  const GAP = 24
  const COL_W = 320
  const ROW_H = 240
  const cols = Math.max(1, Math.ceil(Math.sqrt(targets.length)))
  // Sort by current (y, x) so widgets keep approximate spatial order
  // after the rearrange (less jarring than a random shuffle).
  const ordered = [...targets].sort((a, b) =>
    a.y === b.y ? a.x - b.x : a.y - b.y
  )
  for (let i = 0; i < ordered.length; i++) {
    const w = ordered[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * (COL_W + GAP) + GAP
    const y = row * (ROW_H + GAP) + GAP
    await store.update(w.id, { x, y, width: COL_W, height: ROW_H })
  }
  return { ok: true, message: `Arranged ${ordered.length} widget${ordered.length === 1 ? '' : 's'}` }
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
  ctx: { activeTaskId: string | null; resolvedIds?: Map<string, string> }
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
    ...spawnPositionFor(entry?.defaultWidth ?? 420, entry?.defaultHeight ?? 320),
    width: entry?.defaultWidth,
    height: entry?.defaultHeight,
    color: null
  })
  // Stash the new table id keyed by THIS proposal's id so a sibling
  // add-table-row proposal can reference it via `tableId: "$<proposal.id>"`.
  // Without this map, the AI has no way to point follow-up rows at a table
  // it created in the same batch — the table didn't exist when the prompt
  // was written.
  if (ctx.resolvedIds) {
    ctx.resolvedIds.set(p.id, table.id)
  }
  return {
    ok: true,
    message: `Added table "${p.title}" (${schema.columns.length} columns)`
  }
}

async function applyAddTableRow(
  p: Extract<ActionProposal, { kind: 'add-table-row' }>,
  ctx: { resolvedIds?: Map<string, string> }
): Promise<ApplyResult> {
  // Resolve symbolic "$<proposalId>" tableIds against the resolvedIds map
  // populated by an earlier applyCreateTable. Plain ids fall through.
  let tableId = p.tableId
  if (tableId.startsWith('$')) {
    const refKey = tableId.slice(1)
    const resolved = ctx.resolvedIds?.get(refKey)
    if (!resolved) {
      return {
        ok: false,
        message:
          'Row references a table that was not created in this batch (or the create-table action was rejected first).'
      }
    }
    tableId = resolved
  }
  // Voice-command path: the AI references tables by their widget id (the
  // only id it can see in the snapshot). Fall back to looking the id up
  // as a widget — if it's a table widget, its content field holds the
  // real backing-table id.
  const maybeWidget = useWidgetStore.getState().widgets.find((w) => w.id === tableId)
  if (maybeWidget && maybeWidget.kind === 'table' && maybeWidget.content) {
    tableId = maybeWidget.content
  }
  // Resolve the table + its schema so we can map AI-provided column labels
  // (or ids) to actual column ids + coerce values to the right primitive.
  const tablesState = useTablesStore.getState()
  const table = await tablesState.ensureTableLoaded(tableId)
  if (!table) {
    return { ok: false, message: `No table with id ${tableId.slice(0, 8)}…` }
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
  await tablesState.addRow(tableId, cells)
  return {
    ok: true,
    message: `Added row to "${table.title}"${unrecognised.length > 0 ? ` (skipped: ${unrecognised.join(', ')})` : ''}`
  }
}

// Best-effort coercion from the AI's string-only cells map to the typed value
// each column expects. Falls back to defaultValue when parsing fails so we
// never insert garbage that breaks the table widget's rendering.
export function coerceCellValue(
  type: string,
  raw: unknown,
  config: unknown
): unknown {
  // The chat-action path always sends strings (the AI's JSON schema is
  // string-only). The in-widget AI path lets the model return native JSON
  // types (boolean for checkbox, array for multi-select, number for
  // number). Normalise both into the same code path: pre-handle the
  // native types where they save a parse round-trip, then fall through to
  // a string-coerced parse for everything else.
  if (type === 'checkbox' && typeof raw === 'boolean') return raw
  if (type === 'number' && typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  if (type === 'multi-select' && Array.isArray(raw)) {
    const opts =
      (config as { options?: Array<{ id: string; label: string }> }).options ?? []
    const matchOne = (input: string): string | null => {
      const lc = input.toLowerCase().trim()
      const byLabel = opts.find((o) => o.label.toLowerCase().trim() === lc)
      if (byLabel) return byLabel.id
      const byId = opts.find((o) => o.id === input)
      return byId ? byId.id : null
    }
    return (raw as unknown[])
      .map((p) => matchOne(String(p)))
      .filter((x): x is string => x !== null)
  }
  const v = String(raw ?? '').trim()
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
    ...spawnPositionFor(entry?.defaultWidth ?? 240, entry?.defaultHeight ?? 160),
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
    case 'edit-document':
      return {
        icon: 'edit_document',
        verb: p.operation === 'replace' ? 'Rewrite' : 'Update',
        subject: `${p.label}${p.body ? ` · ${p.body.replace(/\s+/g, ' ').slice(0, 60)}…` : ''}`
      }
    case 'set-cell':
      return {
        icon: 'table_chart',
        verb: 'Set cells',
        subject: Object.entries(p.cells)
          .slice(0, 3)
          .map(([k, v]) => `${k} = ${v}`)
          .join(' · ')
      }
    case 'schedule-event':
      return {
        icon: 'calendar_month',
        verb: 'Schedule',
        subject: `${p.title} · ${new Date(p.startMs).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${p.durationMinutes} min${p.recurrence ? ` · ${p.recurrence}` : ''}`
      }
    case 'compose-mail':
      // "Draft", never "Send": the card itself must carry the non-finality.
      return { icon: 'drafts', verb: 'Draft email', subject: p.subject || p.to?.join(', ') || 'new message' }
    case 'post-chat':
      return { icon: 'chat', verb: 'Draft message', subject: p.conversationLabel ?? 'a conversation' }
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
    case 'link-widgets':
      return { icon: 'link', verb: 'Link', subject: `${p.sourceLabel} → ${p.targetLabel}` }
    case 'focus-widget':
      return { icon: 'center_focus_strong', verb: 'Focus', subject: p.label }
    case 'toggle-todo-item':
      return {
        icon: p.checked ? 'check_box' : 'check_box_outline_blank',
        verb: p.checked ? 'Check off' : 'Re-open',
        subject: `"${p.itemMatch}" in ${p.widgetLabel}`
      }
    case 'drill-in-widget':
      return { icon: 'zoom_in', verb: 'Open in focus mode', subject: p.label }
    case 'arrange-widgets':
      return {
        icon: 'dashboard_customize',
        verb: 'Arrange',
        subject: p.widgetIds && p.widgetIds.length > 0 ? `${p.widgetIds.length} widgets` : p.label
      }
    case 'update-task': {
      const bits = [
        p.status ? `→ ${p.status.replace('_', ' ')}` : null,
        p.title ? `rename to "${p.title}"` : null,
        p.dueDate === null ? 'clear due date' : p.dueDate !== undefined ? 'set due date' : null
      ].filter(Boolean)
      return { icon: 'edit', verb: 'Update task', subject: `${p.label}${bits.length ? ` · ${bits.join(', ')}` : ''}` }
    }
    case 'create-knowledge-entry':
      return { icon: 'psychology', verb: 'Add to PlexiBrain', subject: p.title }
    case 'create-document': {
      const verb =
        p.docType === 'sheet'
          ? 'New spreadsheet'
          : p.docType === 'slides'
            ? 'New deck'
            : p.docType === 'map'
              ? 'New diagram'
              : p.docType === 'design'
                ? 'New design'
                : 'New document'
      const icon =
        p.docType === 'sheet'
          ? 'table_chart'
          : p.docType === 'slides'
            ? 'slideshow'
            : p.docType === 'map'
              ? 'account_tree'
              : p.docType === 'design'
                ? 'palette'
                : 'description'
      return { icon, verb, subject: p.title }
    }
    default:
      return { icon: 'auto_awesome', verb: 'Action', subject: '' }
  }
}
