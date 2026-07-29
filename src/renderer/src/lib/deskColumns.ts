import type { Widget, WidgetKind } from '@shared/types'
import { catalogFor } from './widgetCatalog'

// Configuration + geometry for the desk Columns view. A desk's objects can be
// laid out into vertical, independently scrolling columns. Columns are either
// hand-made ("freeform" — you place things where you want) or derived from a
// grouping key (by Type or by Colour/label). The config is a local viewing
// preference (localStorage per desk), not synced content.

export type GroupBy = 'freeform' | 'kind' | 'color'

export interface DeskColumn {
  id: string
  title: string
}

export interface DeskColumnsConfig {
  groupBy: GroupBy
  // Freeform only: the user's columns and which column each widget sits in.
  columns: DeskColumn[]
  assign: Record<string, string> // widgetId -> columnId
  order: Record<string, number> // widgetId -> sort order within its column
}

const KEY_PREFIX = 'fb.deskColumns.v1.'

export function defaultColumnsConfig(): DeskColumnsConfig {
  return {
    groupBy: 'freeform',
    columns: [
      { id: 'col-1', title: 'To sort' },
      { id: 'col-2', title: 'In progress' },
      { id: 'col-3', title: 'Reference' }
    ],
    assign: {},
    order: {}
  }
}

export function loadColumnsConfig(taskId: string): DeskColumnsConfig {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + taskId)
    if (!raw) return defaultColumnsConfig()
    const parsed = JSON.parse(raw) as Partial<DeskColumnsConfig>
    const base = defaultColumnsConfig()
    return {
      groupBy: parsed.groupBy ?? base.groupBy,
      columns: Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : base.columns,
      assign: parsed.assign ?? {},
      order: parsed.order ?? {}
    }
  } catch {
    return defaultColumnsConfig()
  }
}

export function saveColumnsConfig(taskId: string, cfg: DeskColumnsConfig): void {
  try {
    localStorage.setItem(KEY_PREFIX + taskId, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

// The width a widget wants to be shown at in a column. Uses the catalog's ideal
// width for the kind (docs/sheets/slides/design/maps are wide; stickies,
// calculators, colours are narrow), falling back to the widget's own width, then
// clamped so a single very wide kind (e.g. webview at 1366) doesn't make a column
// absurdly wide, and nothing gets narrower than a legible minimum.
const ITEM_MIN_W = 240
const ITEM_MAX_W = 760
export function naturalItemWidth(w: Widget): number {
  const ideal = catalogFor(w.kind)?.defaultWidth ?? w.width ?? 320
  return Math.max(ITEM_MIN_W, Math.min(ITEM_MAX_W, Math.round(ideal)))
}

// A sensible card height per item so a column reads as a wall of cards rather
// than a few giant blocks. Honours the widget's own height within bounds.
export function itemCardHeight(w: Widget): number {
  const tall = new Set<WidgetKind>(['doc', 'sheet', 'slides', 'design', 'map', 'mindmap', 'diagram', 'webview', 'pdf', 'scratchpad', 'living-doc'])
  const min = 150
  const max = tall.has(w.kind) ? 520 : 360
  return Math.max(min, Math.min(max, Math.round(w.height || 240)))
}

// Which top-level objects appear in the Columns view: real free widgets, not
// pinned chrome, minimaps, sections or section children.
export function columnsEligible(widgets: Widget[]): Widget[] {
  return widgets.filter(
    (w) => !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap' && w.kind !== 'section'
  )
}

// ── Grouping by type ──────────────────────────────────────────────────────────
// Collapse the many widget kinds into a handful of human column names.
const KIND_GROUP: Partial<Record<WidgetKind, string>> = {
  doc: 'Documents', gdoc: 'Documents', page: 'Documents', note: 'Documents', markdown: 'Documents', 'living-doc': 'Documents', scratchpad: 'Documents',
  sheet: 'Spreadsheets', gsheet: 'Spreadsheets',
  slides: 'Slides', gslide: 'Slides',
  design: 'Designs',
  map: 'Diagrams', mindmap: 'Diagrams', diagram: 'Diagrams',
  table: 'Tables', field: 'Tables', 'custom-block': 'Tables',
  sticky: 'Notes', card: 'Notes',
  webview: 'Web & links', pdf: 'Web & links', email: 'Web & links', portal: 'Web & links',
  file: 'Files', drive: 'Files', image: 'Files', video: 'Files', 'voice-recorder': 'Files',
  calculator: 'Tools', color: 'Tools', timer: 'Tools', streamdeck: 'Tools', 'local-app-launcher': 'Tools', shape: 'Tools', chart: 'Tools',
  agent: 'AI', 'chat-thread': 'AI', 'task-link': 'Links'
}
export function kindGroupLabel(kind: WidgetKind): string {
  return KIND_GROUP[kind] ?? 'Other'
}

export function colorLabel(color: string | null | undefined): string {
  return color ? color.toLowerCase() : 'No label'
}

export interface BuiltColumn {
  id: string
  title: string
  swatch?: string | null // for colour grouping
  items: Widget[]
  width: number // content-driven column width (widest item + padding)
}

const COLUMN_PADDING = 28 // horizontal breathing room inside a column

// Build the columns to render for the current config + widgets.
export function buildColumns(widgets: Widget[], cfg: DeskColumnsConfig): BuiltColumn[] {
  const items = columnsEligible(widgets)
  const withWidth = (id: string, title: string, list: Widget[], swatch?: string | null): BuiltColumn => {
    const maxW = list.reduce((m, w) => Math.max(m, naturalItemWidth(w)), ITEM_MIN_W)
    return { id, title, items: list, width: maxW + COLUMN_PADDING, swatch }
  }

  if (cfg.groupBy === 'kind') {
    const groups = new Map<string, Widget[]>()
    for (const w of items) {
      const g = kindGroupLabel(w.kind)
      const arr = groups.get(g) ?? []
      arr.push(w)
      groups.set(g, arr)
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([g, list]) => withWidth('kind:' + g, g, list))
  }

  if (cfg.groupBy === 'color') {
    const groups = new Map<string, Widget[]>()
    for (const w of items) {
      const key = colorLabel(w.color)
      const arr = groups.get(key) ?? []
      arr.push(w)
      groups.set(key, arr)
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] === 'No label' ? 1 : b[0] === 'No label' ? -1 : a[0].localeCompare(b[0])))
      .map(([key, list]) => withWidth('color:' + key, key === 'No label' ? 'No label' : 'Label', list, key === 'No label' ? null : key))
  }

  // Freeform: place each widget in its assigned column; unassigned land in the
  // first column so nothing is ever lost.
  const first = cfg.columns[0]?.id
  const byCol = new Map<string, Widget[]>()
  for (const c of cfg.columns) byCol.set(c.id, [])
  for (const w of items) {
    const col = cfg.assign[w.id] && byCol.has(cfg.assign[w.id]) ? cfg.assign[w.id] : first
    if (col) byCol.get(col)!.push(w)
  }
  for (const list of byCol.values()) {
    list.sort((a, b) => (cfg.order[a.id] ?? 0) - (cfg.order[b.id] ?? 0) || a.createdAt - b.createdAt)
  }
  return cfg.columns.map((c) => withWidth(c.id, c.title, byCol.get(c.id) ?? []))
}
