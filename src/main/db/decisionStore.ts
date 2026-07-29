// Decision store (spec §37, REQ-DOM/REQ-APP) — persists Decisions with human-only
// ownership and approval (PLX-DOM-040), advisory-only AI commentary (PLX-DOM-041),
// the APP-020 approval gate, permanently-retained rejected alternatives
// (PLX-DOM-043), and an atomic supersede that emits DecisionSuperseded and yields
// the Objects whose Context Health must be re-evaluated (PLX-DOM-042).

import { plexiId } from '../../shared/plexiId'
import type { AppendInput, EventStore, SqlDb } from './eventStore'
import {
  assertHumanPrincipal,
  canBeApproved,
  makeAiCommentary,
  type ActorRef,
  type AiCommentary,
  type Alternative,
  type Approval,
  type Decision,
  type DecisionState
} from '../../shared/decision'

export interface CreateDecisionInput {
  organisationId: string
  title: string
  description?: string
  decisionStatement: string
  decisionOwner: ActorRef
  evidence?: Decision['evidence']
  alternatives?: Alternative[]
  noAlternativesConsidered?: boolean
  relatedObjectIds?: string[]
  affectedDeskIds?: string[]
  dependencyIds?: string[]
  correlationId: string
}

export interface SupersedeResult {
  superseded: Decision
  successor: Decision | null
  objectsToReevaluate: string[] // Objects referencing the superseded Decision (PLX-DOM-042)
}

export interface DecisionStore {
  create: (input: CreateDecisionInput) => Decision
  get: (id: string) => Decision | null
  all: () => Decision[]
  addApproval: (id: string, approver: ActorRef, state: Approval['state'], rationale: string | null, at: string) => Decision | null
  approve: (id: string, approver: ActorRef, at: string) => Decision
  addAiCommentary: (id: string, author: ActorRef, text: string, createdAt: string) => AiCommentary
  supersede: (id: string, successorId: string | null, actor: ActorRef, events: EventStore, at: string) => SupersedeResult
  db: SqlDb
}

