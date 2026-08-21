import ChatPanel from '../ChatPanel'

// The Plexii hub — the AI's page in the main pane (view.kind 'plexii'). It is
// deliberately nothing but the existing conversational engine in its page
// dressing: same store, same conversations, same panel as the pill overlay.
// One AI, many doors. While this view is showing, AssistantOverlay suppresses
// the pill (the page IS the assistant — the same rule focus mode uses), so
// ChatPanel's one-instance invariant holds.
export default function PlexiiHubView(): JSX.Element {
  return (
    <div className="h-full min-h-0 bg-[var(--surface-base)]" data-testid="plexii-hub">
      <ChatPanel page />
    </div>
  )
}
