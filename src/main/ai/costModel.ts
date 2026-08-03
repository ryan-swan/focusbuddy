import { estimateCostMicros } from './aiCost'

// AI unit-economics model (PLX-AI-031). Two things the requirement asks for:
//   1. A published unit-economics model, the model below plus docs/ai-unit-economics.md.
//   2. Reporting fully-loaded AI cost per active user, computed from REAL recorded
//      token usage via costFromInvocations. Per-tenant reporting (PLX-MET-011)
//      additionally needs production telemetry and is out of scope here.
//
// The model is deterministic and its assumptions are explicit inputs, never hidden
// constants, so a reader can re-derive the number with their own usage profile and
// negotiated rates. Costs are in micro-dollars (1e-6 USD) so they sum as integers.

// One AI operation's representative shape and how often an active user runs it.
export interface OpProfile {
  op: string
  model: string
  inputTokens: number
  outputTokens: number
  perActiveUserPerMonth: number
}

// A single recorded invocation, as the orchestrator's invocation accounting
// produces it (real token counts from the provider's usage field).
export interface InvocationRecord {
  model: string
  inputTokens: number
  outputTokens: number
}

// Modelled fully-loaded AI cost per active user per month, in micro-dollars, from a
// usage profile. This is the published model: assumptions in, cost out.
export function modelledCostPerActiveUserMicros(profile: readonly OpProfile[]): number {
  return profile.reduce(
    (sum, p) => sum + estimateCostMicros(p.model, p.inputTokens, p.outputTokens) * p.perActiveUserPerMonth,
    0
  )
}

// Actual cost from recorded invocations, in micro-dollars. Divide by the active-user
// count for a real per-active-user figure. Uses the same rate table as the model, so
// modelled and actual are directly comparable.
export function costFromInvocations(invocations: readonly InvocationRecord[]): number {
  return invocations.reduce((sum, i) => sum + estimateCostMicros(i.model, i.inputTokens, i.outputTokens), 0)
}

// Real cost per active user, in micro-dollars, from recorded invocations over the
// period and the number of distinct active users in that period.
export function actualCostPerActiveUserMicros(
  invocations: readonly InvocationRecord[],
  activeUsers: number
): number {
  if (activeUsers <= 0) return 0
  return Math.round(costFromInvocations(invocations) / activeUsers)
}

export const microsToUsd = (micros: number): number => micros / 1_000_000
