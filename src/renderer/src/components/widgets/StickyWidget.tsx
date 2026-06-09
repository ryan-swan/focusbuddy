import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import ConnectedToolMenu from '../ConnectedToolMenu'

const COLORS = ['#fef08a', '#fbcfe8', '#bae6fd', '#bbf7d0', '#fed7aa']

interface Props {
  widget: Widget
  inline?: boolean
}

export default function StickyWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [text, setText] = useState(widget.content)
  const lastSavedRef = useRef(widget.content)
  // Mirror the latest text each render so the unmount-flush closure reads the
  // CURRENT value (closing over `text` would capture a stale one); hold the
  // debounce timer in a ref so the flush effect can cancel + flush it.
  const textRef = useRef(widget.content)
  textRef.current = text
  const saveTimerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Right-click "Create + connect" menu position. Opens on contextmenu
  // over the textarea (or the sticky body). Closes on click-away.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; selectionText?: string } | null>(null)

  // Auto-grow: when the typed text overflows the visible area, grow the sticky
  // by exactly the overflow so the whole note is readable without scrolling.
  // Grow-only (never shrinks below a manual resize) and capped so a runaway
  // paste can't fill the canvas. Measuring overflow (scrollHeight - clientHeight)
  // avoids guessing the frame chrome height.
  const MAX_STICKY_HEIGHT = 640
  useEffect(() => {
    if (inline) return
    const ta = textareaRef.current
    if (!ta || ta.clientHeight === 0) return
    const overflow = ta.scrollHeight - ta.clientHeight
    if (overflow > 4) {
      const target = Math.min(MAX_STICKY_HEIGHT, widget.height + overflow)
      if (target > widget.height) void update(widget.id, { height: Math.round(target) })
    }
  }, [text, widget.height, widget.id, inline, update])

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

  const bgColor = widget.color ?? '#fef08a'

  // The body uses the user's chosen pastel as its fill in light/dark/atelier
  // modes. In futuristic mode a CSS override below replaces the fill with
  // a deep violet glass; the user's pastel choice is then preserved as a
  // 3px top accent strip via `--fb-sticky-tint` so each note remains
  // distinguishable without breaking the theme's cohesion.
  const content = (
    <div
      data-fb-sticky-body
      className="fb-sticky-body h-full w-full p-3 flex flex-col gap-2"
      style={
        { backgroundColor: bgColor, '--fb-sticky-tint': bgColor } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => void update(widget.id, { color: c })}
            className="h-3 w-3 rounded-full border border-black/10 hover:scale-125 transition-transform"
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note..."
        onContextMenu={(e) => {
          // Right-click → offer "Create + connect" menu seeded with the
          // current text selection. We deliberately don't preventDefault
          // unconditionally; if the user is in a long sticky and wants
          // the standard browser cut/copy/paste menu, holding Shift
          // bypasses ours.
          if (e.shiftKey) return
          e.preventDefault()
          const sel = window.getSelection()?.toString() ?? ''
          setCtxMenu({ x: e.clientX, y: e.clientY, selectionText: sel })
        }}
        className={`fb-sticky-textarea w-full flex-1 resize-none bg-transparent text-stone-900 font-hand focus:outline-none placeholder:text-stone-700/40 ${
          inline ? 'text-2xl' : 'text-lg'
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
    <WidgetFrame widget={widget} headerLabel="sticky" headerAccent="bg-black/5">
      {content}
    </WidgetFrame>
  )
}
