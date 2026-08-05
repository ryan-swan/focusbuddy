// Block-level ephemeral prompt-cache helpers.
//
// Prompt caching is GA on the /v1/messages endpoint. SDK 0.32.1 only types
// `cache_control` under its beta namespace, but the stable client forwards the
// field on the request body and the endpoint honours it — verified live: a
// repeated prefix reports cache_read_input_tokens > 0 with no beta header. We
// build the blocks here (typed locally) and cast once at each call site, so the
// rest of the code stays clean.
//
// The rule these helpers encode: put the large, stable content first as a
// cacheable prefix and the varying content (the user's question, per-turn
// retrieval, timestamps) last as plain blocks. Anthropic caches everything up to
// and including the cacheable block; a later request with an identical prefix
// reads it at ~10% of the input price. Content below the model's token minimum
// simply isn't cached (no error, no cost).

export interface CacheTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

const EPHEMERAL = { type: 'ephemeral' as const }

// A cacheable text block: marks the end of a reusable prefix.
export function cacheable(text: string): CacheTextBlock {
  return { type: 'text', text, cache_control: EPHEMERAL }
}

// A plain (uncached) text block: the varying suffix.
export function plain(text: string): CacheTextBlock {
  return { type: 'text', text }
}

// Build a system value with a cached stable prefix and an uncached dynamic
// suffix. An empty suffix yields a single cached block; an empty prefix yields a
// single plain block. Returns [] for all-empty so the caller can fall back.
export function cachedSystem(stablePrefix: string, dynamicSuffix = ''): CacheTextBlock[] {
  const blocks: CacheTextBlock[] = []
  if (stablePrefix) blocks.push(cacheable(stablePrefix))
  if (dynamicSuffix) blocks.push(plain(dynamicSuffix))
  return blocks
}

// Build a user message content array whose large context is cached and whose
// varying tail (question, conversation) is not. If the context is empty, returns
// a single plain block so short prompts behave exactly as before.
export function cachedUserContent(context: string, tail: string): CacheTextBlock[] {
  if (!context.trim()) return [plain(tail)]
  return [cacheable(context), plain(tail)]
}

// Read the cache token fields off a response usage object. SDK 0.32.1's stable
// Usage type doesn't declare them, but the endpoint returns them, so we read them
// defensively rather than fight the types. Returns zeros when absent.
export function cacheTokens(usage: unknown): { read: number; write: number } {
  const u = usage as
    | { cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    | null
    | undefined
  return { read: u?.cache_read_input_tokens ?? 0, write: u?.cache_creation_input_tokens ?? 0 }
}
