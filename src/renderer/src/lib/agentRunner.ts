import type { ActionProposal, AgentStatus, AgentStepResult, AgentActionOutcome } from '@shared/types'
import { applyProposal, ensureDependencies, isAutoApplyable } from './actionExecutor'
import { useNodeStore } from '../stores/nodes'
import { useActionHistory } from '../stores/actionHistory'
import { useAgentLoop, type AgentRunStep } from '../stores/agentLoop'

// The renderer-side driver of the autonomous agent loop. It calls the stateless
// main-process agent:step once per round, applies the actions it returns (auto
// for safe kinds, deferring consequential ones for approval), builds an
// OBSERVATIONS block from the REAL outcomes, threads it back, and repeats until
// the model says done / blocked / need_input or the round cap is hit.
//
// The control flow is dependency-injected so it unit-tests without Electron:
// `runAgentLoop(opts, deps)` takes the step call, the apply, the gate check, the
// undo-batch hooks and the step emitter as `deps`. `startAgentRun` wires the real
// implementations (window.api.agent.step, applyProposal, the stores).

const DEFAULT_MAX_ROUNDS = 8

export interface AgentRunDeps {
  step: (input: {
    goal: string
    taskId: string | null
    systemPrompt?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    priorFailedCount?: number
  }) => Promise<AgentStepResult>
  // Apply one proposal (resolving its $ref deps first) and report the outcome.
  applyAction: (
    p: ActionProposal,
    pool: ActionProposal[],
    resolvedIds: Map<string, string>
  ) => Promise<AgentActionOutcome>
  // True when a proposal must NOT be auto-applied (consequential) — deferred for
  // the user's approval instead.
  isGated: (p: ActionProposal) => boolean
  onStep: (step: AgentRunStep) => void
  beginBatch: () => void
  endBatch: (label: string) => void
}

export interface AgentRunResult {
  status: AgentStatus
  blocker: string | null
  rounds: number
  pendingApprovals: ActionProposal[]
}

// Render the round's real outcomes into the OBSERVATIONS block the next round
// reads. Outcome-first and terse. Pure + exported for tests.
export function formatObservations(applied: AgentActionOutcome[], deferred: ActionProposal[]): string {
  const lines: string[] = []
  for (const o of applied) {
    lines.push(
      o.ok
        ? `- [applied] ${o.kind}${o.createdId ? ` -> id=${o.createdId}` : ''}${o.message ? ` (${o.message})` : ''}`
        : `- [FAILED] ${o.kind} -> error: ${o.message}`
    )
  }
  for (const d of deferred) {
    lines.push(`- [deferred] ${d.kind} -> queued for the user's approval (NOT applied)`)
  }
  if (lines.length === 0) return 'OBSERVATIONS: no actions were applied this round.'
  return 'OBSERVATIONS (what actually happened):\n' + lines.join('\n')
}

