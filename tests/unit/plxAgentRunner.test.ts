import { describe, it, expect, vi } from 'vitest'
import { runAgentLoop, formatObservations, type AgentRunDeps } from '../../src/renderer/src/lib/agentRunner'
import type { ActionProposal, AgentStepResult, AgentActionOutcome } from '../../src/shared/types'

// Control-flow tests for the agent loop driver, with fully injected deps (no
// Electron, no real model, no stores). Proves: rounds advance, observations are
// threaded, safe actions apply while gated ones defer, the run always closes its
// undo batch, and the round cap terminates honestly.

const prop = (id: string, kind: string): ActionProposal => ({ id, kind } as unknown as ActionProposal)

function stepResult(over: Partial<AgentStepResult>): AgentStepResult {
  return {
    ok: true,
    narration: 'n',
    actions: [],
    status: 'done',
    blocker: null,
    rawAssistant: '{"narration":"n","actions":[],"status":"done","blocker":null}',
    systemPrompt: 'SYS',
    ...over
  }
}

function makeDeps(over: Partial<AgentRunDeps> = {}): AgentRunDeps & {
  beginBatch: ReturnType<typeof vi.fn>
  endBatch: ReturnType<typeof vi.fn>
  onStep: ReturnType<typeof vi.fn>
  applyAction: ReturnType<typeof vi.fn>
} {
  return {
    step: vi.fn(async () => stepResult({})),
    applyAction: vi.fn(
      async (p: ActionProposal): Promise<AgentActionOutcome> => ({ kind: p.kind, ok: true, message: 'ok', createdId: `${p.id}-new` })
    ),
    isGated: () => false,
    onStep: vi.fn(),
    beginBatch: vi.fn(),
    endBatch: vi.fn(),
    ...over
  } as never
}

describe('formatObservations', () => {
  it('renders applied (with/without id), failed and deferred lines', () => {
    const applied: AgentActionOutcome[] = [
      { kind: 'create-table', ok: true, message: 'Created', createdId: 'tbl1' },
      { kind: 'navigate-to', ok: true, message: '', createdId: null },
      { kind: 'set-cell', ok: false, message: 'row not found', createdId: null }
    ]
    const out = formatObservations(applied, [prop('m1', 'compose-mail')])
    expect(out).toContain('[applied] create-table -> id=tbl1 (Created)')
    expect(out).toContain('[applied] navigate-to')
    expect(out).toContain('[FAILED] set-cell -> error: row not found')
    expect(out).toContain('[deferred] compose-mail')
  })
  it('is honest about an empty round', () => {
    expect(formatObservations([], [])).toMatch(/no actions/i)
  })
})

describe('runAgentLoop', () => {
  it('single done round: one step, undo batch opened+closed, one emitted step', async () => {
    const deps = makeDeps()
    const r = await runAgentLoop({ goal: 'g', taskId: 't' }, deps)
    expect(r.status).toBe('done')
    expect(r.rounds).toBe(1)
    expect(deps.step).toHaveBeenCalledTimes(1)
    expect(deps.beginBatch).toHaveBeenCalledTimes(1)
    expect(deps.endBatch).toHaveBeenCalledTimes(1)
    expect(deps.onStep).toHaveBeenCalledTimes(1)
  })

  it('applies a safe action, threads observations, then finishes on done', async () => {
    const seq = [
      stepResult({ status: 'working', actions: [prop('t1', 'create-task')], rawAssistant: 'RAW0' }),
      stepResult({ status: 'done' })
    ]
    const step = vi.fn(async () => seq.shift()!)
    const deps = makeDeps({ step })
    const r = await runAgentLoop({ goal: 'g', taskId: 't' }, deps)
    expect(r.status).toBe('done')
    expect(r.rounds).toBe(2)
    expect(deps.applyAction).toHaveBeenCalledTimes(1)
    // Round 2's step received the threaded transcript: prior assistant JSON + an
    // OBSERVATIONS user turn naming the applied action.
    const secondCallMessages = step.mock.calls[1][0].messages
    expect(secondCallMessages.some((m) => m.role === 'assistant' && m.content === 'RAW0')).toBe(true)
    expect(secondCallMessages.some((m) => m.role === 'user' && /\[applied\] create-task/.test(m.content))).toBe(true)
  })

  it('defers gated actions for approval instead of applying them', async () => {
    const seq = [
      stepResult({ status: 'working', actions: [prop('m1', 'compose-mail'), prop('t1', 'create-task')] }),
      stepResult({ status: 'done' })
    ]
    const deps = makeDeps({
      step: vi.fn(async () => seq.shift()!),
      isGated: (p) => p.kind === 'compose-mail'
    })
    const r = await runAgentLoop({ goal: 'g', taskId: 't' }, deps)
    expect(r.pendingApprovals.map((p) => p.kind)).toEqual(['compose-mail'])
    // Only the safe action was actually applied.
    expect(deps.applyAction).toHaveBeenCalledTimes(1)
    expect((deps.applyAction as ReturnType<typeof vi.fn>).mock.calls[0][0].kind).toBe('create-task')
  })

  it('terminates honestly at the round cap when the model never says done', async () => {
    const deps = makeDeps({ step: vi.fn(async () => stepResult({ status: 'working' })) })
    const r = await runAgentLoop({ goal: 'g', taskId: 't', maxRounds: 3 }, deps)
    expect(r.rounds).toBe(3)
    expect(r.status).toBe('blocked')
    expect(r.blocker).toMatch(/after 3 rounds/i)
    expect(deps.endBatch).toHaveBeenCalledTimes(1) // batch still closed
  })

  it('closes the undo batch even when a step throws', async () => {
    const deps = makeDeps({
      step: vi.fn(async () => {
        throw new Error('IPC down')
      })
    })
    const r = await runAgentLoop({ goal: 'g', taskId: 't' }, deps)
    expect(r.status).toBe('blocked')
    expect(r.blocker).toBe('IPC down')
    expect(deps.endBatch).toHaveBeenCalledTimes(1)
  })

  it('stops and surfaces the blocker when a step returns not-ok', async () => {
    const deps = makeDeps({
      step: vi.fn(async () => stepResult({ ok: false, status: 'blocked', blocker: 'No AI key configured.' }))
    })
    const r = await runAgentLoop({ goal: 'g', taskId: 't' }, deps)
    expect(r.status).toBe('blocked')
    expect(r.blocker).toBe('No AI key configured.')
    expect(deps.applyAction).not.toHaveBeenCalled()
  })
})
