import { getContextEngine, localActor } from '../context/engine'
import { generateWorkCompleted, type WorkScope } from './workCompleted'
import { composeStandup } from './standup'
import { generateStandupNarrative } from '../ai/anthropic'
import { cleanTitle, type BriefTask, type BriefBlock, type BriefDoc } from '../ai/dailyBriefContext'

// A human fallback label per document type, used when a doc's title is empty or
// machine content (e.g. a mindmap whose title is its serialised body).
const DOC_LABEL: Record<string, string> = {
  doc: 'Document',
  sheet: 'Spreadsheet',
  slides: 'Slides',
  map: 'Mindmap',
  design: 'Design'
}
const docFallback = (dt: string): string => DOC_LABEL[dt] ?? 'Document'
// Static imports, NOT lazy require(): electron-vite/Rollup only bundles what the
// static import graph reaches, so a runtime require('../db/nodes') resolves against
// out/main/ (which holds only index.js) and throws MODULE_NOT_FOUND in the built
// app. These are leaf DB modules with no cycle back to standupRun.
import { listNodes } from '../db/nodes'
import { listBlocksInRange } from '../db/timeBlocks'
import { listDocuments } from '../db/documents'

// The impure orchestrator for the daily standup: it gathers real workspace state
// (completed events since the cursor + the look-forward brief inputs), resolves
// titles from real objects, composes the deterministic narrative, and runs the AI
// weave. standup.ts stays pure; this file is the one that touches the DB + model.
// The cursor is supplied by the caller (the renderer owns the synced per-user
// cursor), and the new toCursor is returned for the caller to persist.

export interface StandupRunInput {
  sinceCursor: number
  scope: 'personal' | 'team'
  organisationId?: string | null
}

export interface StandupCompletedItem {
  objectId: string | null
  title: string | null // resolved from a real object, or null — never invented
  at: string
  // 'node' (desk/room/task) or 'document' — lets the UI open the right surface.
  // null when the object could not be resolved (so the UI won't offer a dead link).
  kind: 'node' | 'document' | null
}

// A navigable reference the UI renders as a clickable link (spec: mentions should
// hyperlink to the thing for quick access).
export interface StandupRef {
  id: string
  title: string
  kind: 'node' | 'document'
}

export interface StandupRunResult {
  ok: boolean
  narrative: string
  aiUsed: boolean
  needsApiKey?: boolean
  hasContent: boolean
  completed: StandupCompletedItem[]
  // The look-forward objects the narrative points at, as clickable refs.
  nextUp: StandupRef[]
  counts: { completed: number; created: number; updated: number; deleted: number }
  fromCursor: number
  toCursor: number
}

export async function runStandup(input: StandupRunInput): Promise<StandupRunResult> {
  const e = getContextEngine()
  const actor = localActor()
  const scope: WorkScope =
    input.scope === 'team' && input.organisationId
      ? { kind: 'team', organisationId: input.organisationId }
      : { kind: 'personal', actor }

  // Look-back: what got completed since the cursor (deterministic, real events only).
  const wc = generateWorkCompleted(e.db, { sinceCursor: input.sinceCursor, scope, limit: 20 })

  // Resolve completed object ids -> titles from real objects. Anything we can't
  // resolve stays null; the composer then uses counts only, never an invented title.
  const nodes = listNodes()
  const docs = listDocuments()
  const titleById = new Map<string, string>()
  const kindById = new Map<string, 'node' | 'document'>()
  for (const n of nodes) {
    titleById.set(n.id, cleanTitle(n.title, n.kind === 'folder' ? 'Untitled room' : 'Untitled desk'))
    kindById.set(n.id, 'node')
  }
  for (const d of docs) {
    titleById.set(d.id, cleanTitle(d.title, docFallback(d.docType)))
    kindById.set(d.id, 'document')
  }
  const completedTitles: Record<string, string> = {}
  for (const c of wc.completed) {
    if (c.objectId && titleById.has(c.objectId)) completedTitles[c.objectId] = titleById.get(c.objectId) as string
  }

  // Look-forward: same real sources the daily brief uses.
  const now = Date.now()
  const tasks: BriefTask[] = nodes
    .filter((n) => n.kind === 'task' && (n.status === 'open' || n.status === 'in_progress'))
    .map((n) => ({ id: n.id, title: cleanTitle(n.title, 'Untitled desk'), status: n.status, priority: n.priority, importance: n.importance, dueDate: n.dueDate }))
  const weekBlocks = listBlocksInRange(now, now + 7 * 24 * 60 * 60 * 1000)
  const blocks: BriefBlock[] = weekBlocks.map((b) => ({ title: b.title, startMs: b.startMs, durationMin: b.durationMin }))
  const briefDocs: BriefDoc[] = docs.slice(0, 8).map((d) => ({ title: cleanTitle(d.title, docFallback(d.docType)), docType: d.docType }))

  // The clickable "next up" refs — the same top open tasks the narrative names,
  // ordered the same way composeStandup orders them (importance, then priority,
  // then soonest due).
  const nextUp: StandupRef[] = [...tasks]
    .sort((a, b) => b.importance - a.importance || a.priority - b.priority || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
    .slice(0, 5)
    .filter((t): t is BriefTask & { id: string } => !!t.id)
    .map((t) => ({ id: t.id, title: t.title, kind: 'node' as const }))

  const subject = input.scope === 'team' ? 'the team' : 'you'
  const composed = composeStandup({
    workCompleted: wc,
    completedTitles,
    tasks,
    blocks,
    docs: briefDocs,
    nowMs: now,
    subject
  })
  const weave = await generateStandupNarrative({
    promptContext: composed.promptContext,
    fallbackNarrative: composed.narrative,
    subject
  })

  return {
    ok: true,
    narrative: weave.narrative,
    aiUsed: weave.aiUsed,
    needsApiKey: weave.needsApiKey,
    hasContent: composed.hasContent,
    completed: wc.completed.map((c) => ({
      objectId: c.objectId,
      title: (c.objectId && completedTitles[c.objectId]) || null,
      at: c.at,
      kind: (c.objectId && kindById.get(c.objectId)) || null
    })),
    nextUp,
    counts: {
      completed: wc.completed.length,
      created: wc.createdCount,
      updated: wc.updatedCount,
      deleted: wc.deletedCount
    },
    fromCursor: wc.fromCursor,
    toCursor: wc.toCursor
  }
}
