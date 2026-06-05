import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'

// A clean titled card — an accent bar, a bold editable title and a multi-line
// body. A step up from a sticky for structured callouts. Persists as JSON.

interface CardData {
  title: string
  body: string
  accent: string
}

const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b']
const DEFAULT: CardData = { title: '', body: '', accent: ACCENTS[0] }

function parse(content: string): CardData {
  if (!content) return { ...DEFAULT }
  try {
    const p = JSON.parse(content) as Partial<CardData>
    return { title: p.title ?? '', body: p.body ?? '', accent: p.accent ?? DEFAULT.accent }
  } catch {
    // Legacy / plain-text content becomes the body.
    return { ...DEFAULT, body: content }
  }
}

interface Props {
  widget: Widget
  inline?: boolean
}

export default function CardWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [data, setData] = useState<CardData>(() => parse(widget.content))
  const [pickAccent, setPickAccent] = useState(false)
  const lastSaved = useRef(widget.content)

  useEffect(() => {
    const next = JSON.stringify(data)
    if (next === lastSaved.current) return
    const h = window.setTimeout(() => {
      lastSaved.current = next
      void update(widget.id, { content: next })
    }, 300)
    return () => window.clearTimeout(h)
  }, [data, widget.id, update])

  const set = (patch: Partial<CardData>): void => setData((d) => ({ ...d, ...patch }))

  const content = (
    <div className="group relative h-full w-full flex flex-col bg-white dark:bg-stone-900">
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: data.accent }} />
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 p-3">
        <input
          value={data.title}
          onChange={(e) => set({ title: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Title"
          className="w-full bg-transparent text-[15px] font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
        />
        <textarea
          value={data.body}
          onChange={(e) => set({ body: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Write something…"
          className="flex-1 min-h-0 w-full resize-none bg-transparent text-[13px] leading-relaxed text-stone-700 dark:text-stone-300 placeholder:text-stone-400 focus:outline-none"
        />
      </div>

      {/* Accent picker (hover) */}
      <div className="absolute top-2.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setPickAccent((v) => !v)}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-5 w-5 rounded-full ring-2 ring-white dark:ring-stone-900 shadow"
          style={{ backgroundColor: data.accent }}
          title="Card colour"
          aria-label="Card colour"
        />
        {pickAccent && (
          <div
            className="absolute right-0 mt-1 flex gap-1 p-1.5 rounded-lg bg-white dark:bg-stone-800 shadow-xl border border-stone-200 dark:border-stone-700 z-10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {ACCENTS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  set({ accent: c })
                  setPickAccent(false)
                }}
                className="h-5 w-5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: c }}
                aria-label={`Accent ${c}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="card" headerAccent="bg-stone-200/70">
      {content}
    </WidgetFrame>
  )
}
