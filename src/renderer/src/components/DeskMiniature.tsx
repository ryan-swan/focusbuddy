import { useMemo } from 'react'
import type { Widget } from '@shared/types'
import { computeSectionFrame, effectiveLayout } from '../lib/sectionGeometry'
import WidgetPreview from './WidgetPreview'

// A spatial, content-aware miniature of a set of widgets — the same idea as the
// minimap's thumbnails, but for an arbitrary widget array (e.g. another task's
// desk in a portal). Fits the widgets into the given pixel box, drawing each as
// a scaled real preview. Read-only and non-interactive by itself.

interface Props {
  widgets: Widget[]
  width: number
  height: number
  padding?: number
  // Silhouette mode: render solid colored rects instead of live content previews.
  // Faster and cleaner for Stage Manager cards and Room View thumbnails.
  silhouette?: boolean
}

// Kind → muted fill color for silhouette mode
const SILHOUETTE_FILL: Record<string, string> = {
  note: 'rgb(var(--accent) / 0.18)',
  web: 'rgb(var(--accent) / 0.12)',
  file: 'rgb(var(--accent) / 0.14)',
  section: 'rgb(var(--accent) / 0.06)',
}
function silhouetteFill(kind: string): string {
  return SILHOUETTE_FILL[kind] ?? 'rgb(var(--accent) / 0.13)'
}

export default function DeskMiniature({ widgets, width, height, padding = 6, silhouette = false }: Props): JSX.Element {
  // Top-level, visible, real widgets — skip archived, pinned, section children,
  // and the auto minimap (a minimap inside a miniature is just noise).
  const visible = useMemo(
    () =>
      widgets.filter(
        (w) =>
          !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap'
      ),
    [widgets]
  )

  const bbox = useMemo(() => {
    if (visible.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const w of visible) {
      let ww = w.width
      let hh = w.height
      if (w.kind === 'section') {
        const children = widgets.filter((c) => c.parentSectionId === w.id)
        const frame = computeSectionFrame(children, effectiveLayout(w.layout))
        ww = frame.width
        hh = frame.height
      }
      minX = Math.min(minX, w.x)
      minY = Math.min(minY, w.y)
      maxX = Math.max(maxX, w.x + ww)
      maxY = Math.max(maxY, w.y + hh)
    }
    return { minX, minY, maxX, maxY }
  }, [visible, widgets])

  const scale = useMemo(() => {
    if (!bbox) return 1
    const bbW = Math.max(1, bbox.maxX - bbox.minX)
    const bbH = Math.max(1, bbox.maxY - bbox.minY)
    return Math.min((width - 2 * padding) / bbW, (height - 2 * padding) / bbH, 1)
  }, [bbox, width, height, padding])

  if (!bbox || visible.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-[var(--ink-40)]">
        Empty desk
      </div>
    )
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {visible.map((w) => {
        let ww = w.width
        let hh = w.height
        if (w.kind === 'section') {
          const children = widgets.filter((c) => c.parentSectionId === w.id)
          const frame = computeSectionFrame(children, effectiveLayout(w.layout))
          ww = frame.width
          hh = frame.height
        }
        const x = padding + (w.x - bbox.minX) * scale
        const y = padding + (w.y - bbox.minY) * scale
        const pw = Math.max(2, ww * scale)
        const ph = Math.max(2, hh * scale)
        if (silhouette || w.kind === 'section') {
          const fill = w.kind === 'section'
            ? 'rgb(var(--accent) / 0.06)'
            : silhouetteFill(w.kind)
          const stroke = w.kind === 'section' ? 'rgb(var(--accent) / 0.30)' : 'rgb(var(--accent) / 0.20)'
          return (
            <rect
              key={w.id}
              x={x}
              y={y}
              width={pw}
              height={ph}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.75}
              rx={2}
            />
          )
        }
        return (
          <foreignObject key={w.id} x={x} y={y} width={pw} height={ph} style={{ overflow: 'hidden' }}>
            <div className="h-full w-full overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/10">
              <div
                style={{
                  width: ww,
                  height: hh,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  pointerEvents: 'none'
                }}
              >
                <WidgetPreview widget={w} />
              </div>
            </div>
          </foreignObject>
        )
      })}
    </svg>
  )
}
