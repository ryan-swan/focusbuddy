import MessagesView from '../../views/MessagesView'

// Assistant → PlexiChat tab (DEC-121, operator direction: "the chat tab that
// allows me to message people in my workspace — I want that functionality to
// exist here in this floating AI assistant"). It IS the Office Chat view —
// the same MessagesView, the same messaging store, the same conversations,
// groups, channels and folders — in its compact dressing: one pane at a time
// (the list, then the thread with a way back) because the panel has no width
// to give two.

export default function AssistantMessagesTab(): JSX.Element {
  return (
    <div className="h-full min-h-0" data-testid="assistant-tab-messages-body">
      <MessagesView compact />
    </div>
  )
}
