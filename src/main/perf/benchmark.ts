// Minimal benchmark helper (spec §58). Measures the wall-clock latency of an
// operation over many iterations and reports percentiles, so a core operation can
// be checked against its spec budget under a seeded load.

export interface Percentiles {
  runs: number
  p50: number
  p95: number
  p99: number
  max: number
}

// Run `fn` `iterations` times, return latency percentiles in milliseconds. A short
// warm-up excludes first-call JIT/allocation noise so the numbers reflect steady
// state.
export function measure(fn: () => void, iterations = 200, warmup = 20): Percentiles {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = new Array(iterations)
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    samples[i] = performance.now() - t0
  }
  samples.sort((a, b) => a - b)
  const at = (q: number): number => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]
  return { runs: iterations, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: samples[samples.length - 1] }
}

export interface BudgetCheck extends Percentiles {
  operation: string
  profile: string
  budgetP99Ms: number
  withinBudget: boolean
}

export function checkBudget(operation: string, profile: string, p: Percentiles, budgetP99Ms: number): BudgetCheck {
  return { operation, profile, ...p, budgetP99Ms, withinBudget: p.p99 <= budgetP99Ms }
}
