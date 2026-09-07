import { AttentionWidget } from '../../views/attentionWidgets'
import { useCaptureConsole } from '../../../stores/captureConsole'

// Assistant → Attention tab (DEC-121, operator direction: "a view of all your
// attention items, which should look pretty familiar or similar to the home
// screen attention widget — the widget that you drag onto a desk"). It IS that
// widget — the same component the home canvas and the desk render, with the
// same section pills, rows, verbs and doors — shown uncapped and scrolling,
// under its own remembered section so the panel and the home widget never
// fight over which slice is open.

export default function AssistantAttentionTab(): JSX.Element {
  // DEC-131 — a + on the tab captures a new item through the house capture
  // prompt (the Attention page's own Capture door: classify first, then file).
  const openConsole = useCaptureConsole((s) => s.openConsole)
  return (
    <div className="h-full min-h-0" data-testid="assistant-tab-attention-body">
      <AttentionWidget
        size="lg"
        storageKey="attention.assistant.section"
        limit={Number.POSITIVE_INFINITY}
        scroll
        onCapture={() => openConsole()}
      />
    </div>
  )
}