export function ensureDecisionSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      decision_statement TEXT NOT NULL,
      decision_owner TEXT NOT NULL,
      decision_date TEXT,
      state TEXT NOT NULL,
      confidence TEXT,
      evidence TEXT NOT NULL DEFAULT '[]',
      alternatives TEXT NOT NULL DEFAULT '[]',
      no_alternatives_considered INTEGER NOT NULL DEFAULT 0,
      related_object_ids TEXT NOT NULL DEFAULT '[]',
      affected_desk_ids TEXT NOT NULL DEFAULT '[]',
      dependency_ids TEXT NOT NULL DEFAULT '[]',
      approvals TEXT NOT NULL DEFAULT '[]',
      ai_commentary TEXT NOT NULL DEFAULT '[]',
      superseded_by_id TEXT,
      correlation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dec_org ON decisions(organisation_id, state);
  `)
}

export function createDecisionStore(db: SqlDb): DecisionStore {
  ensureDecisionSchema(db)

  function rowToDecision(r: Record<string, unknown>): Decision {
    return {
      id: r.id as string,
      organisationId: r.organisation_id as string,
      entityType: 'decision',
      title: r.title as string,
      description: r.description as string,
      decisionStatement: r.decision_statement as string,
      decisionOwner: JSON.parse(r.decision_owner as string) as ActorRef,
      decisionDate: (r.decision_date as string) ?? null,
      state: r.state as DecisionState,
      confidence: r.confidence ? JSON.parse(r.confidence as string) : null,
      evidence: JSON.parse(r.evidence as string),
      alternatives: JSON.parse(r.alternatives as string),
      noAlternativesConsidered: !!(r.no_alternatives_considered as number),
      relatedObjectIds: JSON.parse(r.related_object_ids as string),
      affectedDeskIds: JSON.parse(r.affected_desk_ids as string),
      dependencyIds: JSON.parse(r.dependency_ids as string),
      approvals: JSON.parse(r.approvals as string),
      aiCommentary: JSON.parse(r.ai_commentary as string),
      supersededById: (r.superseded_by_id as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    }
  }

  const get: DecisionStore['get'] = (id) => {
    const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToDecision(row) : null
  }

  const all: DecisionStore['all'] = () =>
    (db.prepare('SELECT * FROM decisions ORDER BY created_at ASC').all() as Record<string, unknown>[]).map(rowToDecision)

  function persist(d: Decision): void {
    db.prepare(
      `UPDATE decisions SET title=?, description=?, decision_statement=?, decision_owner=?, decision_date=?, state=?,
        confidence=?, evidence=?, alternatives=?, no_alternatives_considered=?, related_object_ids=?, affected_desk_ids=?,
        dependency_ids=?, approvals=?, ai_commentary=?, superseded_by_id=?, updated_at=? WHERE id=?`
    ).run(
      d.title, d.description, d.decisionStatement, JSON.stringify(d.decisionOwner), d.decisionDate, d.state,
      d.confidence ? JSON.stringify(d.confidence) : null, JSON.stringify(d.evidence), JSON.stringify(d.alternatives),
      d.noAlternativesConsidered ? 1 : 0, JSON.stringify(d.relatedObjectIds), JSON.stringify(d.affectedDeskIds),
      JSON.stringify(d.dependencyIds), JSON.stringify(d.approvals), JSON.stringify(d.aiCommentary), d.supersededById,
      d.updatedAt, d.id
    )
  }

  const create: DecisionStore['create'] = (input) => {
    // The owner must be a human (PLX-DOM-040) — checked at the write boundary.
    assertHumanPrincipal(input.decisionOwner, 'decisionOwner')
    const ts = new Date().toISOString()
    const d: Decision = {
      id: plexiId(),
      organisationId: input.organisationId,
      entityType: 'decision',
      title: input.title,
      description: input.description ?? '',
      decisionStatement: input.decisionStatement,
      decisionOwner: input.decisionOwner,
      decisionDate: null,
      state: 'proposed',
      confidence: null,
      evidence: input.evidence ?? [],
      alternatives: input.alternatives ?? [],
      noAlternativesConsidered: input.noAlternativesConsidered ?? false,
      relatedObjectIds: input.relatedObjectIds ?? [],
      affectedDeskIds: input.affectedDeskIds ?? [],
      dependencyIds: input.dependencyIds ?? [],
      approvals: [],
      aiCommentary: [],
      supersededById: null,
      createdAt: ts,
      updatedAt: ts
    }
    db.prepare(
      `INSERT INTO decisions (id, organisation_id, title, description, decision_statement, decision_owner, decision_date,
        state, confidence, evidence, alternatives, no_alternatives_considered, related_object_ids, affected_desk_ids,
        dependency_ids, approvals, ai_commentary, superseded_by_id, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      d.id, d.organisationId, d.title, d.description, d.decisionStatement, JSON.stringify(d.decisionOwner), d.decisionDate,
      d.state, null, JSON.stringify(d.evidence), JSON.stringify(d.alternatives), d.noAlternativesConsidered ? 1 : 0,
      JSON.stringify(d.relatedObjectIds), JSON.stringify(d.affectedDeskIds), JSON.stringify(d.dependencyIds),
      JSON.stringify(d.approvals), JSON.stringify(d.aiCommentary), d.supersededById, input.correlationId, d.createdAt, d.updatedAt
    )
    return d
  }

  const addApproval: DecisionStore['addApproval'] = (id, approver, state, rationale, at) => {
    // Every approver must be human (PLX-DOM-040).
    assertHumanPrincipal(approver, 'Approval.approver')
    const d = get(id)
    if (!d) return null
    d.approvals = [...d.approvals, { approver, state, at, rationale }]
    d.updatedAt = at
    persist(d)
    return d
  }

  const approve: DecisionStore['approve'] = (id, approver, at) => {
    assertHumanPrincipal(approver, 'Approval.approver')
    const d = get(id)
    if (!d) throw new Error(`Decision ${id} not found`)
    // PLX-APP-020 gate: a considered alternative, or an explicit "none considered".
    if (!canBeApproved(d)) {
      throw new Error('A Decision MUST record a considered alternative or an explicit "none considered" before approval (PLX-APP-020).')
    }
    d.approvals = [...d.approvals, { approver, state: 'granted', at, rationale: null }]
    d.state = 'approved'
    d.decisionDate = at
    d.updatedAt = at
    persist(d)
    return d
  }

  const addAiCommentary: DecisionStore['addAiCommentary'] = (id, author, text, createdAt) => {
    const d = get(id)
    if (!d) throw new Error(`Decision ${id} not found`)
    // Stored as advisory; never merged into decisionStatement or an approval (PLX-DOM-041).
    const c = makeAiCommentary(plexiId(), author, text, createdAt)
    d.aiCommentary = [...d.aiCommentary, c]
    d.updatedAt = createdAt
    persist(d)
    return c
  }

  // Supersede atomically: set supersededById + state, emit DecisionSuperseded, and
  // report the referencing Objects whose Context Health must be re-evaluated
  // (PLX-DOM-042). The state change and the Event commit together (PLX-EVT-014).
  const supersede: DecisionStore['supersede'] = (id, successorId, actor, events, at) => {
    assertHumanPrincipal(actor, 'Decision supersede actor')
    const d = get(id)
    if (!d) throw new Error(`Decision ${id} not found`)
    // Rejected alternatives are carried forward unchanged — never pruned (PLX-DOM-043).
    const event: AppendInput = {
      eventType: 'DecisionSuperseded',
      category: 'user',
      actor: `${actor.kind}:${actor.id}`,
      organisationId: d.organisationId,
      objectId: d.id,
      correlationId: plexiId(),
      previousState: { state: d.state, supersededById: d.supersededById },
      currentState: { state: 'superseded', supersededById: successorId, alternatives: d.alternatives },
      changeSummary: `Decision "${d.title}" superseded${successorId ? ` by ${successorId}` : ''}`
    }
    const { result } = events.appendWithMutation(event, () => {
      d.supersededById = successorId
      d.state = 'superseded'
      d.updatedAt = at
      persist(d)
      return get(id)!
    })
    return { superseded: result, successor: successorId ? get(successorId) : null, objectsToReevaluate: d.relatedObjectIds }
  }

  return { create, get, all, addApproval, approve, addAiCommentary, supersede, db }
}
