// Click-to-pin decision rules (Phase 3a.1), pure and store-free — the same
// pattern as lib/assistantQuestion. Clicking a widget while the assistant is
// open pins it as the conversation's primary reference (Notion's @-mention
// chip); these rules decide WHEN a click becomes a pin and when an existing pin
// must clear. The hook (useAssistantWidgetPin) only performs what they decide.
//
// Distinct from the two existing pin concepts, deliberately:
//   • stores/chat `pinnedThread` — a CONVERSATION kept across navigation after
//     following a citation.
//   • widgets `pinned`/`pinnedZone` — a widget docked to a canvas corner.
// This one is a widget pinned TO the assistant as reference material.

import type { Widget, WidgetKind } from '@shared/types'
import { ATTACHABLE_WIDGET_KINDS } from '@shared/widgetText'
import { catalogFor } from './widgetCatalog'

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

// Only kinds whose content the shared extractor can genuinely read may be
// pinned. The pin chip promises "this is what the assistant is looking at" —
// pinning a timer or a section would promise content that cannot be sent.
export function isPinnableWidget(kind: WidgetKind): boolean {
  return ATTACHABLE_WIDGET_KINDS.has(kind)
}

export function pinFromWidget(w: Widget, threadKey: string): PinnedWidgetRef {
  const cat = catalogFor(w.kind)
  return {
    widgetId: w.id,
    taskId: w.taskId,
    title: w.title || cat?.label || w.kind,
    kind: w.kind,
    icon: cat?.icon ?? 'widgets',
    threadKey
  }
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
