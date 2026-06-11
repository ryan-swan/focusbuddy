// React context that carries a widget's frame management callbacks down to its
// body. WidgetFrame provides it; the body's content menu (UnifiedConnectedMenu)
// reads it so a right-click on a widget's content offers the exact same unified
// menu, including make-task / share / duplicate, as a right-click on its header.

import { createContext, useContext } from 'react'
import type { FrameCallbacks } from './types'

const FrameCallbacksContext = createContext<FrameCallbacks | undefined>(undefined)

export const FrameCallbacksProvider = FrameCallbacksContext.Provider

export function useFrameCallbacks(): FrameCallbacks | undefined {
  return useContext(FrameCallbacksContext)
}
