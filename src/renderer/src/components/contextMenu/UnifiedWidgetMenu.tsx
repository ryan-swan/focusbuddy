// Thin surface that turns a MenuContext into the rendered menu. A widget keeps
// the MenuContext it built on right-click in state and renders this; resolveMenu
// produces the CtxMenuItem[] and the existing CanvasContextMenu draws it. This
// is the only React glue the unified system needs on the menu side.

import { useMemo } from 'react'
import CanvasContextMenu from '../CanvasContextMenu'
import { resolveMenu } from '../../lib/contextMenu/resolve'
import type { MenuContext } from '../../lib/contextMenu/types'

interface Props {
  menuContext: MenuContext
  onClose: () => void
}

export default function UnifiedWidgetMenu({ menuContext, onClose }: Props): JSX.Element {
  const items = useMemo(() => resolveMenu(menuContext), [menuContext])
  return (
    <CanvasContextMenu
      x={menuContext.clientPoint.x}
      y={menuContext.clientPoint.y}
      items={items}
      onClose={onClose}
    />
  )
}
