// Estimated model pricing, used to turn REAL token counts (from the API's usage
// field) into an approximate dollar figure for the usage view. Token totals are
// exact; only the dollar estimate depends on these rates. They are DEFAULTS —
// update them to your actual/negotiated rates. Rates are USD per million tokens.

export interface Rate {
  inPerM: number
  outPerM: number
}

// Matched against the resolved model id (e.g. claude-opus-4-8) by family.
export const PRICING: Array<{ match: RegExp; rate: Rate }> = [
  { match: /opus/i, rate: { inPerM: 15, outPerM: 75 } },
  { match: /sonnet/i, rate: { inPerM: 3, outPerM: 15 } },
  { match: /haiku/i, rate: { inPerM: 0.8, outPerM: 4 } },
  { match: /fable/i, rate: { inPerM: 1, outPerM: 5 } }
]

// A safe middle-tier default when the model family is unrecognised.
export const DEFAULT_RATE: Rate = { inPerM: 3, outPerM: 15 }

export function rateFor(model: string): Rate {
  return PRICING.find((p) => p.match.test(model))?.rate ?? DEFAULT_RATE
}

// Estimated cost in micro-dollars (1e-6 USD) so it can be summed as an integer
// counter without floating-point drift. Divide by 1e6 for dollars.
export function estimateCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const r = rateFor(model)
  const usd = (Math.max(0, inputTokens) / 1e6) * r.inPerM + (Math.max(0, outputTokens) / 1e6) * r.outPerM
  return Math.round(usd * 1e6)
}
