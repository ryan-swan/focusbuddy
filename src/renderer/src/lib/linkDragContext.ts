import { createContext } from 'react'

// Lightweight context so WidgetFrame's "drag-out" link handle can initiate
// the gesture and Canvas can finish it (tracking the cursor, dropping on
// another widget). Keeps the gesture state OUTSIDE the global widget store
// because it's a purely visual, transient interaction — no need to round-
// trip to IPC or persist anything until a link actually gets created.

export interface LinkDragController {
  // Begin a link drag from the given widget. Canvas will start tracking the
  // mouse and rendering the ghost line. mouseup anywhere completes the
  // gesture — Canvas inspects the drop target.
  start: (sourceWidgetId: string) => void
}

export const LinkDragContext = createContext<LinkDragController | null>(null)
