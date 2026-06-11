// Drop-in replacement for the old ConnectedToolMenu. It keeps the same prop
// shape so each content widget swaps one import, but it renders the full
// unified menu (the eight canonical sections, AI Assist, Create, Convert, ...)
// instead of the thin "Create + connect" list. The widget is looked up from the
// store by id, and any captured selection text becomes the menu's selection so
// AI Assist and Create both inherit it.

import { useWidgetStore } from '../../stores/widgets'
import { buildContextForWidget } from '../../lib/contextMenu/buildContext'
import UnifiedWidgetMenu from './UnifiedWidgetMenu'

export interface UnifiedConnectedMenuProps {
  sourceWidgetId: string
  x: number
  y: number
  onClose: () => void
  selectionContext?: {
    selectionText?: string
    imageUrl?: string
  }
}

export default function UnifiedConnectedMenu(props: UnifiedConnectedMenuProps): JSX.Element | null {
  const widget = useWidgetStore((s) => s.widgets.find((w) => w.id === props.sourceWidgetId))
  if (!widget) return null
  const menuContext = buildContextForWidget(
    widget,
    { clientX: props.x, clientY: props.y },
    { selectionText: props.selectionContext?.selectionText }
  )
  return <UnifiedWidgetMenu menuContext={menuContext} onClose={props.onClose} />
}
