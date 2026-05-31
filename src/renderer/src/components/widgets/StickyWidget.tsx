import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'

const COLORS = ['#fef08a', '#fbcfe8', '#bae6fd', '#bbf7d0', '#fed7aa']

interface Props {
  widget: Widget
  inline?: boolean
}

export default function StickyWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [text, setText] = useState(widget.content)
  const lastSavedRef = useRef(widget.content)

  useEffect(() => {
    setText(widget.content)
    lastSavedRef.current = widget.content
  }, [widget.id, widget.content])

  useEffect(() => {
    if (text === lastSavedRef.current) return
    const handle = window.setTimeout(() => {
      lastSavedRef.current = text
      void update(widget.id, { content: text })
    }, 600)
    return () => window.clearTimeout(handle)
  }, [text, widget.id, update])

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
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note..."
        className={`fb-sticky-textarea w-full flex-1 resize-none bg-transparent text-stone-900 font-hand focus:outline-none placeholder:text-stone-700/40 ${
          inline ? 'text-2xl' : 'text-lg'
        }`}
      />
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="sticky" headerAccent="bg-black/5">
      {content}
    </WidgetFrame>
  )
}
