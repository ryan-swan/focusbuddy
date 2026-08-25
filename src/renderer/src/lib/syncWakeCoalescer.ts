// Single-flight guard for the workspace sync cycle, with wake coalescing.
//
// The problem this solves: a `sharedWorkspaceChanged` / `orgWorkspaceChanged`
// wake that arrives while a cycle is already in flight used to be silently
// discarded (the old `if (running) return 0` guard) — no queue, no re-arm — so
// the receiver fell back to the 20s interval. Cycles are long in proportion to
// dirty-row count (serial PUTs), so on an active shared desk two peers each
// drop the other's wakes and collaboration lags by many seconds.
//
// The fix: remember that a wake landed mid-cycle and run exactly ONE follow-up
// cycle when the current one finishes. N wakes during a cycle coalesce into one
// re-run; wakes during the re-run coalesce into the next; quiet input converges
// immediately. No timers, no queue, no transport changes.
//
// Kept dependency-free so it is unit-testable without touching stores or fetch.
export const syncWakeCoalescer = {
  running: false,
  rerunRequested: false,

  // Call at cycle start. True = proceed (slot acquired). False = a cycle is
  // already in flight; the wake has been recorded for a coalesced follow-up.
  enter(): boolean {
    if (this.running) {
      this.rerunRequested = true
      return false
    }
    this.running = true
    return true
  },

  // Call at cycle end (finally). True = at least one wake landed mid-cycle and
  // the caller should run one follow-up cycle now.
  exit(): boolean {
    this.running = false
    const rerun = this.rerunRequested
    this.rerunRequested = false
    return rerun
  }
}
