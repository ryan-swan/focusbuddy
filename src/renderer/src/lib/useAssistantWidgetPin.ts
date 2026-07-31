import { useEffect, useRef } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import { useNodeStore } from '../stores/nodes'
import { useChatStore, NEW_CHAT_KEY } from '../stores/chat'
import { useAssistantChrome } from '../stores/assistantChrome'
import { useAssistantContext } from './assistantContext'
import { shouldAutoPin, shouldClearPin } from './assistantPin'
import {
  activeMentions,
  isMentionableWidget,
  mentionFromWidget,
  mentionKey
} from './assistantMentions'

// The performing half of click-to-mention: subscribes to the widget activation
// signal WidgetFrame already emits (setActive on click) and turns qualifying
// changes into a reference on the chat store; drops references whose widget
// disappears. Mounted once, in AssistantOverlay, which never unmounts, so the
// lifecycle rules keep running even while the panel is closed.
//
// Phase 4.3 converged this with @-mentions (plan D7/D8): a click and a typed
// "@" now produce the SAME kind of chip in the SAME layer. Only the destination
// changed — the decision rules in lib/assistantPin (pure, unit-tested) are
// untouched and still the only thing deciding when a click counts, because they
// were right about that already.
//
// What DID change, deliberately: a click no longer REPLACES the previous
// reference. The layer holds several — the operator's ask was "you can @ mention
// multiple documents and they are referenced immediately together" — so a
// second click adds a second chip, up to the cap.
export function useAssistantWidgetPin(): void {
  const open = useAssistantChrome((s) => s.open)
  const view = useViewStore((s) => s.view)
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)
  const focusedWidgetId = useWidgetStore((s) => s.focusedWidgetId)
  const widgets = useWidgetStore((s) => s.widgets)
  const widgetsLoading = useWidgetStore((s) => s.loadingFor) !== null
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  useAssistantContext()
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const mentions = useChatStore((s) => s.mentions)
  const addMentionRef = useChatStore((s) => s.addMentionRef)
  const removeMentionRef = useChatStore((s) => s.removeMentionRef)

  // Phase 4.5: references belong to the CONVERSATION, not the screen.
  const threadKey = activeConversationId ?? NEW_CHAT_KEY
  // There is no "following a conversation from elsewhere" state any more — a
  // conversation is never replaced by navigation, so a canvas click can never
  // hijack one that belongs to another screen.
  const followingElsewhere = false
  const onDeskView = view.kind === 'task' || view.kind === 'project-dashboard'
  // Same predicate 3a.2 suppresses the overlay on: focus mode only truly shows
  // on a desk screen — a stale focusedWidgetId elsewhere is not focus mode.
  const focusModeShowing = onDeskView && focusedWidgetId !== null

  // Reference on a qualifying activation CHANGE. The ref seeds with the
  // mount-time value so whatever was already active never references
  // retroactively.
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
    if (!w || !isMentionableWidget(w.kind)) return
    const ref = mentionFromWidget(w, threadKey)
    if (ref) addMentionRef(ref)
  }, [
    activeWidgetId,
    open,
    onDeskView,
    focusModeShowing,
    followingElsewhere,
    widgets,
    threadKey,
    addMentionRef
  ])

  // Lifecycle: drop a widget reference when its widget disappears from its own
  // desk. The conversation-switch half of shouldClearPin is handled by scoping
  // instead (a reference is only ever shown and sent on its own conversation),
  // so this effect exists for deletion — a chip must not keep claiming a widget
  // that is no longer there.
  useEffect(() => {
    const widgetIds = widgets.map((w) => w.id)
    for (const m of activeMentions(mentions, threadKey)) {
      if (m.kind !== 'widget') continue
      const gone = shouldClearPin(
        {
          widgetId: m.id,
          taskId: m.taskId ?? '',
          title: m.title,
          kind: 'note',
          icon: m.icon,
          threadKey
        },
        { threadKey, activeTaskId, widgetIds, widgetsLoading }
      )
      if (gone) removeMentionRef(threadKey, mentionKey(m))
    }
  }, [mentions, threadKey, activeTaskId, widgets, widgetsLoading, removeMentionRef])
}
