// Public API contract (spec §63, REQ-API). Operations are named for business intent,
// not generic CRUD (API-002); every response carries the §63.3 envelope with the
// operation's correlationId (API-003) and a permission-filtered flag that never
// discloses what was withheld (API-004); APIs are versioned with breaking changes
// forcing a new version (API-005); mutating operations are idempotent by key
// (API-006); rate limits are enforced and reported (API-007); and query complexity
// is bounded (API-008).

// ── API-002 — business-intent operation names ────────────────────────────────
const CRUD_SHAPED = /^(create|read|update|delete|get|set|put|post|patch)[A-Z_]/
export function isBusinessIntentName(operation: string): boolean {
  return !CRUD_SHAPED.test(operation)
}
export function assertBusinessIntentName(operation: string): void {
  if (!isBusinessIntentName(operation)) {
    throw new Error(`"${operation}" is a CRUD-shaped name; public operations MUST be named for business intent (PLX-API-002).`)
  }
}

// ── API-003 / API-004 — response envelope ────────────────────────────────────
export interface ResponseEnvelope<T> {
  data: T
  correlationId: string // matches the Events the operation generated (API-003)
  permissionContext: { filtered: boolean } // true when any result was withheld (API-004)
}
export function responseEnvelope<T>(data: T, correlationId: string, anyResultWithheld: boolean): ResponseEnvelope<T> {
  return { data, correlationId, permissionContext: { filtered: anyResultWithheld } }
}

// ── API-005 — versioning ─────────────────────────────────────────────────────
export type ChangeKind = 'additive' | 'breaking'
// A breaking change requires a new API version; an additive change may stay.
export function nextApiVersion(current: number, change: ChangeKind): number {
  return change === 'breaking' ? current + 1 : current
}

// ── API-006 — idempotency keys ───────────────────────────────────────────────
export interface IdempotencyStore {
  seen: Map<string, unknown>
}
export function newIdempotencyStore(): IdempotencyStore {
  return { seen: new Map() }
}
// A mutating operation returns the original result on retry with the same key
// (API-006), so a duplicate request never applies the mutation twice.
export function idempotent<T>(store: IdempotencyStore, key: string, compute: () => T): { result: T; replayed: boolean } {
  if (store.seen.has(key)) return { result: store.seen.get(key) as T, replayed: true }
  const result = compute()
  store.seen.set(key, result)
  return { result, replayed: false }
}

// ── API-007 — rate limits ────────────────────────────────────────────────────
export interface RateLimitState {
  limit: number
  remaining: number
  allowed: boolean
}
export function rateLimit(used: number, limit: number): RateLimitState {
  const remaining = Math.max(0, limit - used)
  return { limit, remaining, allowed: used < limit }
}

// ── API-008 — bounded query complexity ───────────────────────────────────────
export const MAX_QUERY_DEPTH = 8
export function queryWithinBounds(depth: number, maxDepth = MAX_QUERY_DEPTH): boolean {
  return depth <= maxDepth
}
export function assertQueryBounds(depth: number, maxDepth = MAX_QUERY_DEPTH): void {
  if (!queryWithinBounds(depth, maxDepth)) {
    throw new Error(`Query depth ${depth} exceeds the bound ${maxDepth} (PLX-API-008).`)
  }
}
