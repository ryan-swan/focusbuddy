import { useEffect, useMemo, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'
import DeskMiniature from '../DeskMiniature'
import { useWidgetStore } from '../../stores/widgets'
import { useNodeStore } from '../../stores/nodes'

// Portal — a live window into ANOTHER task's desk. Pick a task and the portal
// shows a shrunk, content-aware miniature of that desk, refreshed periodically
// and on window focus. Click to dive into it. This is the building block of a
// "control room" desk that watches several projects at once.

interface PortalConfig {
  targetTaskId: string | null
}

function parse(content: string | undefined | null): PortalConfig {
  if (!content) return { targetTaskId: null }
  try {
    const p = JSON.parse(content) as Partial<PortalConfig>
    return { targetTaskId: p.targetTaskId ?? null }
  } catch {
    return { targetTaskId: null }
  }
}

interface Props {
  widget: Widget
  inline?: boolean
}

export default function PortalWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)

  const cfg = parse(widget.content)
  const [targetWidgets, setTargetWidgets] = useState<Widget[]>([])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [bodyPx, setBodyPx] = useState({ w: widget.width - 16, h: widget.height - 80 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      setBodyPx({ w: Math.max(40, r.width), h: Math.max(40, r.height) })
    }
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => ro?.disconnect()
  }, [])

  // Live-ish refresh of the target desk: on mount/target change, on a slow
  // interval while mounted, and whenever the window regains focus.
  useEffect(() => {
    const target = cfg.targetTaskId
    if (!target) {
      setTargetWidgets([])
      return
    }
    let alive = true
    const load = async (): Promise<void> => {
      const ws = await window.api.widgets.listByTask(target)
      if (alive) setTargetWidgets(ws)
    }
    void load()
    const interval = window.setInterval(() => void load(), 4000)
    const onFocus = (): void => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [cfg.targetTaskId])

  const tasks = useMemo(
    () => nodes.filter((n) => n.kind === 'task' && n.id !== widget.taskId && !n.archived),
    [nodes, widget.taskId]
  )
  const targetNode = cfg.targetTaskId ? nodes.find((n) => n.id === cfg.targetTaskId) : null

  const pick = (taskId: string): void => {
    void update(widget.id, { content: JSON.stringify({ targetTaskId: taskId }) })
  }
  const openTarget = (): void => {
    if (cfg.targetTaskId) setActive(cfg.targetTaskId)
  }

  let body: JSX.Element
  if (!cfg.targetTaskId) {
    // Desk picker.
    body = (
      <div className="h-full w-full flex flex-col bg-white dark:bg-stone-900" data-testid="portal-widget">
        <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
          <Icon name="picture_in_picture" size={15} className="text-accent" />
          <span className="text-[12px] font-medium">Open a window into another desk</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1" onMouseDown={(e) => e.stopPropagation()}>
          {tasks.length === 0 ? (
            <div className="text-[11px] text-stone-400 dark:text-stone-500 p-2">
              No other tasks yet. Create another task and it'll show up here.
            </div>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-stone-100 dark:hover:bg-stone-800 text-[12px] text-stone-700 dark:text-stone-200"
                data-testid={`portal-pick-task-${t.id}`}
              >
                <Icon name="task_alt" size={13} className="text-stone-400 dark:text-stone-500 shrink-0" />
                <span className="truncate">{t.title || '(untitled task)'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  } else {
    body = (
      <div className="h-full w-full flex flex-col bg-stone-50 dark:bg-stone-950" data-testid="portal-widget">
        <div className="px-2.5 py-1.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-1.5">
          <Icon name="picture_in_picture" size={13} className="text-accent shrink-0" />
          <button
            onClick={openTarget}
            className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate hover:text-accent flex-1 text-left"
            data-testid="portal-title"
            title="Open this desk"
          >
            {targetNode?.title || 'Untitled desk'}
          </button>
          <button
            onClick={openTarget}
            title="Open this desk"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-stone-500 hover:text-accent hover:bg-stone-200/70 dark:hover:bg-stone-700/70 shrink-0"
            data-testid="portal-open"
          >
            <Icon name="login" size={13} />
          </button>
          <button
            onClick={() => pick('')}
            title="Point at a different desk"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-stone-500 hover:text-accent hover:bg-stone-200/70 dark:hover:bg-stone-700/70 shrink-0"
            data-testid="portal-change"
          >
            <Icon name="swap_horiz" size={13} />
          </button>
        </div>
        <div
          ref={wrapRef}
          className="flex-1 min-h-0 relative cursor-pointer"
          onClick={openTarget}
          title="Open this desk"
        >
          <DeskMiniature widgets={targetWidgets} width={bodyPx.w} height={bodyPx.h} />
          {/* A faint live dot so it reads as a live view, not a snapshot. */}
          <span className="absolute top-1 right-1.5 flex items-center gap-1 text-[8px] uppercase tracking-wider text-stone-400 dark:text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 fb-breathing" />
            live
          </span>
        </div>
      </div>
    )
  }

  if (inline) return body
  return (
    <WidgetFrame widget={widget} headerLabel="Portal" headerAccent="bg-accent/20">
      {body}
    </WidgetFrame>
  )
}
