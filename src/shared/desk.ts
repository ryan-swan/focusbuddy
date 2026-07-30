// Desk domain model (spec §10, §33, §16, REQ-PRD/DOM). A Desk is a container with a
// lifecycle state machine (PRD-004), a mutable archetype that is a template, not a
// type (PRD-003), and a Current Objective (PRD-006). Objects can be shared into
// other Desks without changing their owning Desk (PRD-060), and where an Object is
// present in several Desks the most restrictive permission governs (PRD-061 /
// DOM-031).

import type { AppendInput } from '../main/db/eventStore'

// Archetypes are presentation/default-policy templates over one schema (§10.3).
export const DESK_ARCHETYPES = ['personal', 'project', 'team', 'organisation', 'client', 'knowledge'] as const
export type DeskArchetype = (typeof DESK_ARCHETYPES)[number]
export function isDeskArchetype(a: string): a is DeskArchetype {
  return (DESK_ARCHETYPES as readonly string[]).includes(a)
}

// ── Lifecycle state machine (§10.4, PRD-004) ─────────────────────────────────

export type DeskState = 'draft' | 'active' | 'paused' | 'archived' | 'historical'

const TRANSITIONS: Record<DeskState, Partial<Record<string, DeskState>>> = {
  draft: { activate: 'active' },
  active: { pause: 'paused', archive: 'archived' },
  paused: { resume: 'active', archive: 'archived' },
  archived: { reactivate: 'active', retain: 'historical' },
  historical: {} // terminal — never destroyed
}

export interface TransitionError {
  code: 'INVALID_TRANSITION'
  from: DeskState
  attempted: string
  permitted: string[]
}

// Apply a lifecycle action, or return a machine-readable error naming the attempted
// action and the permitted ones (PRD-004).
export function applyDeskTransition(from: DeskState, action: string): { ok: true; to: DeskState } | { ok: false; error: TransitionError } {
  const to = TRANSITIONS[from][action]
  if (!to) {
    return { ok: false, error: { code: 'INVALID_TRANSITION', from, attempted: action, permitted: Object.keys(TRANSITIONS[from]) } }
  }
  return { ok: true, to }
}

// Archiving or moving to Historical never deletes memory and keeps the Desk
// searchable for permitted users (PRD-005). This is a property of the transition,
// asserted here for callers building on it.
export function archivePreservesMemory(action: string): boolean {
  return action === 'archive' || action === 'retain'
}

// ── Archetype change (PRD-003) ───────────────────────────────────────────────

// Changing archetype is a pure attribute change: no data migration, no change to
// Object ownership, and it emits a DeskArchetypeChanged Event.
export function changeArchetypeEvent(organisationId: string, deskId: string, actor: string, from: DeskArchetype, to: DeskArchetype): AppendInput {
  if (!isDeskArchetype(to)) throw new Error(`"${to}" is not a valid Desk archetype (PLX-PRD-003).`)
  return {
    eventType: 'DeskArchetypeChanged',
    category: 'user',
    actor,
    organisationId,
    deskId,
    objectId: deskId,
    previousState: { archetype: from },
    currentState: { archetype: to, ownershipUnchanged: true, migrationRequired: false },
    changeSummary: `Desk archetype ${from} -> ${to}`
  }
}

// ── Current Objective (PRD-006) ──────────────────────────────────────────────

export interface DeskObjective {
  statement: string
  source: 'declared' | 'inferred'
  accepted: boolean
}

// A Desk without an explicit Objective needs one prompted; a draft MAY be proposed
// from Desk content but is unconfirmed until the user accepts it (PRD-006 / DOM-022).
export function objectiveNeedsPrompt(objective: DeskObjective | null): boolean {
  return objective == null || (objective.source === 'inferred' && !objective.accepted)
}
export function proposeDraftObjective(statement: string): DeskObjective {
  return { statement, source: 'inferred', accepted: false }
}

// ── Sharing and multi-Desk presence (PRD-060/061/062/063, DOM-031) ───────────

export type SyncMode = 'independent' | 'snapshot' | 'linked' | 'live' | 'federated' | 'streaming'

export interface DeskPresence {
  deskId: string
  syncMode: SyncMode // visible to every viewer (PRD-062)
  addedBy: string
  // The permissions this presence grants, before intersection.
  permissions: string[]
}

export interface SharedObject {
  objectId: string
  owningDeskId: string // set once; sharing never changes it (PRD-060)
  presentIn: DeskPresence[]
  owners: string[] // for federated objects, all owners recorded (PRD-063)
}

// Sharing an Object into another Desk adds a presence but never changes its owning
// Desk (PRD-060).
export function shareIntoDesk(obj: SharedObject, presence: DeskPresence): SharedObject {
  return { ...obj, presentIn: [...obj.presentIn.filter((p) => p.deskId !== presence.deskId), presence] }
}

// Most-restrictive-wins: for a user present via multiple Desks, the effective
// permission is the intersection of the owning-Desk permission and every presenting
// Desk permission (PRD-061 / DOM-031).
export function effectivePermissions(owningDeskPermissions: string[], presences: DeskPresence[]): string[] {
  let allowed = new Set(owningDeskPermissions)
  for (const p of presences) {
    const here = new Set(p.permissions)
    allowed = new Set([...allowed].filter((cap) => here.has(cap)))
  }
  return [...allowed]
}

// The sync mode of a shared Object is always visible to a viewer (PRD-062).
export function visibleSyncMode(obj: SharedObject, deskId: string): SyncMode | null {
  return obj.presentIn.find((p) => p.deskId === deskId)?.syncMode ?? null
}

// A change to a federated Object's owner set emits an Event and requires approval
// from the existing owners (PRD-063).
export interface OwnerSetChange {
  event: AppendInput
  requiresApprovalFrom: string[]
}
export function changeFederatedOwners(organisationId: string, obj: SharedObject, actor: string, nextOwners: string[]): OwnerSetChange {
  return {
    event: {
      eventType: 'FederatedOwnersChanged',
      category: 'administrative',
      actor,
      organisationId,
      objectId: obj.objectId,
      previousState: { owners: obj.owners },
      currentState: { owners: nextOwners },
      changeSummary: `Federated owner set changed for ${obj.objectId}`
    },
    requiresApprovalFrom: obj.owners // the EXISTING owner set must approve (PRD-063)
  }
}
