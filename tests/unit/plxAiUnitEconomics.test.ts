import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  modelledCostPerActiveUserMicros,
  costFromInvocations,
  actualCostPerActiveUserMicros,
  microsToUsd,
  type OpProfile,
  type InvocationRecord
} from '../../src/main/ai/costModel'

// PLX-AI-031 — the platform reports fully-loaded AI cost per active user and
// publishes a unit-economics model before GA. This verifies the model computes,
// that actual cost is derivable from real recorded invocations, and that the model
// is actually published as a document.

const DOC = resolve(process.cwd(), 'docs/ai-unit-economics.md')

describe('plx_ai_031 — AI unit-economics model', () => {
  it('test_plx_ai_031_model_computes_cost_per_active_user_from_a_profile', () => {
    const profile: OpProfile[] = [
      { op: 'resume', model: 'sonnet', inputTokens: 1200, outputTokens: 400, perActiveUserPerMonth: 60 },
      { op: 'action', model: 'sonnet', inputTokens: 1500, outputTokens: 600, perActiveUserPerMonth: 40 }
    ]
    const micros = modelledCostPerActiveUserMicros(profile)
    expect(micros).toBeGreaterThan(0)
    // More usage costs strictly more.
    const heavier = modelledCostPerActiveUserMicros(
      profile.map((p) => ({ ...p, perActiveUserPerMonth: p.perActiveUserPerMonth * 2 }))
    )
    expect(heavier).toBe(micros * 2)
    expect(microsToUsd(1_000_000)).toBe(1)
  })

  it('test_plx_ai_031_actual_cost_derived_from_real_invocations', () => {
    // Fully-loaded cost from REAL recorded token usage, divided across active users.
    const invocations: InvocationRecord[] = [
      { model: 'sonnet', inputTokens: 1000, outputTokens: 500 },
      { model: 'sonnet', inputTokens: 2000, outputTokens: 800 }
    ]
    const total = costFromInvocations(invocations)
    expect(total).toBe(
      costFromInvocations([invocations[0]]) + costFromInvocations([invocations[1]])
    )
    const perUser = actualCostPerActiveUserMicros(invocations, 4)
    expect(perUser).toBe(Math.round(total / 4))
    expect(actualCostPerActiveUserMicros(invocations, 0)).toBe(0) // no divide-by-zero
  })

  it('test_plx_ai_031_model_is_published_as_a_document', () => {
    expect(existsSync(DOC)).toBe(true)
    const text = readFileSync(DOC, 'utf8')
    expect(text).toContain('PLX-AI-031')
    expect(text.toLowerCase()).toContain('cost per active user')
    expect(text.toLowerCase()).toContain('assumption') // honest: labelled assumptions, not fake actuals
  })
})