export async function runAgentLoop(
  opts: { goal: string; taskId: string | null; maxRounds?: number },
  deps: AgentRunDeps
): Promise<AgentRunResult> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS
  const resolvedIds = new Map<string, string>()
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const pendingApprovals: ActionProposal[] = []
  let systemPrompt: string | undefined
  let priorFailedCount = 0
  let status: AgentStatus = 'working'
  let blocker: string | null = null
  let round = 0

  // One undo entry for the whole run (finally so a throw/early-return can never
  // leave the module-level batch depth incremented, which would silently stop
  // ALL undo recording app-wide).
  deps.beginBatch()
  try {
    for (; round < maxRounds; round++) {
      let res: AgentStepResult
      try {
        res = await deps.step({ goal: opts.goal, taskId: opts.taskId, systemPrompt, messages: [...messages], priorFailedCount })
      } catch (e) {
        status = 'blocked'
        blocker = e instanceof Error ? e.message : 'The agent step call failed.'
        deps.onStep({ round, narration: '', outcomes: [], deferred: [], status, blocker })
        break
      }
      if (!res.ok) {
        status = 'blocked'
        blocker = res.blocker ?? res.error ?? 'The agent step failed.'
        deps.onStep({ round, narration: res.narration, outcomes: [], deferred: [], status, blocker })
        break
      }
      systemPrompt = res.systemPrompt
      const applied: AgentActionOutcome[] = []
      const deferredThisRound: ActionProposal[] = []
      // Apply in the order the model returned them (never parallel) — this is what
      // prevents most create-before-reference problems; ensureDependencies handles
      // any forward-ref within the round defensively.
      for (const p of res.actions) {
        if (deps.isGated(p)) {
          deferredThisRound.push(p)
          pendingApprovals.push(p)
          continue
        }
        applied.push(await deps.applyAction(p, res.actions, resolvedIds))
      }
      priorFailedCount = applied.filter((o) => !o.ok).length
      messages.push({ role: 'assistant', content: res.rawAssistant })
      messages.push({ role: 'user', content: formatObservations(applied, deferredThisRound) })
      deps.onStep({
        round,
        narration: res.narration,
        outcomes: applied,
        deferred: deferredThisRound.map((d) => d.kind),
        status: res.status,
        blocker: res.blocker
      })
      status = res.status
      blocker = res.blocker
      if (status === 'done' || status === 'blocked' || status === 'need_input') break
      // status === 'working' → keep going, unless this was the last allowed round.
      if (round === maxRounds - 1) {
        status = 'blocked'
        blocker = `Stopped after ${maxRounds} rounds without confirming the goal was complete. Here is where it got to.`
        break
      }
    }
  } finally {
    deps.endBatch(`Agent: ${opts.goal.slice(0, 48)}`)
  }
  return { status, blocker, rounds: round + 1, pendingApprovals }
}

// Apply one proposal for real: resolve its $ref dependencies (threading the run's
// resolvedIds), apply it, and report the outcome with the created id when the
// kind registers one. Never throws — a thrown handler becomes a [FAILED] outcome.
async function applyActionReal(
  p: ActionProposal,
  pool: ActionProposal[],
  resolvedIds: Map<string, string>
): Promise<AgentActionOutcome> {
  const activeTaskId = useNodeStore.getState().activeTaskId
  try {
    const dep = await ensureDependencies(p, pool, { activeTaskId, resolvedIds })
    if (!dep.ok) return { kind: p.kind, ok: false, message: dep.message, createdId: null }
    const r = await applyProposal(p, { activeTaskId, resolvedIds })
    return { kind: p.kind, ok: r.ok, message: r.message, createdId: resolvedIds.get(p.id) ?? null }
  } catch (e) {
    return { kind: p.kind, ok: false, message: e instanceof Error ? e.message : 'Handler threw.', createdId: null }
  }
}

// Start an autonomous run against the current desk, wiring the real dependencies
// and driving the shared store. Safe-default gating: any consequential kind is
// deferred for the user's approval (surfaced as pendingApprovals), never
// auto-applied by the loop.
export async function startAgentRun(goal: string): Promise<AgentRunResult> {
  const store = useAgentLoop.getState()
  if (store.running) return { status: 'blocked', blocker: 'An agent run is already in progress.', rounds: 0, pendingApprovals: [] }
  const taskId = useNodeStore.getState().activeTaskId
  store.start(goal)
  const history = useActionHistory.getState()
  const result = await runAgentLoop(
    { goal, taskId },
    {
      step: (input) => window.api.agent.step(input),
      applyAction: applyActionReal,
      isGated: (p) => !isAutoApplyable(p),
      onStep: (s) => useAgentLoop.getState().pushStep(s),
      beginBatch: () => history.beginBatch(),
      endBatch: (label) => history.endBatch(label)
    }
  )
  useAgentLoop.getState().finish(result.status, result.blocker, result.pendingApprovals)
  return result
}
