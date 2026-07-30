import { describe, it, expect } from 'vitest'
import {
  runEvalSuite,
  providerSupported,
  registerAgentEvalSuite,
  agentHasEvalSuite,
  releaseEvalRun,
  releaseGatePasses,
  modelsFailingRelease,
  thresholdFor,
  type EvalCase,
  type EvalInvoke
} from '../../src/main/ai/evals'

// AI evaluation framework (spec §70, §72). Model-agnostic; tested with a mock invoke.

const cases: EvalCase[] = [
  { id: 'r1', promptType: 'resume-summary', input: 'a', expect: (o) => o.includes('summary') },
  { id: 'r2', promptType: 'resume-summary', input: 'b', expect: (o) => o.includes('summary') },
  { id: 'r3', promptType: 'resume-summary', input: 'c', expect: (o) => o.includes('summary') }
]

describe('plx_ai_004 — provider supported only after a passing eval run', () => {
  it('test_plx_ai_004_pass_and_fail', async () => {
    const good: EvalInvoke = async () => 'a good summary'
    const goodRun = await runEvalSuite('claude-sonnet-5', cases, good)
    expect(goodRun.passed).toBe(true)
    expect(providerSupported(goodRun)).toBe(true)
    // A model that fails the threshold is NOT supported.
    let n = 0
    const flaky: EvalInvoke = async () => (n++ === 0 ? 'a good summary' : 'nope') // 1/3 pass < 0.8
    const flakyRun = await runEvalSuite('weak-model', cases, flaky)
    expect(flakyRun.passRateByType['resume-summary']).toBeCloseTo(1 / 3)
    expect(flakyRun.passed).toBe(false)
    expect(providerSupported(flakyRun)).toBe(false)
  })
  it('test_plx_ai_004_failed_invocation_is_a_failed_case', async () => {
    const throwing: EvalInvoke = async () => { throw new Error('down') }
    const run = await runEvalSuite('m', cases, throwing)
    expect(run.overallPassRate).toBe(0)
    expect(run.passed).toBe(false)
  })
})

describe('plx_agt_022 — every agent has a defined eval suite with a threshold', () => {
  it('test_plx_agt_022_suite_registry', () => {
    registerAgentEvalSuite('research-agent', 0.8, ['r1', 'r2'])
    expect(agentHasEvalSuite('research-agent')).toBe(true)
    expect(agentHasEvalSuite('undefined-agent')).toBe(false)
    expect(() => registerAgentEvalSuite('empty', 0.8, [])).toThrow(/PLX-AGT-022/)
  })
})

describe('plx_eng_013 — release gate runs against every supported model', () => {
  it('test_plx_eng_013_release_gate', async () => {
    const good: EvalInvoke = async () => 'a good summary'
    const runs = await releaseEvalRun(['claude-sonnet-5', 'claude-opus-5'], cases, good)
    expect(runs).toHaveLength(2)
    expect(releaseGatePasses(runs)).toBe(true)
    // If one model fails, the whole release gate fails and names it.
    let calls = 0
    const oneBad: EvalInvoke = async (_i, _t, model) => (model === 'bad' ? 'nope' : (calls++, 'a good summary'))
    const mixed = await releaseEvalRun(['claude-sonnet-5', 'bad'], cases, oneBad)
    expect(releaseGatePasses(mixed)).toBe(false)
    expect(modelsFailingRelease(mixed)).toContain('bad')
  })
  it('test_eng_013_per_type_thresholds', () => {
    expect(thresholdFor('resume-summary')).toBe(0.8)
    expect(thresholdFor('unknown')).toBe(0.9) // default
  })
})
