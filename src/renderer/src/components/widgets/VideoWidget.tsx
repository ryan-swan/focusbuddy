import { useEffect, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import Icon from '../Icon'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40)
  }
}

interface Props {
  widget: Widget
  inline?: boolean
}

export default function VideoWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [editing, setEditing] = useState(!widget.content)
  const [draft, setDraft] = useState(widget.content)

  useEffect(() => {
    setDraft(widget.content)
    setEditing(!widget.content)
  }, [widget.id, widget.content])

  function commit(): void {
    const url = draft.trim()
    if (!url) return
    void update(widget.id, { content: url, title: hostnameOf(url) })
    setEditing(false)
  }

  const body = (
    <div className="h-full w-full bg-black relative flex items-center justify-center">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
          className="w-full h-full flex flex-col justify-center gap-2 p-4 bg-white"
        >
          <label className="text-xs uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Icon name="movie" size={16} />
            Video URL
          </label>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://…/video.mp4"
            className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-stone-700 focus:ring-2 focus:ring-stone-200"
          />
          <div className="flex justify-end pt-1">
            <button type="submit" className="btn-primary">
              <Icon name="check" size={14} />
              <span>Load</span>
            </button>
          </div>
        </form>
      ) : (
        <>
          <video
            src={widget.content}
            controls
            className="max-h-full max-w-full"
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            title="Change URL"
            className="absolute top-1 right-1 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-white/90 border border-stone-300 hover:bg-stone-100 text-stone-700 z-10"
          >
            <Icon name="edit" size={11} />
            <span>edit</span>
          </button>
        </>
      )}
    </div>
  )

  if (inline) return body

  return (
    <WidgetFrame
      widget={widget}
      headerLabel={`Video · ${widget.title || hostnameOf(widget.content || '')}`}
      headerAccent="bg-stone-300/60"
    >
      {body}
    </WidgetFrame>
  )
}
