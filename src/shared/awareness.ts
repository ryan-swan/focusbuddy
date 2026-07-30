// Cross-Desk awareness (spec §17, REQ-PRD). Awareness statements tell a user that
// something elsewhere affects their work, but they are permission-filtered per
// recipient: a statement is never rendered if it would disclose the existence,
// name, or attributes of an Object, Desk or Decision the recipient may not know
// exists (PRD-070). Where a dependency exists but its subject is not visible to the
// recipient, the statement is either suppressed entirely or redacted to remove the
// unpermitted subject (PRD-071).

import type { CanRead, Principal } from './permission'

export interface AwarenessStatement {
  recipientId: string
  subjectId: string // the Object/Desk/Decision the statement is about
  subjectName: string
  text: string
}

export type AwarenessRender =
  | { render: 'full'; text: string }
  | { render: 'redacted'; text: string }
  | { render: 'suppressed' }

// Decide how (or whether) to render an awareness statement for its recipient. If
// the recipient can read the subject, render it in full. If not, redact the subject
// out when a non-disclosing form remains, otherwise suppress it entirely — never
// leak the subject's existence, name or attributes (PRD-070/071).
export function renderAwareness(
  statement: AwarenessStatement,
  principal: Principal,
  canRead: CanRead,
  redactedForm?: string
): AwarenessRender {
  if (statement.recipientId !== principal.id) return { render: 'suppressed' }
  if (canRead(statement.subjectId)) return { render: 'full', text: statement.text }
  // The recipient cannot see the subject. A redacted form is allowed only if it
  // does not name or describe the subject.
  if (redactedForm && !redactedForm.includes(statement.subjectName) && !redactedForm.includes(statement.subjectId)) {
    return { render: 'redacted', text: redactedForm }
  }
  return { render: 'suppressed' }
}

// Filter a batch of statements for a recipient, dropping suppressed ones. The count
// of returned statements never reveals a suppressed subject's existence, because
// suppressed statements are removed before the recipient sees the list (PRD-070).
export function awarenessFor(
  statements: AwarenessStatement[],
  principal: Principal,
  canRead: CanRead
): AwarenessRender[] {
  return statements
    .map((s) => renderAwareness(s, principal, canRead))
    .filter((r) => r.render !== 'suppressed')
}
