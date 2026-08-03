// A minimal in-process event bus that decouples the things that HAPPEN in the
// workspace (a table row is added, a task is completed) from the PlexiFlow engine
// that reacts to them. Living in its own module breaks what would otherwise be a
// circular import: the flow engine imports nodes/tables to perform actions, and
// nodes/tables need to announce events the flow engine listens for.
//
// Re-entrancy guard: while a flow is running, events are suppressed. Without this
// a flow whose action adds a table row would re-trigger any "on row added" flow,
// which could cascade or loop. The depth counter (not a boolean) keeps this correct
// even if flow runs nest or overlap.

export type AutomationEvent =
  | { name: 'task-completed'; nodeId: string }
  | { name: 'row-added'; tableId: string }

export type AutomationEventName = AutomationEvent['name']

let dispatcher: ((e: AutomationEvent) => void) | null = null
let suppressDepth = 0

/** The flow engine registers its handler here at startup. */
export function setAutomationDispatcher(fn: (e: AutomationEvent) => void): void {
  dispatcher = fn
}

/** Announce that something happened. No-op until a dispatcher is registered, and
 * suppressed while a flow is running so flow-driven mutations don't re-trigger. */
export function emitAutomationEvent(e: AutomationEvent): void {
  if (suppressDepth > 0 || !dispatcher) return
  try {
    dispatcher(e)
  } catch {
    // A reacting flow must never break the mutation that triggered it.
  }
}

/** Run an async block with event emission suppressed (used around a flow run). */
export async function withAutomationSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth++
  try {
    return await fn()
  } finally {
    suppressDepth--
  }
}
