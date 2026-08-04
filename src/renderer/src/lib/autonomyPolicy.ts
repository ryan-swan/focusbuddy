// Assistant autonomy policy, resolved across three scopes the way capabilities
// resolve (default → org → system → assistant), so the operator controls how much
// an assistant may do on its own at whichever level makes sense. The org level is
// a CEILING an admin sets for the whole org; a user's system/assistant choice may
// go below it but never above it. This module is pure and fully tested; the store
// feeds it real values (org from org_state, system/assistant from account_state).

export type AutonomyLevel = 'manual' | 'ask' | 'auto'
// manual — the assistant only surfaces suggestions; the user performs the action.
// ask    — the assistant proposes an action and executes it on one confirmation.
// auto   — the assistant performs low-risk actions itself and reports; anything
//          high-risk still drops back to a confirmation.

const RANK: Record<AutonomyLevel, number> = { manual: 0, ask: 1, auto: 2 }
export const AUTONOMY_LEVELS: AutonomyLevel[] = ['manual', 'ask', 'auto']

export interface AutonomyPolicy {
  // Org admin ceiling: assistants may not exceed this. undefined = no cap.
  orgCeiling?: AutonomyLevel
  // Org admin default the org starts at. undefined = fall through to systemDefault.
  orgDefault?: AutonomyLevel
  // The user's system-wide choice, applied to every assistant. undefined = unset.
  systemChoice?: AutonomyLevel
  // Per-assistant overrides keyed by assistant id. A missing/undefined entry
  // inherits the system choice.
  assistantChoices?: Record<string, AutonomyLevel | undefined>
}

export type AutonomySource = 'assistant' | 'system' | 'org-default' | 'system-default'

export interface ResolvedAutonomy {
  level: AutonomyLevel
  // Which scope supplied the chosen level (before any ceiling was applied).
  source: AutonomySource
  // True when the chosen level was reduced to satisfy the org ceiling.
  cappedByOrg: boolean
}

// Resolve the effective autonomy for an assistant. Most-specific set scope wins
// (assistant > system > org-default > built-in default), then the org ceiling
// clamps the result down if present.
export function resolveAutonomy(
  policy: AutonomyPolicy,
  assistantId?: string,
  systemDefault: AutonomyLevel = 'ask'
): ResolvedAutonomy {
  let desired: AutonomyLevel
  let source: AutonomySource
  const perAssistant = assistantId ? policy.assistantChoices?.[assistantId] : undefined
  if (perAssistant) {
    desired = perAssistant
    source = 'assistant'
  } else if (policy.systemChoice) {
    desired = policy.systemChoice
    source = 'system'
  } else if (policy.orgDefault) {
    desired = policy.orgDefault
    source = 'org-default'
  } else {
    desired = systemDefault
    source = 'system-default'
  }
  if (policy.orgCeiling && RANK[desired] > RANK[policy.orgCeiling]) {
    return { level: policy.orgCeiling, source, cappedByOrg: true }
  }
  return { level: desired, source, cappedByOrg: false }
}

// Given a resolved level, may the assistant perform an action of this risk on its
// own, without a confirmation? This is the single gate every future autonomous
// action should ask before acting.
export function canActAutonomously(level: AutonomyLevel, risk: 'low' | 'high'): boolean {
  if (level === 'manual' || level === 'ask') return false
  // 'auto': self-drives low-risk work; high-risk still asks.
  return risk === 'low'
}

export function autonomyLabel(level: AutonomyLevel): string {
  if (level === 'manual') return 'Suggest only'
  if (level === 'ask') return 'Ask before acting'
  return 'Act on low-risk, ask for the rest'
}

export function autonomyDescription(level: AutonomyLevel): string {
  if (level === 'manual') return 'The assistant surfaces ideas but never changes anything itself. You do the action.'
  if (level === 'ask') return 'The assistant proposes each action and carries it out once you confirm.'
  return 'The assistant handles routine, low-risk work on its own and tells you, but still asks before anything risky.'
}
