import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'

interface Props {
  widget: Widget
  inline?: boolean
}

export default function NoteWidget({ widget, inline = false }: Props): JSX.Element {
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

  const content = (
    <div className={`h-full w-full bg-[#fefcf6] ${inline ? 'p-8' : 'p-4'}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notes, thoughts, anything that doesn't fit on a sticky…"
        className={`w-full h-full resize-none bg-transparent text-stone-900 leading-relaxed focus:outline-none placeholder:text-stone-500/40 font-serif ${
          inline ? 'text-base' : 'text-sm'
        }`}
      />
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="note" headerAccent="bg-stone-200/70">
      {content}
    </WidgetFrame>
  )
}
