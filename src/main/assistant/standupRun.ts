import { getContextEngine, localActor } from '../context/engine'
import { generateWorkCompleted, type WorkScope } from './workCompleted'
import { composeStandup } from './standup'
import { generateStandupNarrative } from '../ai/anthropic'
import type { BriefTask, BriefBlock, BriefDoc } from '../ai/dailyBriefContext'
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
}

export interface StandupRunResult {
  ok: boolean
  narrative: string
  aiUsed: boolean
  needsApiKey?: boolean
  hasContent: boolean
  completed: StandupCompletedItem[]
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
  for (const n of nodes) titleById.set(n.id, n.title || (n.kind === 'folder' ? 'Untitled room' : 'Untitled desk'))
  for (const d of docs) titleById.set(d.id, d.title || 'Untitled document')
  const completedTitles: Record<string, string> = {}
  for (const c of wc.completed) {
    if (c.objectId && titleById.has(c.objectId)) completedTitles[c.objectId] = titleById.get(c.objectId) as string
  }

  // Look-forward: same real sources the daily brief uses.
  const now = Date.now()
  const tasks: BriefTask[] = nodes
    .filter((n) => n.kind === 'task' && (n.status === 'open' || n.status === 'in_progress'))
    .map((n) => ({ id: n.id, title: n.title, status: n.status, priority: n.priority, importance: n.importance, dueDate: n.dueDate }))
  const weekBlocks = listBlocksInRange(now, now + 7 * 24 * 60 * 60 * 1000)
  const blocks: BriefBlock[] = weekBlocks.map((b) => ({ title: b.title, startMs: b.startMs, durationMin: b.durationMin }))
  const briefDocs: BriefDoc[] = docs.slice(0, 8).map((d) => ({ title: d.title, docType: d.docType }))

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
      at: c.at
    })),
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
