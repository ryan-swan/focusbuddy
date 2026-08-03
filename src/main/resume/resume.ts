// Resume Engine (spec §39, §52, §81) — the deterministic pipeline that turns a
// desk's Events since your last visit into a structured "here is what changed and
// what needs you". The whole structured Resume is produced WITHOUT a model
// (PLX-RES-011 / PLX-RES-013 / PLX-RES-021): the AI stage is additive prose over
// the structure and its absence changes nothing material. Every assertion is
// traceable to the Events it came from (PLX-RES-002), generation is incremental
// against a cursor (PLX-RES-010), and noise removal is reversible (PLX-RES-023).
//
// Spec note (flagged, not silently resolved): §81's stage table and PLX-RES-011
// vs PLX-RES-021 disagree on whether the model stage is stage 6 or stage 7. Both
// agree on the binding intent — the structured Resume is complete without a model,
// and the model stage is purely additive. This implementation encodes that intent
// and takes no position on the numbering.

import type { SqlDb } from '../db/eventStore'

export interface ResumeEventLike {
  id: string
  eventType: string
  objectId: string | null
  changeSummary: string | null
  recordedAt: string
  rowid: number
}

export type ChangeKind = 'created' | 'updated' | 'completed' | 'deleted' | 'other'

export interface ResumeChange {
  objectId: string
  kind: ChangeKind
  count: number
  eventIds: string[] // never empty — PLX-RES-002
  lastSummary: string | null
}

export interface ResumeGroup {
  objectId: string
  changes: ResumeChange[]
  eventIds: string[]
}

export interface CatchupEstimate {
  point: number // minutes
  lowerBound: number
  upperBound: number
  basis: 'heuristic' | 'historical' | 'modelled'
}

export interface StructuredResume {
  deskId: string
  forUserId: string | null
  summary: string // deterministic; stage-model summary augments, never replaces the structure
  groups: ResumeGroup[]
  decisionIds: string[]
  risks: string[]
  recommendedActions: string[]
  estimatedCatchup: CatchupEstimate | null
  sourceEventIds: string[] // PLX-RES-002
  removedEventIds: string[] // PLX-RES-023 — reachable via disclosure, not discarded
  fromCursor: number // PLX-RES-010 incremental cursor this Resume was built from
  toCursor: number
  aiSummary: string | null // stage model output; null when unavailable (PLX-RES-013)
  version: number
}

const KIND_FROM_EVENT = (eventType: string): ChangeKind => {
  const t = eventType.toLowerCase()
  if (t.includes('created')) return 'created'
  if (t.includes('completed')) return 'completed'
  if (t.includes('deleted')) return 'deleted'
  if (t.includes('updated')) return 'updated'
  return 'other'
}

// Event types that carry no catch-up value on their own. Removed reversibly:
// their ids are returned so the disclosure path can still reach them (PLX-RES-023).
const LOW_VALUE_EVENT_TYPES = new Set(['ContextHealthChanged', 'MaterialityScored', 'PresenceChanged'])

