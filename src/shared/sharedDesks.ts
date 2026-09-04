// Shared-desk reconciliation helpers.
//
// These are pure and live in `shared` because both sides need them: the main
// process owns the local materialised rows, and the renderer owns the sync loop
// that decides what to prune. The diff was previously written twice — a tested
// helper in main that nothing called, and an untested inline loop in the
// renderer that did the real work. One of those two was going to drift.

/**
 * Which locally-materialised shared desks are no longer granted — a revoke.
 * The local set minus the server's granted set.
 *
 * Empty ids are dropped: they identify no desk, and passing one on would only
 * spend a round trip to be told nothing matched.
 */
export function rootsToPrune(local: readonly string[], granted: readonly string[]): string[] {
  const g = new Set(granted)
  return local.filter((r) => !!r && !g.has(r))
}
