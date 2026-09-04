// Desk-agent config + run-log, serialised into the agent widget's content.

export type AgentTrigger = 'manual' | 'interval' | 'onChange'

export interface AgentRun {
  at: number
  output: string
  inputCount: number
  error?: string
}

export interface AgentConfig {
  instruction: string
  trigger: AgentTrigger
  intervalSec: number
  enabled: boolean
  // Which profile ("job description") shapes this agent's approach. Undefined =
  // the generalist. The profile only affects HOW it reasons, never how its
  // output is written to other widgets (that hygiene is enforced in code).
  profileId?: string
  // Where this agent's output goes.
  //
  // Wiring an output widget only ever told the MODEL what format to write in —
  // nothing delivered anything. Whether the output reached the page you wired
  // depended on the model choosing to emit an update-widget proposal for it,
  // which is a coin toss dressed up as configuration. A destination is the
  // explicit answer to "put it here", and delivery is then guaranteed to be
  // OFFERED (as a review card — it is still never applied without a human).
  destinationWidgetId?: string | null
  // Whether each run adds to the destination or replaces it. Append is the
  // default because losing prior output to a scheduled run is not recoverable.
  destinationMode?: 'append' | 'replace'
  // Skip the review card for the destination write only. Everything else an
  // agent proposes still goes through review; this narrows the exemption to the
  // one write the user explicitly configured.
  destinationAutoApply?: boolean
  lastRunAt: number | null
  lastOutput: string
  lastError: string | null
  // Newest-first, capped run log shown on the widget.
  history: AgentRun[]
}

export const MIN_INTERVAL_SEC = 30
const HISTORY_CAP = 8

export const DEFAULT_AGENT: AgentConfig = {
  instruction: '',
  trigger: 'manual',
  intervalSec: 120,
  enabled: true,
  destinationWidgetId: null,
  destinationMode: 'append',
  destinationAutoApply: false,
  lastRunAt: null,
  lastOutput: '',
  lastError: null,
  history: []
}

export function parseAgent(content: string | undefined | null): AgentConfig {
  if (!content) return { ...DEFAULT_AGENT }
  try {
    const parsed = JSON.parse(content) as Partial<AgentConfig>
    return {
      ...DEFAULT_AGENT,
      ...parsed,
      intervalSec: Math.max(MIN_INTERVAL_SEC, parsed.intervalSec ?? DEFAULT_AGENT.intervalSec),
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_CAP) : []
    }
  } catch {
    return { ...DEFAULT_AGENT }
  }
}

export function serializeAgent(cfg: AgentConfig): string {
  return JSON.stringify({ ...cfg, history: cfg.history.slice(0, HISTORY_CAP) })
}

// Push a run onto the log and update the convenience fields.
export function withRun(cfg: AgentConfig, run: AgentRun): AgentConfig {
  return {
    ...cfg,
    lastRunAt: run.at,
    lastOutput: run.error ? cfg.lastOutput : run.output,
    lastError: run.error ?? null,
    history: [run, ...cfg.history].slice(0, HISTORY_CAP)
  }
}
