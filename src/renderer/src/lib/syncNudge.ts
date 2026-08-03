// A tiny decoupling seam so a local edit can trigger an immediate push instead of
// waiting for the 20s sync poll. The workspace sync loop registers its runner here
// on start; the stores call nudgeSync() right after a local mutation. Kept in its
// own module (not workspaceSync.ts) so the stores don't import the sync loop, which
// itself imports the stores — that would be a require cycle.
//
// Debounced: a burst of edits (dragging a widget, typing) collapses into one push
// shortly after the user pauses, and the 20s interval remains as the backstop.

type Runner = () => void

let runner: Runner | null = null
let timer: ReturnType<typeof setTimeout> | null = null

const NUDGE_DELAY_MS = 900

export function registerSyncNudge(fn: Runner | null): void {
  runner = fn
}

export function nudgeSync(): void {
  if (!runner) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    runner?.()
  }, NUDGE_DELAY_MS)
}
