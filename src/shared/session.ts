// Session lifecycle (spec §41, REQ-DOM). A Session is closed by explicit exit, by
// timeout, or by recovery on the next connection; an unclosed Session never blocks
// Resume generation (DOM-051).

export type SessionCloseReason = 'explicit-exit' | 'timeout' | 'recovery'
export type SessionState = 'open' | 'closed'

export interface Session {
  id: string
  state: SessionState
  closeReason: SessionCloseReason | null
  openedAt: string
  closedAt: string | null
}

export function closeSession(s: Session, reason: SessionCloseReason, at: string): Session {
  return { ...s, state: 'closed', closeReason: reason, closedAt: at }
}

// An unclosed Session does not block Resume generation — Resume derives from Events,
// not from Session closure (DOM-051). This predicate is always true; it exists so
// the dependency is explicit and testable.
export function resumeBlockedByOpenSession(_s: Session): boolean {
  return false
}
