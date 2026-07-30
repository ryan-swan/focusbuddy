// AI evaluation framework (spec §70, §72, REQ-AI/AGT/ENG). Provider substitution is
// verifiable by an evaluation suite run against every supported model, and a provider
// is not "supported" without a passing run (AI-004). Every agent has a defined suite
// with recorded pass thresholds (AGT-022). Evaluation runs against every supported
// model per release, with per-prompt-type thresholds (ENG-013). The framework is
// model-agnostic — the invoke is injected — so it runs against any provider and is
// testable without a live key; a live run just supplies the real invoke.

export interface EvalCase {
  id: string
  promptType: string
  input: string
  expect: (output: string) => boolean // the grader
}

export interface EvalCaseResult {
  caseId: string
  promptType: string
  passed: boolean
}

export interface EvalRun {
  model: string
  results: EvalCaseResult[]
  passRateByType: Record<string, number>
  overallPassRate: number
  passed: boolean
}

// Per-prompt-type pass thresholds (ENG-013). A run passes only if EVERY prompt type
// present meets its threshold.
export const PASS_THRESHOLDS: Record<string, number> = {
  'resume-summary': 0.8,
  'relationship-discovery': 0.75,
  default: 0.9
}
export function thresholdFor(promptType: string): number {
  return PASS_THRESHOLDS[promptType] ?? PASS_THRESHOLDS.default
}

export type EvalInvoke = (input: string, promptType: string, model: string) => Promise<string>

// Run a suite against one model and record results with per-type pass rates.
export async function runEvalSuite(model: string, cases: EvalCase[], invoke: EvalInvoke): Promise<EvalRun> {
  const results: EvalCaseResult[] = []
  for (const c of cases) {
    let passed = false
    try {
      passed = c.expect(await invoke(c.input, c.promptType, model))
    } catch {
      passed = false // a failed invocation is a failed case
    }
    results.push({ caseId: c.id, promptType: c.promptType, passed })
  }
  const byType: Record<string, { pass: number; total: number }> = {}
  for (const r of results) {
    const b = (byType[r.promptType] ??= { pass: 0, total: 0 })
    b.total++
    if (r.passed) b.pass++
  }
  const passRateByType: Record<string, number> = {}
  let allTypesMeet = true
  for (const [type, b] of Object.entries(byType)) {
    const rate = b.pass / b.total
    passRateByType[type] = rate
    if (rate < thresholdFor(type)) allTypesMeet = false
  }
  const overallPassRate = results.length ? results.filter((r) => r.passed).length / results.length : 0
  return { model, results, passRateByType, overallPassRate, passed: allTypesMeet && results.length > 0 }
}

// AI-004 — a provider/model is declared supported only after a passing evaluation run.
export function providerSupported(run: EvalRun): boolean {
  return run.passed
}

// AGT-022 — every Agent must have a defined evaluation suite with a recorded
// threshold. The registry is the record; an agent without a registered suite fails
// the check.
interface AgentSuite {
  threshold: number
  caseIds: string[]
}
const AGENT_SUITES = new Map<string, AgentSuite>()
export function registerAgentEvalSuite(agentId: string, threshold: number, caseIds: string[]): void {
  if (caseIds.length === 0) throw new Error(`Agent "${agentId}" eval suite MUST have at least one case (PLX-AGT-022).`)
  AGENT_SUITES.set(agentId, { threshold, caseIds })
}
export function agentHasEvalSuite(agentId: string): boolean {
  const s = AGENT_SUITES.get(agentId)
  return !!s && s.caseIds.length > 0
}

// ENG-013 — a release runs the suite against EVERY supported model. The gate passes
// only if every model's run passes.
export async function releaseEvalRun(models: string[], cases: EvalCase[], invoke: EvalInvoke): Promise<EvalRun[]> {
  const runs: EvalRun[] = []
  for (const m of models) runs.push(await runEvalSuite(m, cases, invoke))
  return runs
}
export function releaseGatePasses(runs: EvalRun[]): boolean {
  return runs.length > 0 && runs.every((r) => r.passed)
}
export function modelsFailingRelease(runs: EvalRun[]): string[] {
  return runs.filter((r) => !r.passed).map((r) => r.model)
}
