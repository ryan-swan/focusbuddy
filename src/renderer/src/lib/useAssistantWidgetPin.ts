import { useEffect, useRef } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import { useNodeStore } from '../stores/nodes'
import { useChatStore } from '../stores/chat'
import { useAssistantChrome } from '../stores/assistantChrome'
import { useAssistantContext } from './assistantContext'
import { isPinnableWidget, pinFromWidget, shouldAutoPin, shouldClearPin } from './assistantPin'

// The performing half of click-to-pin (Phase 3a.1): subscribes to the widget
// activation signal WidgetFrame already emits (setActive on click) and turns
// qualifying changes into a pin on the chat store; clears the pin when its
// thread is left or its widget disappears. All decisions live in
// lib/assistantPin (pure, unit-tested) — this hook only wires them to the
// stores. Mounted once, in AssistantOverlay, which never unmounts, so the
// lifecycle rules keep running even while the panel is closed.
export function useAssistantWidgetPin(): void {
  const open = useAssistantChrome((s) => s.open)
  const view = useViewStore((s) => s.view)
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)
  const focusedWidgetId = useWidgetStore((s) => s.focusedWidgetId)
  const widgets = useWidgetStore((s) => s.widgets)
  const widgetsLoading = useWidgetStore((s) => s.loadingFor) !== null
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const ctx = useAssistantContext()
  const pinnedThread = useChatStore((s) => s.pinnedThread)
  const pinnedWidget = useChatStore((s) => s.pinnedWidget)
  const pinWidget = useChatStore((s) => s.pinWidget)
  const unpinWidget = useChatStore((s) => s.unpinWidget)

  const threadKey = pinnedThread?.key ?? ctx.key
  const followingElsewhere = pinnedThread !== null && pinnedThread.key !== ctx.key
  const onDeskView = view.kind === 'task' || view.kind === 'project-dashboard'
  // Same predicate 3a.2 suppresses the overlay on: focus mode only truly shows
  // on a desk screen — a stale focusedWidgetId elsewhere is not focus mode.
  const focusModeShowing = onDeskView && focusedWidgetId !== null

  // Pin on a qualifying activation CHANGE. The ref seeds with the mount-time
  // value so whatever was already active never pins retroactively.
  const prevActiveRef = useRef<string | null>(activeWidgetId)
  useEffect(() => {
    const prev = prevActiveRef.current
    prevActiveRef.current = activeWidgetId
    if (
      !shouldAutoPin(prev, activeWidgetId, {
        panelOpen: open,
        onDeskView,
        focusModeShowing,
        followingElsewhere
      })
    ) {
      return
    }
    const w = widgets.find((x) => x.id === activeWidgetId)
    if (!w || !isPinnableWidget(w.kind)) return
    pinWidget(pinFromWidget(w, threadKey))
  }, [activeWidgetId, open, onDeskView, focusModeShowing, followingElsewhere, widgets, threadKey, pinWidget])

  // Lifecycle: clear on thread switch or when the widget disappears from its
  // own desk. Runs regardless of panel open state.
  useEffect(() => {
    if (!pinnedWidget) return
    if (
      shouldClearPin(pinnedWidget, {
        threadKey,
        activeTaskId,
        widgetIds: widgets.map((w) => w.id),
        widgetsLoading
      })
    ) {
      unpinWidget()
    }
  }, [pinnedWidget, threadKey, activeTaskId, widgets, widgetsLoading, unpinWidget])
}
