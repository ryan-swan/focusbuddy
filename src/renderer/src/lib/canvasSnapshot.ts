// Build a pruned canvas snapshot for the voice-command interpreter.
//
// The AI doesn't get the full widget list (could be 100+ widgets across
// pinned + sections + archived). It gets a focused subset:
//   1. SELECTED widget (always included) — that's "this" in user intent
//   2. RECENTLY-TOUCHED widgets — likely targets of "the X I just made"
//   3. VISIBLE widgets — within the camera viewport, so "the table on
//      the right" is resolvable
//   4. Plus a hard cap of 40 entries so tokens stay sane
//
// Content previews are sanitised: stripped of newlines, capped at 120
// chars. Plain-text widgets give back their text; structured widgets
// (table, page) give back a one-liner ("8 rows" / "3 headings"). This
// keeps the AI grounded without paying for full body tokens.

import { useWidgetStore } from '../stores/widgets'
import type { Widget } from '@shared/types'

const RECENT_MS = 5 * 60_000 // 5 minutes
const MAX_WIDGETS = 40
const CONTENT_PREVIEW_CHARS = 120

export interface CanvasSnapshotWidget {
  id: string
  kind: Widget['kind']
  title: string
  contentPreview: string
  selected?: boolean
  recentlyTouched?: boolean
  visible?: boolean
}

export interface CanvasSnapshot {
  activeTaskId: string | null
  selectedWidgetId: string | null
  widgets: CanvasSnapshotWidget[]
}

function previewContent(w: Widget): string {
  if (!w.content) return ''
  // Per-kind summarisation: structured widgets get a stat line, plain
  // widgets get their leading text. Voice commands rarely need to
  // reason about full body — they need to know "this is the X widget
  // that has Y theme".
  switch (w.kind) {
    case 'table': {
      // Content holds the backing-table id, not meaningful prose.
      return '(table)'
    }
    case 'page':
    case 'markdown': {
      // Strip JSON / TipTap structure if present.
      const stripped = w.content
        .replace(/[\{\}\[\]"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return stripped.slice(0, CONTENT_PREVIEW_CHARS)
    }
    case 'webview':
    case 'pdf':
    case 'gdoc':
    case 'gsheet':
    case 'gslide':
    case 'email':
      return w.content.slice(0, CONTENT_PREVIEW_CHARS)
    case 'mindmap':
      return '(mind map)'
    case 'voice-recorder':
      return '(voice note)'
    case 'streamdeck':
      return '(speed deck)'
    case 'timer':
      return '(timer)'
    case 'calculator':
      return '(calculator)'
    case 'color':
      return '(swatch)'
    default: {
      const stripped = w.content
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CONTENT_PREVIEW_CHARS)
      return stripped
    }
  }
}

// A widget is "visible" if its bounding box intersects the camera
// viewport. The viewport is window-sized; pan/zoom map between world
// and screen. For pinned widgets (screen-space) we treat them as
// always visible.
function isInViewport(
  w: Widget,
  panX: number,
  panY: number,
  zoom: number
): boolean {
  if (w.pinned) return true
  if (typeof window === 'undefined') return true
  const screenW = window.innerWidth
  const screenH = window.innerHeight
  const sx = w.x * zoom + panX
  const sy = w.y * zoom + panY
  const sw = w.width * zoom
  const sh = w.height * zoom
  return sx + sw > 0 && sx < screenW && sy + sh > 0 && sy < screenH
}

export function buildCanvasSnapshot(activeTaskId: string | null): CanvasSnapshot {
  const store = useWidgetStore.getState()
  const widgets = store.widgets.filter((w) => !w.archived)
  const selectedId = store.activeWidgetId ?? store.focusedWidgetId
  const now = Date.now()
  const panX = store.panX
  const panY = store.panY
  const zoom = store.zoom

  const scored = widgets.map((w) => {
    const selected = w.id === selectedId
    const recentlyTouched = (w.updatedAt ?? w.createdAt ?? 0) > now - RECENT_MS
    const visible = isInViewport(w, panX, panY, zoom)
    // Score for pruning. Selected > recent > visible > other.
    let score = 0
    if (selected) score += 100
    if (recentlyTouched) score += 30
    if (visible) score += 10
    // Slight nudge for plain-content widgets the user is more likely
    // to mean ("the sticky", "the page"). Structural widgets like
    // streamdeck rarely show up in voice commands.
    if (w.kind === 'sticky' || w.kind === 'note' || w.kind === 'page' || w.kind === 'markdown' || w.kind === 'table') {
      score += 5
    }
    return { w, selected, recentlyTouched, visible, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, MAX_WIDGETS)

  return {
    activeTaskId,
    selectedWidgetId: selectedId,
    widgets: top.map((s) => ({
      id: s.w.id,
      kind: s.w.kind,
      title: s.w.title || '',
      contentPreview: previewContent(s.w),
      selected: s.selected || undefined,
      recentlyTouched: s.recentlyTouched || undefined,
      visible: s.visible || undefined
    }))
  }
}
