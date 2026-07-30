# AI unit-economics model

This is the published unit-economics model PLX-AI-031 requires before general
availability. It states, in the open, how the fully-loaded AI cost per active user
is derived, so the number can be re-computed by anyone with their own usage profile
and negotiated rates rather than taken on faith. The model and its calculator live in
`src/main/ai/costModel.ts`; the rate table is `src/main/ai/aiCost.ts`.

Nothing here is a claimed actual. These are assumptions, clearly labelled as such.
The actual per-active-user figure is computed from real recorded token usage by
`costFromInvocations` / `actualCostPerActiveUserMicros`, which read the orchestrator's
invocation accounting. Reporting that figure per tenant is PLX-MET-011 and needs
production telemetry, which is out of scope for the local-first build (ADR-0005).

## The formula

For each AI operation a user runs, cost is the provider rate applied to its token
counts:

    op cost = inputTokens/1e6 x inPerM + outputTokens/1e6 x outPerM

Fully-loaded cost per active user per month is the sum over operations of the op cost
times how often an active user runs that operation:

    cost per active user = sum over ops of ( op cost x runs per active user per month )

Rates come from the rate table (USD per million tokens); the shipped defaults are
estimates to be replaced with negotiated rates.

## Assumptions (illustrative usage profile)

These are example inputs, not measured values. Replace them with a real profile once
usage is observed.

| Operation | Model | Input tokens | Output tokens | Runs / active user / month |
|---|---|---|---|---|
| Resume catch-up summary | resume-tier | 1,200 | 400 | 60 |
| Relationship discovery | discovery-tier | 2,000 | 300 | 20 |
| In-desk AI action | action-tier | 1,500 | 600 | 40 |

The token sizes are grounded in the actual prompt shapes (for example the resume
summary caps output near 512 tokens); the run-rates are placeholders.

## How to read the output

`modelledCostPerActiveUserMicros(profile)` returns the modelled cost in
micro-dollars; `microsToUsd` converts it. Because the digest cache serves repeated
identical requests for free, the modelled number is an upper bound the cache pulls
down, and the deterministic fallback (PERF-072) means an AI outage lowers cost
rather than breaking the operation.

## What is real vs modelled

- Modelled: the per-active-user cost from the assumed profile above.
- Real: `actualCostPerActiveUserMicros(invocations, activeUsers)` over recorded
  invocations. This is the honest number once there is usage; before that, the model
  is the estimate and is labelled as one.
- Deferred: per-tenant reporting (PLX-MET-011), which needs production instrumentation.
