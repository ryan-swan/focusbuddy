import { useEffect, useMemo, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'
import DeskMiniature from '../DeskMiniature'
import { useWidgetStore } from '../../stores/widgets'
import { useLinksStore } from '../../stores/links'
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
  const widgets = useWidgetStore((s) => s.widgets)
  const links = useLinksStore((s) => s.links)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)

  const cfg = parse(widget.content)

  // Control room: what this portal inherits — everything wired INTO it. A wired
  // source that is itself a portal contributes its whole desk.
  const incoming = useMemo(
    () => links.filter((l) => l.targetWidgetId === widget.id),
    [links, widget.id]
  )
  const inheritedLabels = useMemo(
    () =>
      incoming.map((l) => {
        const src = widgets.find((w) => w.id === l.sourceWidgetId)
        if (!src) return 'a source'
        if (src.kind === 'portal') {
          try {
            const t = (JSON.parse(src.content || '{}') as { targetTaskId?: string }).targetTaskId
            return nodes.find((n) => n.id === t)?.title || 'a desk'
          } catch {
            return 'a desk'
          }
        }
        return src.title || src.kind
      }),
    [incoming, widgets, nodes]
  )
  const inheritCount = incoming.length
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
  if (!cfg.targetTaskId && inheritCount > 0) {
    // Rollup aggregator: no target desk of its own, but inherits wired sources.
    // Whatever it's wired into receives all of these combined.
    body = (
      <div className="h-full w-full flex flex-col bg-[var(--surface-sunken)]" data-testid="portal-widget">
        <div className="px-2.5 py-1.5 border-b border-[var(--edge-soft)] flex items-center gap-1.5">
          <Icon name="hub" size={13} className="text-accent shrink-0" />
          <span className="text-[12px] font-medium text-[var(--ink-90)] flex-1">
            Rollup
          </span>
          <button
            onClick={() => pick('')}
            title="Point at a desk instead"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-[var(--ink-50)] hover:text-accent hover:bg-[var(--surface-sunken)]/70 shrink-0"
            data-testid="portal-change"
          >
            <Icon name="swap_horiz" size={13} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2.5" data-testid="portal-rollup">
          <div className="text-[10px] text-[var(--ink-50)] mb-1.5">
            Combines {inheritCount} source{inheritCount === 1 ? '' : 's'} into one feed:
          </div>
          <div className="space-y-1">
            {inheritedLabels.map((label, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[11px] text-[var(--ink-70)]"
              >
                <Icon name="arrow_forward" size={11} className="text-accent shrink-0" />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  } else if (!cfg.targetTaskId) {
    // Desk picker.
    body = (
      <div className="h-full w-full flex flex-col bg-[var(--surface-raised)]" data-testid="portal-widget">
        <div className="px-3 py-2 border-b border-[var(--edge-soft)] flex items-center gap-1.5 text-[var(--ink-70)]">
          <Icon name="picture_in_picture" size={15} className="text-accent" />
          <span className="text-[12px] font-medium">Open a window into another desk</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1" onMouseDown={(e) => e.stopPropagation()}>
          {tasks.length === 0 ? (
            <div className="text-[11px] text-[var(--ink-40)] p-2">
              No other tasks yet. Create another task and it'll show up here.
            </div>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-[var(--surface-sunken)] text-[12px] text-[var(--ink-70)]"
                data-testid={`portal-pick-task-${t.id}`}
              >
                <Icon name="task_alt" size={13} className="text-[var(--ink-40)] shrink-0" />
                <span className="truncate">{t.title || '(untitled task)'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  } else {
    body = (
      <div className="h-full w-full flex flex-col bg-[var(--surface-sunken)]" data-testid="portal-widget">
        <div className="px-2.5 py-1.5 border-b border-[var(--edge-soft)] flex items-center gap-1.5">
          <Icon name="picture_in_picture" size={13} className="text-accent shrink-0" />
          <button
            onClick={openTarget}
            className="text-[12px] font-medium text-[var(--ink-90)] truncate hover:text-accent flex-1 text-left"
            data-testid="portal-title"
            title="Open this desk"
          >
            {targetNode?.title || 'Untitled desk'}
          </button>
          {inheritCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] text-accent shrink-0"
              title={`Also inherits: ${inheritedLabels.join(', ')}`}
              data-testid="portal-inherits"
            >
              <Icon name="hub" size={10} />+{inheritCount}
            </span>
          )}
          <button
            onClick={openTarget}
            title="Open this desk"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-[var(--ink-50)] hover:text-accent hover:bg-[var(--surface-sunken)]/70 shrink-0"
            data-testid="portal-open"
          >
            <Icon name="login" size={13} />
          </button>
          <button
            onClick={() => pick('')}
            title="Point at a different desk"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-[var(--ink-50)] hover:text-accent hover:bg-[var(--surface-sunken)]/70 shrink-0"
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
          <span className="absolute top-1 right-1.5 flex items-center gap-1 text-[8px] uppercase tracking-wider text-[var(--ink-40)]">
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
