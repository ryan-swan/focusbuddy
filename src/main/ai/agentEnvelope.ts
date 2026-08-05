import type { AgentStatus } from '@shared/types'

// Pure validation + honesty enforcement for the agent-step envelope. Kept free of
// Electron/SDK deps so it unit-tests directly. The stateful model call + action
// parsing live in anthropic.ts; this is only the status/blocker discipline.

const STATUSES: readonly AgentStatus[] = ['working', 'done', 'blocked', 'need_input']

// Coerce an untrusted status to a known value; anything unrecognised means "keep
// going" rather than a silent dead-end.
export function coerceAgentStatus(raw: unknown): AgentStatus {
  return typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw)
    ? (raw as AgentStatus)
    : 'working'
}

// A blocker is meaningful text or it is null — never an empty string.
export function normalizeBlocker(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

// Enforce honesty + coherence on the parsed status/blocker:
//  - blocked/need_input with no reason is a dead end the driver can't explain →
//    downgrade to 'working' (keep going rather than stall silently).
//  - 'done' while the previous round left failures the model neither retried (no
//    new actions this round) nor acknowledged (narration doesn't mention a
//    failure) is a false completion claim → downgrade to 'blocked' with an
//    auto-generated reason. Conservative: only the clear "claimed done, did
//    nothing, ignored the failures" case, to avoid false positives.
export function enforceAgentStatus(input: {
  status: AgentStatus
  blocker: string | null
  actionCount: number
  narration: string
  priorFailedCount: number
}): { status: AgentStatus; blocker: string | null } {
  let status = input.status
  let blocker = input.blocker
  if ((status === 'blocked' || status === 'need_input') && !blocker) {
    status = 'working'
    blocker = null
  }
  if (status === 'done' && input.priorFailedCount > 0) {
    const acknowledges = /\b(fail|failed|failure|error|couldn't|could not|cannot|unable|retry|retried|redo)\b/i.test(
      input.narration
    )
    if (input.actionCount === 0 && !acknowledges) {
      status = 'blocked'
      blocker = `${input.priorFailedCount} action${input.priorFailedCount === 1 ? '' : 's'} failed last round and ${input.priorFailedCount === 1 ? 'was' : 'were'} not addressed.`
    }
  }
  return { status, blocker }
}
