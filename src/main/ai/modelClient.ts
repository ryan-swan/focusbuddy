// The single model-client seam (spec PLX-AI-001). This is the ONLY module that
// holds a runtime dependency on a provider SDK — it is the one place that imports
// the value `Anthropic` and calls `new Anthropic(...)`. Every other service obtains
// a client from here and may keep a TYPE-ONLY import of the SDK for message shapes
// (type imports are erased at compile time and are not a runtime dependency).
//
// Centralising instantiation is what makes provider substitution and accounting
// possible from one place (AI-001..AI-004), rather than scattered `new Anthropic()`
// calls no one can govern.

import Anthropic from '@anthropic-ai/sdk'

// The client type, re-exported so callers annotate with `ModelClient` (or a
// type-only SDK import) instead of value-importing the SDK.
export type ModelClient = Anthropic

// A plain BYOK client, cached per key so a repeated call reuses the connection and
// a key change swaps cleanly.
const byKey = new Map<string, Anthropic>()
export function getModelClient(key: string): Anthropic {
  let c = byKey.get(key)
  if (!c) {
    c = new Anthropic({ apiKey: key })
    byKey.set(key, c)
  }
  return c
}

// Construct a client with explicit options (used by the credit-mode proxy path,
// which needs a custom baseURL, headers and fetch). Still instantiated HERE so the
// SDK dependency stays in one module.
export function createAnthropic(opts: ConstructorParameters<typeof Anthropic>[0]): Anthropic {
  return new Anthropic(opts)
}

// Drop cached clients (called on a key or session change).
export function invalidateModelClients(): void {
  byKey.clear()
}