// ── Stage 1 — Collect Events (the only DB-touching stage) ────────────────────
// Incremental: only Events beyond the cursor, for the desk's object set
// (PLX-RES-010). Ordered by the global rowid cursor.
export function collectEvents(db: SqlDb, objectIds: string[], sinceCursor: number): ResumeEventLike[] {
  const ids = objectIds.filter(Boolean)
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT rowid, id, event_type, object_id, change_summary, recorded_at
       FROM events WHERE object_id IN (${placeholders}) AND rowid > ? ORDER BY rowid ASC`
    )
    .all(...ids, sinceCursor) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    objectId: (r.object_id as string) ?? null,
    changeSummary: (r.change_summary as string) ?? null,
    recordedAt: r.recorded_at as string,
    rowid: r.rowid as number
  }))
}

// ── Stage 2 — Group related activity ─────────────────────────────────────────
export function groupActivity(events: ResumeEventLike[]): ResumeGroup[] {
  const byObject = new Map<string, ResumeEventLike[]>()
  for (const e of events) {
    if (!e.objectId) continue
    const arr = byObject.get(e.objectId) ?? []
    arr.push(e)
    byObject.set(e.objectId, arr)
  }
  const groups: ResumeGroup[] = []
  for (const [objectId, evs] of byObject) {
    const byKind = new Map<ChangeKind, ResumeEventLike[]>()
    for (const e of evs) {
      const k = KIND_FROM_EVENT(e.eventType)
      const arr = byKind.get(k) ?? []
      arr.push(e)
      byKind.set(k, arr)
    }
    const changes: ResumeChange[] = [...byKind.entries()].map(([kind, es]) => ({
      objectId,
      kind,
      count: es.length,
      eventIds: es.map((e) => e.id), // PLX-RES-002
      lastSummary: es[es.length - 1].changeSummary
    }))
    groups.push({ objectId, changes, eventIds: evs.map((e) => e.id) })
  }
  return groups
}

// ── Stage 3 — Remove low-value events (reversibly) ───────────────────────────
export function removeNoise(events: ResumeEventLike[]): { kept: ResumeEventLike[]; removedEventIds: string[] } {
  const kept: ResumeEventLike[] = []
  const removedEventIds: string[] = []
  for (const e of events) {
    if (LOW_VALUE_EVENT_TYPES.has(e.eventType)) removedEventIds.push(e.id)
    else kept.push(e)
  }
  return { kept, removedEventIds }
}

// ── Stage 4 — Identify decisions ─────────────────────────────────────────────
// decisionsForObject maps an objectId to the ids of Decisions it touches.
export function identifyDecisions(objectIds: string[], decisionsForObject: (objectId: string) => string[]): string[] {
  const out = new Set<string>()
  for (const id of objectIds) for (const d of decisionsForObject(id)) out.add(d)
  return [...out]
}

// ── Stage 5 — Calculate organisational impact ────────────────────────────────
export function calculateImpact(groups: ResumeGroup[], relationCount: number): { touchedObjects: number; reach: number } {
  return { touchedObjects: groups.length, reach: groups.length + relationCount }
}

// ── Stage 7 (deterministic) — Estimate catch-up as a RANGE with a basis ──────
// PLX-RES-003: never a bare point value.
export function estimateCatchup(keptEvents: ResumeEventLike[]): CatchupEstimate | null {
  if (keptEvents.length === 0) return null
  // ~30s of reconstruction per meaningful event, floored at a minute; the band is
  // +-40% to reflect that this is a heuristic, not a measurement.
  const point = Math.max(1, Math.round((keptEvents.length * 30) / 60))
  return {
    point,
    lowerBound: Math.max(1, Math.round(point * 0.6)),
    upperBound: Math.round(point * 1.4),
    basis: 'heuristic'
  }
}

// ── Stage 8 — Recommend next actions (deterministic core) ─────────────────────
export function recommendActions(groups: ResumeGroup[], decisionIds: string[]): string[] {
  const out: string[] = []
  if (decisionIds.length > 0) out.push(`Review ${decisionIds.length} decision(s) that may be affected`)
  const completed = groups.filter((g) => g.changes.some((c) => c.kind === 'completed'))
  if (completed.length > 0) out.push(`Acknowledge ${completed.length} completed item(s)`)
  if (groups.length > 0) out.push(`Catch up on ${groups.length} changed object(s)`)
  return out
}

function deterministicSummary(groups: ResumeGroup[], decisionIds: string[], removed: number): string {
  if (groups.length === 0) return 'Nothing has changed since your last visit.'
  const total = groups.reduce((n, g) => n + g.eventIds.length, 0)
  const parts = [`${total} change(s) across ${groups.length} object(s) since your last visit`]
  if (decisionIds.length > 0) parts.push(`${decisionIds.length} decision(s) may be affected`)
  if (removed > 0) parts.push(`${removed} low-signal event(s) hidden`)
  return parts.join('. ') + '.'
}

export interface GenerateResumeInput {
  deskId: string
  forUserId: string | null
  objectIds: string[]
  sinceCursor: number
  decisionsForObject?: (objectId: string) => string[]
  risksForDesk?: string[]
  relationCount?: number
  version?: number
}

// Run the deterministic pipeline. No model is invoked anywhere here — the result
// is a complete, renderable Resume (PLX-RES-011 / PLX-RES-013 / PLX-RES-021).
export function generateResume(db: SqlDb, input: GenerateResumeInput): StructuredResume {
  const all = collectEvents(db, input.objectIds, input.sinceCursor) // stage 1
  const { kept, removedEventIds } = removeNoise(all) // stage 3 (reversible)
  const groups = groupActivity(kept) // stage 2
  const decisionIds = identifyDecisions(
    input.objectIds,
    input.decisionsForObject ?? (() => [])
  ) // stage 4
  const catchup = estimateCatchup(kept) // stage 7
  const recommendedActions = recommendActions(groups, decisionIds) // stage 8
  const toCursor = all.reduce((m, e) => Math.max(m, e.rowid), input.sinceCursor)

  // PLX-RES-002: no change may be emitted without the Events it derived from.
  for (const g of groups) {
    for (const c of g.changes) {
      if (c.eventIds.length === 0) throw new Error('Resume change with no source Events (PLX-RES-002).')
    }
  }

  return {
    deskId: input.deskId,
    forUserId: input.forUserId,
    summary: deterministicSummary(groups, decisionIds, removedEventIds.length),
    groups,
    decisionIds,
    risks: input.risksForDesk ?? [],
    recommendedActions,
    estimatedCatchup: catchup,
    sourceEventIds: kept.map((e) => e.id),
    removedEventIds,
    fromCursor: input.sinceCursor,
    toCursor,
    aiSummary: null,
    version: input.version ?? 1
  }
}

// Render a collaborative Resume (forUserId === null) for a specific viewer,
// filtering at render time to the objects that viewer may read; a collaborative
// Resume is never materialised in a form that leaks non-permitted content
// (PLX-RES-004). A per-user Resume (forUserId set) is returned unchanged.
export function renderResumeForViewer(resume: StructuredResume, canRead: (objectId: string) => boolean): StructuredResume {
  if (resume.forUserId !== null) return resume
  const groups = resume.groups.filter((g) => canRead(g.objectId))
  const keptEventIds = new Set(groups.flatMap((g) => g.eventIds))
  return {
    ...resume,
    groups,
    sourceEventIds: resume.sourceEventIds.filter((id) => keptEventIds.has(id))
  }
}

// Resume generation is continuous and automatic — a user never has to ask for one
// (PRD-040). This is the declared mode; the caller regenerates on trigger Events.
export const RESUME_MODE = 'continuous-automatic' as const

// Whether there is enough signal to produce a confident summary. Where there is
// not, the Resume states that plainly rather than emitting a low-confidence
// narrative (PRD-044).
export function hasSufficientSignal(resume: StructuredResume): boolean {
  return resume.sourceEventIds.length > 0
}
export function signalStatement(resume: StructuredResume): string {
  return hasSufficientSignal(resume) ? resume.summary : 'Not enough has happened here to summarise yet.'
}

// Stage model (additive only): attach AI prose over the finished structure. It
// never edits the structured fields, so a Resume without it is still complete
// (PLX-RES-013).
export function withAiSummary(resume: StructuredResume, aiSummary: string): StructuredResume {
  return { ...resume, aiSummary }
}

// PLX-RES-001: Resumes are diffable against a prior Resume for the same desk/user.
export interface ResumeDiff {
  newObjectIds: string[]
  resolvedObjectIds: string[]
  newDecisionIds: string[]
}
export function diffResume(prev: StructuredResume | null, next: StructuredResume): ResumeDiff {
  const prevObjs = new Set((prev?.groups ?? []).map((g) => g.objectId))
  const nextObjs = new Set(next.groups.map((g) => g.objectId))
  const prevDec = new Set(prev?.decisionIds ?? [])
  return {
    newObjectIds: [...nextObjs].filter((id) => !prevObjs.has(id)),
    resolvedObjectIds: [...prevObjs].filter((id) => !nextObjs.has(id)),
    newDecisionIds: next.decisionIds.filter((d) => !prevDec.has(d))
  }
}
