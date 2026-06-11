// Renders the unified Haptyx menu for a non-editable right-click inside a
// browser widget. The main process forwards the classified target (text /
// image / link / video) via webview:context-menu; we look up which browser
// widget the event came from, translate the in-page coordinates to screen
// coordinates using the webview element's rect, build a menu context with the
// selection and target payload, and open the unified menu. Mounted once.

import { useEffect, useState } from 'react'
import { useWidgetStore } from '../../stores/widgets'
import { lookupWebview } from '../../lib/webviewRegistry'
import { buildContextForWidget } from '../../lib/contextMenu/buildContext'
import type { MenuContext } from '../../lib/contextMenu/types'
import UnifiedWidgetMenu from './UnifiedWidgetMenu'

export default function BrowserContextMenu(): JSX.Element | null {
  const [menuContext, setMenuContext] = useState<MenuContext | null>(null)

  useEffect(() => {
    const off = window.api.contextMenu.onWebviewContextMenu((p) => {
      const entry = lookupWebview(p.webContentsId)
      if (!entry) return
      const widget = useWidgetStore.getState().widgets.find((w) => w.id === entry.widgetId)
      if (!widget) return
      const rect = entry.el.getBoundingClientRect()
      setMenuContext(
        buildContextForWidget(
          widget,
          { clientX: rect.left + p.x, clientY: rect.top + p.y },
          {
            selectionText: p.selectionText,
            granularity: 'browser-target',
            payload: { linkURL: p.linkURL, srcURL: p.srcURL, mediaType: p.mediaType }
          }
        )
      )
    })
    return off
  }, [])

  if (!menuContext) return null
  return <UnifiedWidgetMenu menuContext={menuContext} onClose={() => setMenuContext(null)} />
}
