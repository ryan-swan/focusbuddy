import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import ConnectedToolMenu from '../ConnectedToolMenu'

interface Props {
  widget: Widget
  inline?: boolean
}

export default function NoteWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [text, setText] = useState(widget.content)
  const lastSavedRef = useRef(widget.content)
  // Mirror the latest text each render so the unmount-flush closure reads the
  // CURRENT value; hold the debounce timer in a ref so the flush can cancel it.
  const textRef = useRef(widget.content)
  textRef.current = text
  const saveTimerRef = useRef<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; selectionText?: string } | null>(null)

  useEffect(() => {
    setText(widget.content)
    lastSavedRef.current = widget.content
  }, [widget.id, widget.content])

  useEffect(() => {
    if (text === lastSavedRef.current) return
    saveTimerRef.current = window.setTimeout(() => {
      lastSavedRef.current = text
      saveTimerRef.current = null
      void update(widget.id, { content: text })
    }, 600)
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    }
  }, [text, widget.id, update])

  // Flush any pending save on unmount. The canvas remounts every widget when
  // layoutVersion bumps (pin/unpin/group/auto-arrange/AI-accept); without this,
  // the un-debounced tail of what you just typed is silently lost. Mirrors the
  // unmount-flush already present in MarkdownWidget.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        if (textRef.current !== lastSavedRef.current) {
          void update(widget.id, { content: textRef.current })
        }
      }
    }
  }, [update, widget.id])

  const content = (
    <div className={`h-full w-full bg-[#fefcf6] ${inline ? 'p-8' : 'p-4'}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notes, thoughts, anything that doesn't fit on a sticky…"
        onContextMenu={(e) => {
          // Shift-right-click for the browser's native menu (cut/copy/paste).
          if (e.shiftKey) return
          e.preventDefault()
          const sel = window.getSelection()?.toString() ?? ''
          setCtxMenu({ x: e.clientX, y: e.clientY, selectionText: sel })
        }}
        className={`w-full h-full resize-none bg-transparent text-stone-900 leading-relaxed focus:outline-none placeholder:text-stone-500/40 font-serif ${
          inline ? 'text-base' : 'text-sm'
        }`}
      />
      {ctxMenu && (
        <ConnectedToolMenu
          sourceWidgetId={widget.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          selectionContext={{ selectionText: ctxMenu.selectionText }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="note" headerAccent="bg-stone-200/70">
      {content}
    </WidgetFrame>
  )
}
