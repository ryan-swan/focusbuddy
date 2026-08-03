// User lifecycle (spec §42, REQ-PRD). Deactivating a user never removes the Objects,
// Decisions, Relationships or Events they authored — organisational memory outlives
// the account (PRD-072, INV-05). Instead it triggers an ownership-reassignment
// workflow for the Objects they owned, recorded as an Event.

import type { AppendInput } from '../db/eventStore'

export interface DeactivationResult {
  event: AppendInput
  reassignmentRequiredFor: string[] // owned Object ids needing a new owner
  removed: never[] // deliberately empty — nothing authored is removed
}

// Deactivate a user. Produces the UserDeactivated Event and the list of Objects
// whose ownership must be reassigned. Authored history is untouched.
export function deactivateUser(input: {
  organisationId: string
  actor: string
  userId: string
  ownedObjectIds: string[]
}): DeactivationResult {
  return {
    event: {
      eventType: 'UserDeactivated',
      category: 'administrative',
      actor: input.actor,
      organisationId: input.organisationId,
      objectId: input.userId,
      currentState: {
        userId: input.userId,
        authoredRecordsRemoved: false, // INV-05 / PRD-072 — nothing authored is deleted
        reassignmentRequiredFor: input.ownedObjectIds
      },
      changeSummary: `User ${input.userId} deactivated; ${input.ownedObjectIds.length} object(s) need ownership reassignment`
    },
    reassignmentRequiredFor: [...input.ownedObjectIds],
    removed: []
  }
}
