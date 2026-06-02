// Reusable right-click "Create + auto-connect" menu.
//
// Any content-surface widget (Sticky / Note / Markdown / Page / Table /
// Field) wraps its content area with an onContextMenu handler that:
//   1. Captures the click coords.
//   2. Optionally inspects the selection (text range, image, cell, field)
//      to pass `selectionContext` for kind-specific menu prefixes.
//   3. Opens this menu component, which renders a CanvasContextMenu with
//      the standard CREATE_AND_CONNECT_MENU entries plus any kind-
//      specific seed-content overrides.
//
// On click, this component:
//   - calls `createConnectedTool(sourceWidgetId, kind)` with the chosen
//     kind (and optional seed content from the selection)
//   - closes itself via the parent's onClose
//
// The persisted widget_link is created inside createConnectedTool. The
// LinkOverlay picks it up via its store subscription on the next render.

import { useState } from 'react'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import {
  CREATE_AND_CONNECT_MENU,
  createConnectedTool,
  type CreateMenuEntry
} from '../lib/createConnectedTool'

export interface ConnectedToolMenuProps {
  sourceWidgetId: string
  x: number
  y: number
  onClose: () => void
  /**
   * Optional kind-specific seed. The right-click surface can pass:
   *   - selectionText: the user's selected text (becomes the seed
   *     content of the new tool when it makes sense — e.g. sticky)
   *   - imageUrl: a selected image's src (becomes content of a new
   *     image-kind tool; not yet routed)
   *   - fieldDef: a field definition that becomes a new table column
   *     when the user picks "Table" from a field's right-click menu
   */
  selectionContext?: {
    selectionText?: string
    imageUrl?: string
  }
}

export default function ConnectedToolMenu(props: ConnectedToolMenuProps): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)

  async function spawn(entry: CreateMenuEntry): Promise<void> {
    if (busy) return
    setBusy(entry.kind)
    const result = await createConnectedTool({
      sourceWidgetId: props.sourceWidgetId,
      kind: entry.kind,
      // For text-friendly kinds, prefill from the selection so the
      // user doesn't have to retype. The other kinds either don't
      // accept text content (color, file) or have richer schemas
      // (table, page) we don't try to inject from a plain text
      // selection.
      content:
        entry.seedContent ??
        (props.selectionContext?.selectionText && isTextKind(entry.kind)
          ? props.selectionContext.selectionText.slice(0, 1000)
          : undefined)
    })
    setBusy(null)
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('[ConnectedToolMenu] spawn failed:', result.error)
    }
    props.onClose()
  }

  const items: CtxMenuItem[] = [
    {
      label: 'Create + connect',
      icon: 'hub',
      disabled: true
    },
    { separator: true },
    ...CREATE_AND_CONNECT_MENU.map<CtxMenuItem>((entry) => ({
      label: entry.label,
      icon: entry.icon,
      disabled: busy !== null,
      onClick: () => void spawn(entry)
    }))
  ]

  return (
    <CanvasContextMenu
      x={props.x}
      y={props.y}
      items={items}
      onClose={props.onClose}
    />
  )
}

function isTextKind(kind: string): boolean {
  return kind === 'sticky' || kind === 'note' || kind === 'markdown' || kind === 'page'
}
