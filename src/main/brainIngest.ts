import type { Widget } from '@shared/types'
import { contentToPlainText } from '@shared/widgetText'
import { listNodes } from './db/nodes'
import { listDocuments, getDocument } from './db/documents'
import { listWidgetsByTask } from './db/widgets'
import { listEntries } from './db/files'
import { upsertKnowledgeBySource } from './db/knowledge'
import { extractDocText } from './workspaceRank'
import { extractFileText } from './fileText'

// Sync the whole workspace into the PlexiBrain knowledge base, so the Brain reads
// everything — every desk, document, note/page, and Drive file — not just the few
// entries someone typed by hand. Deterministic + idempotent (each object owns one
// entry, keyed by source; re-running refreshes rather than duplicates), and
// honest (no invented content — a file whose text can't be read gets its name and
// an empty body, never a fabricated summary).
//
// Entries are tagged so the Brain Map's shared-tag edges form real clusters: by
// object type (desk / document / note / file), by subtype (docType / extension),
// and by the desk they live on (so a desk's notes group together).

const BODY_CAP = 8000
// Widget kinds that carry real prose worth putting in the brain.
const TEXT_WIDGET = new Set<Widget['kind']>(['note', 'page', 'markdown', 'card', 'living-doc', 'sticky'])

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export interface BrainIngestStats {
  desks: number
  documents: number
  widgets: number
  files: number
  created: number
  updated: number
}

export async function ingestWorkspaceIntoBrain(): Promise<BrainIngestStats> {
  const stats: BrainIngestStats = { desks: 0, documents: 0, widgets: 0, files: 0, created: 0, updated: 0 }
  const bump = (r: { created: boolean }): void => {
    if (r.created) stats.created++
    else stats.updated++
  }

  const nodes = listNodes()

  // Desks / folders / tasks — each is a topic node in the brain.
  for (const n of nodes) {
    const tags = ['workspace', n.kind]
    if (n.status) tags.push(n.status)
    bump(
      upsertKnowledgeBySource('node', n.id, {
        title: n.title?.trim() || `(untitled ${n.kind})`,
        body: (n.description ?? '').slice(0, BODY_CAP),
        tags
      })
    )
    stats.desks++
  }

  // Documents (Word / Sheet / Slides / Map) — real body text via the shared extractor.
  for (const meta of listDocuments()) {
    const doc = getDocument(meta.id)
    if (!doc) continue
    let body = ''
    try {
      body = extractDocText(doc.docType, doc.body).slice(0, BODY_CAP)
    } catch {
      body = ''
    }
    bump(
      upsertKnowledgeBySource('document', meta.id, {
        title: meta.title?.trim() || 'Untitled document',
        body,
        tags: ['document', meta.docType]
      })
    )
    stats.documents++
  }

  // Text widgets with real content, tagged by the desk they live on so a desk's
  // notes cluster together in the Brain Map.
  for (const n of nodes) {
    let widgets: Widget[] = []
    try {
      widgets = listWidgetsByTask(n.id)
    } catch {
      widgets = []
    }
    const deskTag = slug(n.title ?? '')
    for (const w of widgets) {
      if (!TEXT_WIDGET.has(w.kind) || w.archived) continue
      const text = contentToPlainText(w.content).trim()
      if (!text) continue
      const tags = [w.kind, ...(deskTag ? [deskTag] : [])]
      bump(
        upsertKnowledgeBySource('widget', w.id, {
          title: w.title?.trim() || `${w.kind} on ${n.title ?? 'a desk'}`,
          body: text.slice(0, BODY_CAP),
          tags
        })
      )
      stats.widgets++
    }
  }

  // Drive files — recurse the folder tree; extract text where possible (PDF/Word/
  // spreadsheet/text), else store name + type only (honest, no fabrication). 'doc'
  // entries are covered by the documents pass above, so skip them here.
  const seen = new Set<string>()
  const walk = async (parentId: string | null, depth: number): Promise<void> => {
    if (depth > 12) return
    let entries: Awaited<ReturnType<typeof listEntries>> = []
    try {
      entries = listEntries(parentId)
    } catch {
      return
    }
    for (const e of entries) {
      if (e.kind === 'folder') {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        await walk(e.id, depth + 1)
      } else if (e.kind === 'file') {
        let body = ''
        try {
          body = (await extractFileText(e.id)) ?? ''
        } catch {
          body = ''
        }
        const ext = (e.ext ?? '').replace(/^\./, '')
        bump(
          upsertKnowledgeBySource('file', e.id, {
            title: e.name?.trim() || 'File',
            body: body.slice(0, BODY_CAP),
            tags: ['file', ...(ext ? [ext] : [])]
          })
        )
        stats.files++
      }
    }
  }
  await walk(null, 0)

  return stats
}
