// The canvas-click decision rules (Phase 3a.1), pure and store-free — the same
// pattern as lib/assistantQuestion. They decide WHEN a widget click counts as
// the user referencing that widget, and when an existing reference must drop.
// The hook (useAssistantWidgetPin) only performs what they decide.
//
// Phase 4.3 converged click-to-pin with @-mentions: a click and a typed "@" now
// produce the same chip in the same layer (lib/assistantMentions), so what a
// reference IS moved there. These two rules stayed, unchanged, because they were
// always about the GESTURE rather than the reference — and they were right.
//
// Distinct from the two other pin concepts in the tree, deliberately:
//   • stores/chat `pinnedThread` — a CONVERSATION kept across navigation after
//     following a citation.
//   • widgets `pinned`/`pinnedZone` — a widget docked to a canvas corner.

import type { WidgetKind } from '@shared/types'

export interface PinnedWidgetRef {
  widgetId: string
  taskId: string
  title: string
  kind: WidgetKind
  icon: string
  // The conversation this pin belongs to. A pin never follows you to another
  // thread — switching threads clears it (see shouldClearPin).
  threadKey: string
}

// Does this activation change count as "the user clicked a widget to pin it"?
//
// Keyed on activeWidgetId CHANGES, so the widget that happened to be active
// before the panel opened is never pinned retroactively — the gesture is
// "click a widget while the assistant is open", not "have one selected".
// (A click on the already-active widget re-sets the same id and is therefore
// invisible here; clicking any other widget — or the canvas, which clears the
// activation — re-arms it. Accepted limitation, documented.)
export function shouldAutoPin(
  prevActiveId: string | null,
  nextActiveId: string | null,
  opts: {
    panelOpen: boolean
    onDeskView: boolean
    // Focus mode owns its own chat surface; while it shows, desk clicks are
    // focus navigation, not pin gestures.
    focusModeShowing: boolean
    // While the panel is showing a citation-pinned thread from another screen,
    // a click here must not hijack that conversation's reference.
    followingElsewhere: boolean
  }
): boolean {
  if (!opts.panelOpen || !opts.onDeskView) return false
  if (opts.focusModeShowing || opts.followingElsewhere) return false
  return nextActiveId !== null && nextActiveId !== prevActiveId
}

// When must an existing pin clear? (P2: sticky until dismissed, thread switch,
// or the widget disappears. A send does NOT clear it.)
export function shouldClearPin(
  pin: PinnedWidgetRef,
  state: {
    // The conversation the panel is currently on (citation-pinned thread when
    // following one, else the screen's own thread).
    threadKey: string
    activeTaskId: string | null
    // Ids of the widgets currently loaded — meaningful for deletion detection
    // only when they are the pin's own desk's widgets and loading settled.
    widgetIds: readonly string[]
    widgetsLoading: boolean
  }
): boolean {
  if (pin.threadKey !== state.threadKey) return true
  // Deleted or archived out from under the pin: judged only against the pin's
  // own desk's loaded list — absence from another desk's list means nothing,
  // and a mid-load empty list must not nuke a valid pin.
  if (
    !state.widgetsLoading &&
    state.activeTaskId === pin.taskId &&
    !state.widgetIds.includes(pin.widgetId)
  ) {
    return true
  }
  return false
}
