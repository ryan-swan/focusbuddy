import type { DocBody } from '@shared/types'

// The standup digest is only useful if you can DO something with it. This module
// turns a standup into real workspace objects through the SAME chokepoints the
// rest of the app uses (nodes.create, widgets.create, documents.create,
// fileManager.fileDocument) — never a private write path. The builders
// (markdown + Tiptap body) are pure so they are unit-tested directly; routeDigest
// is the thin impure shell that performs the chosen write and reports honestly.

export interface DigestCompletedItem {
  objectId: string | null
  title: string | null
  at: string
}

export interface DigestInput {
  narrative: string
  completed: DigestCompletedItem[]
  counts: { completed: number; created: number; updated: number; deleted: number }
  scope: 'personal' | 'team'
  // A human date label for the title, e.g. "4 Aug 2026". Caller supplies it so
  // this module stays free of Date/locale concerns and testable.
  dateLabel: string
}

export type DigestDestination =
  | { kind: 'desk'; deskId: string; deskTitle?: string }
  | { kind: 'new-room-desk'; roomName?: string; deskName?: string }
  | { kind: 'drive' }
  | { kind: 'drive-folder'; folderId: string; folderName?: string }

export interface RouteResult {
  ok: boolean
  message: string
  // Where the created content lives, when the caller wants to offer "Open".
  target?: { deskId?: string; docId?: string }
}

// ── pure builders ────────────────────────────────────────────────────────────

export function defaultDigestTitle(input: DigestInput): string {
  const who = input.scope === 'team' ? 'Team standup' : 'Standup'
  return `${who} — ${input.dateLabel}`
}

function countsLine(c: DigestInput['counts']): string {
  const parts: string[] = []
  if (c.completed) parts.push(`${c.completed} completed`)
  if (c.created) parts.push(`${c.created} created`)
  if (c.updated) parts.push(`${c.updated} updated`)
  if (c.deleted) parts.push(`${c.deleted} removed`)
  return parts.join(', ')
}

// Markdown for a 'markdown' widget pinned on a desk.
export function buildDigestMarkdown(input: DigestInput): string {
  const lines: string[] = []
  lines.push(`# ${defaultDigestTitle(input)}`)
  lines.push('')
  lines.push(input.narrative.trim() || 'Nothing new since the last digest.')
  const titled = input.completed.filter((c) => c.title)
  if (titled.length) {
    lines.push('')
    lines.push('## Completed since last time')
    for (const c of titled) lines.push(`- ${c.title}`)
  }
  const cl = countsLine(input.counts)
  if (cl) {
    lines.push('')
    lines.push(`_${cl}._`)
  }
  return lines.join('\n')
}

// A real Tiptap document body for documents.create (docType 'doc').
export function buildDigestDocBody(input: DigestInput): DocBody {
  const content: Record<string, unknown>[] = []
  content.push({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: defaultDigestTitle(input) }]
  })
  // Split the narrative into paragraphs on blank lines so a multi-sentence
  // narrative reads as prose, not one run-on block.
  const paras = (input.narrative.trim() || 'Nothing new since the last digest.')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of paras) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: p }] })
  }
  const titled = input.completed.filter((c) => c.title)
  if (titled.length) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Completed since last time' }]
    })
    content.push({
      type: 'bulletList',
      content: titled.map((c) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: c.title as string }] }]
      }))
    })
  }
  const cl = countsLine(input.counts)
  if (cl) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: cl, marks: [{ type: 'italic' }] }]
    })
  }
  return { type: 'doc', content }
}

// ── impure router ────────────────────────────────────────────────────────────

// Load every Drive folder (bounded) so the picker can offer a target. Flat list
// with a depth for indentation; BFS via the public fileManager.list chokepoint.
export async function listDigestFolders(cap = 200): Promise<Array<{ id: string; name: string; depth: number }>> {
  const out: Array<{ id: string; name: string; depth: number }> = []
  const queue: Array<{ id: string | null; depth: number }> = [{ id: null, depth: 0 }]
  while (queue.length && out.length < cap) {
    const { id, depth } = queue.shift() as { id: string | null; depth: number }
    let entries: Awaited<ReturnType<typeof window.api.fileManager.list>> = []
    try {
      entries = await window.api.fileManager.list(id)
    } catch {
      entries = []
    }
    for (const e of entries) {
      if (e.kind === 'folder') {
        out.push({ id: e.id, name: e.name, depth })
        queue.push({ id: e.id, depth: depth + 1 })
      }
    }
  }
  return out
}

// Desks are task-kind nodes; a digest lands as a markdown widget on one.
export async function listDigestDesks(): Promise<Array<{ id: string; title: string }>> {
  let nodes: Awaited<ReturnType<typeof window.api.nodes.list>> = []
  try {
    nodes = await window.api.nodes.list()
  } catch {
    nodes = []
  }
  return nodes
    .filter((n) => n.kind === 'task')
    .map((n) => ({ id: n.id, title: n.title || 'Untitled desk' }))
}

export async function routeDigest(dest: DigestDestination, input: DigestInput): Promise<RouteResult> {
  const title = defaultDigestTitle(input)
  const markdown = buildDigestMarkdown(input)
  try {
    if (dest.kind === 'desk') {
      await window.api.widgets.create({ taskId: dest.deskId, kind: 'markdown', title, content: markdown })
      return { ok: true, message: `Added to ${dest.deskTitle ? `“${dest.deskTitle}”` : 'the desk'}.`, target: { deskId: dest.deskId } }
    }
    if (dest.kind === 'new-room-desk') {
      const roomName = dest.roomName?.trim() || 'Standups'
      const deskName = dest.deskName?.trim() || title
      const room = await window.api.nodes.create({ parentId: null, kind: 'folder', title: roomName })
      const desk = await window.api.nodes.create({ parentId: room.id, kind: 'task', title: deskName })
      await window.api.widgets.create({ taskId: desk.id, kind: 'markdown', title, content: markdown })
      return { ok: true, message: `Created room “${roomName}” with a desk holding your standup.`, target: { deskId: desk.id } }
    }
    if (dest.kind === 'drive') {
      const doc = await window.api.documents.create({ docType: 'doc', title, body: buildDigestDocBody(input) })
      return { ok: true, message: 'Saved to Drive.', target: { docId: doc.id } }
    }
    if (dest.kind === 'drive-folder') {
      const doc = await window.api.documents.create({ docType: 'doc', title, body: buildDigestDocBody(input) })
      await window.api.fileManager.fileDocument(doc.id, dest.folderId)
      return { ok: true, message: `Saved to ${dest.folderName ? `“${dest.folderName}”` : 'the folder'}.`, target: { docId: doc.id } }
    }
    return { ok: false, message: 'Unknown destination.' }
  } catch (err) {
    // Honest failure — never claim a save that did not happen.
    return { ok: false, message: `Could not save: ${(err as Error).message || 'unknown error'}` }
  }
}
