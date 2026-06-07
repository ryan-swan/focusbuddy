// Desk time-travel: debounced snapshot recording. Whenever the active desk
// changes (widget created / edited / removed, or a desk opened), we schedule a
// snapshot a few seconds later. Main dedups identical states, so a quiet desk
// never accumulates duplicates and a burst of edits collapses into one record.

const RECORD_DEBOUNCE_MS = 6000
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function recordSnapshotSoon(taskId: string | null | undefined): void {
  if (!taskId) return
  const existing = timers.get(taskId)
  if (existing) clearTimeout(existing)
  timers.set(
    taskId,
    setTimeout(() => {
      timers.delete(taskId)
      void window.api.snapshots.create(taskId)
    }, RECORD_DEBOUNCE_MS)
  )
}
