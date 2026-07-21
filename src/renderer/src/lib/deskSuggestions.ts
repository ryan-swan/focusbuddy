import type { Widget, WidgetLink } from '@shared/types'

// The proactive next-step brain, kept deterministic and honest. It looks at what
// is actually on a desk and suggests the single most useful next automation. No
// AI call, no fabrication: every suggestion is derived from real widget/link
// state, so it can never invent something that is not there. The user acts on it
// through the assistant (which then plans the setup as confirmable cards).

export interface DeskSuggestion {
  id: string
  text: string
  // A short phrase the user can say to the assistant to act on this.
  ask: string
}

const CHROME_KINDS = new Set(['minimap', 'section', 'shape'])
const READABLE_KINDS = new Set([
  'note', 'sticky', 'markdown', 'page', 'living-doc', 'card',
  'webview', 'pdf', 'gdoc', 'doc', 'table'
])

// Compute the top suggestion for a desk, or null when nothing useful applies.
// Order matters: the first matching rule wins, so the highest-signal nudge shows.
export function computeDeskSuggestion(
  widgets: Widget[],
  links: WidgetLink[]
): DeskSuggestion | null {
  const real = widgets.filter((w) => !CHROME_KINDS.has(w.kind) && !w.pinned)
  if (real.length === 0) return null

  const agents = real.filter((w) => w.kind === 'agent')
  const tables = real.filter((w) => w.kind === 'table')
  const readable = real.filter((w) => READABLE_KINDS.has(w.kind))
  const enabledLinks = links.filter((l) => l.enabled !== false)

  // 1. An agent with nothing wired into it has nothing to work on.
  const starvedAgent = agents.find(
    (a) => !enabledLinks.some((l) => l.targetWidgetId === a.id)
  )
  if (starvedAgent) {
    return {
      id: `agent-no-input:${starvedAgent.id}`,
      text: 'Your desk agent has no inputs yet. Wire a source (a table, doc, or browser) into it so it has something to work on.',
      ask: 'wire a source into my agent'
    }
  }

  // 2. A table but no agent: enriching/researching a table is the classic win.
  if (tables.length > 0 && agents.length === 0) {
    return {
      id: 'table-no-agent',
      text: 'You have a table but no agent. Set one up to research or enrich its rows automatically.',
      ask: 'add an agent to research and enrich my table'
    }
  }

  // 3. A desk with real content but no agent: offer to summarise or monitor it.
  if (agents.length === 0 && readable.length >= 2) {
    return {
      id: 'content-no-agent',
      text: 'Set up an agent to summarise or monitor what is on this desk, so it stays up to date on its own.',
      ask: 'set up an agent to summarise this desk'
    }
  }

  return null
}

// Per-desk, per-suggestion dismissal so the nudge never nags after it is waved
// off. Keyed by both so a genuinely new suggestion on the same desk can appear.
const DISMISS_PREFIX = 'fb.deskSuggestion.dismissed.'

export function isSuggestionDismissed(taskId: string, suggestionId: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${taskId}.${suggestionId}`) === '1'
  } catch {
    return false
  }
}

export function dismissSuggestion(taskId: string, suggestionId: string): void {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${taskId}.${suggestionId}`, '1')
  } catch {
    /* ignore */
  }
}
