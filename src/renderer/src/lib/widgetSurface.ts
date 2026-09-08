import { createContext, useContext } from 'react'

// Where a widget is being rendered.
//
// 'canvas' is the desk: the object is absolutely positioned at its own x/y,
// draggable and resizable through react-rnd. 'embedded' is anywhere that gives
// the object a box and expects it to fill it -- a dashboard card, today.
//
// The distinction has to exist because the two are genuinely different: an
// object dropped on a dashboard has no meaningful desk coordinates, and letting
// someone drag it there would write nonsense positions back to the desk it
// still belongs to. Embedded mode fills its parent and cannot be moved, so that
// is structurally impossible rather than merely discouraged.

export type WidgetSurface = 'canvas' | 'embedded'

export const WidgetSurfaceContext = createContext<WidgetSurface>('canvas')

export function useWidgetSurface(): WidgetSurface {
  return useContext(WidgetSurfaceContext)
}
