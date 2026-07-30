// Notification escalation (spec §25, REQ-UX). Every notification records the
// escalation layer it entered at and the trigger that escalated it (UX-043). The
// Security category can never be user-suppressed; all other categories can (UX-044).
// A user can review, in one place, every signal the platform chose NOT to escalate
// (UX-045) — the "what you did not get" digest.

export type NotificationCategory = 'security' | 'decision-risk' | 'attention' | 'activity' | 'digest'
export type EscalationLayer = 'ambient' | 'inbox' | 'interruptive'

export interface Notification {
  id: string
  category: NotificationCategory
  layer: EscalationLayer // the layer it entered at (UX-043)
  trigger: string // what escalated it (UX-043)
  escalated: boolean
}

// UX-043 — a notification is only well-formed if it records its layer and trigger.
export function recordNotification(input: { id: string; category: NotificationCategory; layer: EscalationLayer; trigger: string; escalated: boolean }): Notification {
  if (!input.trigger) throw new Error('A notification MUST record its escalation trigger (PLX-UX-043).')
  return { ...input }
}

// UX-044 — Security is exempt from user suppression; every other category is
// suppressible.
export function canSuppress(category: NotificationCategory): boolean {
  return category !== 'security'
}
export function effectiveDelivery(category: NotificationCategory, userSuppressed: boolean): 'delivered' | 'suppressed' {
  if (category === 'security') return 'delivered' // never suppressible
  return userSuppressed ? 'suppressed' : 'delivered'
}

// UX-045 — the not-escalated digest: everything the platform chose not to interrupt
// the user with, viewable in one place.
export function notEscalatedDigest(all: Notification[]): Notification[] {
  return all.filter((n) => !n.escalated)
}
