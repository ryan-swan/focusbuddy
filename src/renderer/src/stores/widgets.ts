import { create } from 'zustand'
import type { PinZone, Widget, WidgetDraft, WidgetPatch } from '@shared/types'
import { recordTrail } from '../lib/trail'
import { sectionCreate, widgetOpen } from '../lib/audioBeep'
import { notifyWireSource } from '../lib/wireEngine'
import { notifyAgentInputChanged } from '../lib/deskAgentEngine'
import { recordSnapshotSoon } from '../lib/timeTravel'
import { recordAction, recordActionWithToast } from './actionHistory'

// Set while a multi-widget group drag commits, so the per-widget update() calls
// don't each push their own undo entry — endGroupDrag records one combined entry.
let suppressWidgetUndo = false

// Geometry / colour / section-membership are the structural widget edits worth
// undoing. Text content + title have their own native editing undo, and
// internal fields (sync group, url, pin) aren't user "actions".
const UNDOABLE_WIDGET_KEYS: Array<keyof WidgetPatch> = ['x', 'y', 'width', 'height', 'color', 'parentSectionId']

interface WidgetStore {
  widgets: Widget[]
  loadingFor: string | null
  focusedWidgetId: string | null
  activeWidgetId: string | null
  hoveredSectionId: string | null
  // Transient drag position — set by WidgetFrame on every onDrag tick so
  // anything that depends on live widget position (e.g. the inter-widget
  // links overlay) can read this instead of the committed widget.x/y while
  // a drag is in flight. Cleared on drop. Only one widget can be dragged at
  // a time so a single slot is sufficient.
  dragOverride: { widgetId: string; x: number; y: number } | null
  setDragOverride: (override: { widgetId: string; x: number; y: number } | null) => void
  layoutVersion: number
  centerToken: number
  zoom: number
  panX: number
  panY: number
  loadForTask: (taskId: string) => Promise<void>
  clear: () => void
  create: (draft: WidgetDraft) => Promise<Widget>
  update: (id: string, patch: WidgetPatch) => Promise<void>
  remove: (id: string) => Promise<void>
  archive: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  // Park every visible, non-pinned, non-section, top-level widget — optionally keeping the
  // currently-active widget. Returns the count of widgets parked.
  parkAll: (keepActive: boolean) => Promise<number>
  bringToFront: (id: string) => Promise<void>
  setFocused: (id: string | null) => void
  setActive: (id: string | null) => void
  setHoveredSection: (id: string | null) => void
  // ── Multi-select ──────────────────────────────────────────────────────────
  // selectedIds holds every canvas widget the user has marqueed or shift-picked.
  // Group-drag lets one dragged widget carry the whole selection: beginGroupDrag
  // snapshots each selected widget's start position, setGroupDelta is pushed on
  // every drag tick (members follow imperatively — no per-frame IPC), and
  // endGroupDrag commits all final positions in one batch.
  selectedIds: string[]
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  groupDrag: { leaderId: string; dx: number; dy: number } | null
  groupStart: Record<string, { x: number; y: number }> | null
  beginGroupDrag: (leaderId: string) => void
  setGroupDelta: (dx: number, dy: number) => void
  endGroupDrag: () => Promise<void>
  focusOn: (id: string) => void
  zoomToWidget: (id: string) => void
  requestCenter: () => void
  bumpLayoutVersion: () => void
  togglePin: (id: string) => Promise<void>
  // Pin a widget to one of the 4 zone corners. The pinned-layer auto-stacks
  // multiple widgets in the same zone with no overlap. Use this instead of
  // togglePin when you want zone docking instead of legacy free-position pin.
  pinToZone: (id: string, zone: PinZone) => Promise<void>
  // Unpin — returns to canvas at its prior canvas-space position (or the
  // current screen position translated to canvas-space, for legacy pins).
  unpinWidget: (id: string) => Promise<void>
  setZoom: (z: number) => void
  setPan: (x: number, y: number) => void
  panBy: (dx: number, dy: number) => void
  zoomTowardPoint: (newZoom: number, screenX: number, screenY: number) => void
  resetView: () => void
}

const Z_MIN = 0.25
const Z_MAX = 2
const clampZoom = (z: number): number => Math.max(Z_MIN, Math.min(Z_MAX, z))

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  widgets: [],
  loadingFor: null,
  focusedWidgetId: null,
  activeWidgetId: null,
  hoveredSectionId: null,
  dragOverride: null,
  setDragOverride: (override) => set({ dragOverride: override }),
  layoutVersion: 0,
  centerToken: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  loadForTask: async (taskId) => {
    set({
      loadingFor: taskId,
      widgets: [],
      focusedWidgetId: null,
      activeWidgetId: null,
      selectedIds: [],
      groupDrag: null,
      groupStart: null,
      zoom: 1,
      panX: 0,
      panY: 0
    })
    const widgets = await window.api.widgets.listByTask(taskId)
    if (get().loadingFor === taskId) {
      set({ widgets, loadingFor: null })
      // Baseline snapshot for time-travel (dedup keeps it cheap on re-open).
      recordSnapshotSoon(taskId)
    }
  },
  clear: () =>
    set({
      widgets: [],
      loadingFor: null,
      focusedWidgetId: null,
      activeWidgetId: null,
      selectedIds: [],
      groupDrag: null,
      groupStart: null,
      zoom: 1,
      panX: 0,
      panY: 0
    }),
  setFocused: (id) => set({ focusedWidgetId: id }),
  setActive: (id) => set({ activeWidgetId: id }),
  setHoveredSection: (id) => set({ hoveredSectionId: id }),
  selectedIds: [],
  groupDrag: null,
  groupStart: null,
  setSelection: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id]
    })),
  clearSelection: () => set((s) => (s.selectedIds.length ? { selectedIds: [] } : {})),
  beginGroupDrag: (leaderId) => {
    const sel = new Set(get().selectedIds)
    const start: Record<string, { x: number; y: number }> = {}
    for (const w of get().widgets) {
      if (sel.has(w.id)) start[w.id] = { x: w.x, y: w.y }
    }
    set({ groupDrag: { leaderId, dx: 0, dy: 0 }, groupStart: start })
  },
  setGroupDelta: (dx, dy) =>
    set((s) => (s.groupDrag ? { groupDrag: { ...s.groupDrag, dx, dy } } : {})),
  endGroupDrag: async () => {
    const { groupDrag, groupStart } = get()
    set({ groupDrag: null, groupStart: null })
    if (!groupDrag || !groupStart) return
    const { dx, dy } = groupDrag
    if (dx === 0 && dy === 0) return
    const starts = { ...groupStart }
    const ends: Record<string, { x: number; y: number }> = {}
    for (const [id, sp] of Object.entries(starts)) ends[id] = { x: Math.round(sp.x + dx), y: Math.round(sp.y + dy) }
    // Commit the move without per-widget undo entries, then record one combined
    // entry so a single Cmd-Z reverses the whole group move.
    const applyPositions = async (positions: Record<string, { x: number; y: number }>): Promise<void> => {
      suppressWidgetUndo = true
      try {
        await Promise.all(Object.entries(positions).map(([id, p]) => get().update(id, p)))
      } finally {
        suppressWidgetUndo = false
      }
    }
    await applyPositions(ends)
    recordAction({
      label: `Move ${Object.keys(ends).length} widgets`,
      undo: () => applyPositions(starts),
      redo: () => applyPositions(ends)
    })
  },
  // focusOn = make this widget active AND pan the canvas to center it. Used
  // by BringMeBack + explicit "open in focus mode" actions where the widget
  // might be off-screen and we want to surface it. NOT used by widget clicks
  // anymore — clicking a widget you can already see shouldn't shift the
  // world under you.
  focusOn: (id) =>
    set({ activeWidgetId: id, centerToken: get().centerToken + 1 }),
  // zoomToWidget = jump to 100% zoom AND center this widget. Used by Cmd+click
  // on a widget while zoomed out — dive straight into it. The centerToken bump
  // drives the Canvas centering effect, which reads the (now 100%) zoom.
  zoomToWidget: (id) =>
    set({ zoom: 1, activeWidgetId: id, centerToken: get().centerToken + 1 }),
  requestCenter: () => set({ centerToken: get().centerToken + 1 }),
  bumpLayoutVersion: () => set({ layoutVersion: get().layoutVersion + 1 }),
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  panBy: (dx, dy) => set({ panX: get().panX + dx, panY: get().panY + dy }),
  zoomTowardPoint: (newZoom, screenX, screenY) => {
    const z = clampZoom(newZoom)
    const { zoom: curZoom, panX, panY } = get()
    if (z === curZoom) return
    const canvasX = (screenX - panX) / curZoom
    const canvasY = (screenY - panY) / curZoom
    set({
      zoom: z,
      panX: screenX - canvasX * z,
      panY: screenY - canvasY * z
    })
  },
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
  create: async (draft) => {
    const widget = await window.api.widgets.create(draft)
    set({ widgets: [...get().widgets, widget] })
    // Undo a freshly-added widget by trashing it; redo restores it (same id, so
    // its links survive). We re-add the captured object locally to avoid a fetch.
    recordAction({
      label: `Add ${widget.kind}`,
      undo: async () => {
        await window.api.widgets.delete(widget.id)
        set({ widgets: get().widgets.filter((w) => w.id !== widget.id) })
      },
      redo: async () => {
        await window.api.widgets.restore(widget.id)
        if (!get().widgets.some((w) => w.id === widget.id)) set({ widgets: [...get().widgets, widget] })
      }
    })
    recordSnapshotSoon(widget.taskId)
    recordTrail('widget_added', widget.taskId, {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      content: widget.content?.slice(0, 200) ?? ''
    })
    // Different chime for sections (the "container" event) vs other widgets
    if (widget.kind === 'section') sectionCreate()
    else widgetOpen()
    return widget
  },
  update: async (id, patch) => {
    // Capture the prior values of any structural keys this patch touches, BEFORE
    // the optimistic set, so we can record an undo for move/resize/recolour/
    // section-membership. Suppressed during group-drag commit (one combined entry).
    const undoCapture = (() => {
      if (suppressWidgetUndo) return null
      const touched = UNDOABLE_WIDGET_KEYS.filter((k) => k in patch)
      if (!touched.length) return null
      const w = get().widgets.find((x) => x.id === id)
      if (!w) return null
      const prevPatch: WidgetPatch = {}
      const redoPatch: WidgetPatch = {}
      for (const k of touched) {
        ;(prevPatch as Record<string, unknown>)[k] = (w as unknown as Record<string, unknown>)[k]
        ;(redoPatch as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k]
      }
      const label = touched.includes('color')
        ? 'Recolour widget'
        : touched.includes('width') || touched.includes('height')
          ? 'Resize widget'
          : 'Move widget'
      return { prevPatch, redoPatch, label }
    })()
    // Optimistic local update — applies the patch immediately so consumers (Canvas,
    // focus mode, dashboard cards) re-render right away. Critical for the URL persistence
    // case where the user clicks "expand" within IPC roundtrip latency of the last nav.
    set({
      widgets: get().widgets.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w
      )
    })
    const updated = await window.api.widgets.update(id, patch)
    if (!updated) return
    // Reconcile with the server's authoritative copy (timestamps + any computed fields)
    set({ widgets: get().widgets.map((w) => (w.id === id ? updated : w)) })
    // Linked-duplicate live sync: mirror the synced fields (content / title /
    // colour) to any OTHER in-store copies that share this widget's syncGroupId,
    // so same-task copies update instantly. Cross-task copies are mirrored by the
    // main process (db/widgets.ts) and show when their task is opened.
    const sgid = updated.syncGroupId
    if (
      sgid &&
      (patch.content !== undefined || patch.title !== undefined || patch.color !== undefined)
    ) {
      const mirror: Partial<Widget> = {}
      if (patch.content !== undefined) mirror.content = patch.content
      if (patch.title !== undefined) mirror.title = patch.title
      if (patch.color !== undefined) mirror.color = patch.color
      set({
        widgets: get().widgets.map((w) =>
          w.syncGroupId === sgid && w.id !== id ? { ...w, ...mirror } : w
        )
      })
    }
    // Live wires: a content change may drive reactive (transform / mirror)
    // wires leaving this widget, and may trigger any onChange desk agents this
    // widget is wired into. Both engines debounce + guard against loops.
    if (patch.content !== undefined) {
      void notifyWireSource(id)
      notifyAgentInputChanged(id)
    }
    if (undoCapture) {
      const { prevPatch, redoPatch, label } = undoCapture
      recordAction({
        label,
        undo: async () => {
          await window.api.widgets.update(id, prevPatch)
          set({ widgets: get().widgets.map((w) => (w.id === id ? { ...w, ...prevPatch } : w)) })
        },
        redo: async () => {
          await window.api.widgets.update(id, redoPatch)
          set({ widgets: get().widgets.map((w) => (w.id === id ? { ...w, ...redoPatch } : w)) })
        }
      })
    }
    recordSnapshotSoon(updated.taskId)
  },
  remove: async (id) => {
    const widget = get().widgets.find((w) => w.id === id)
    const removedTaskId = widget?.taskId
    await window.api.widgets.delete(id) // soft-delete (trashed, recoverable)
    set({ widgets: get().widgets.filter((w) => w.id !== id) })
    // Don't prune links: they survive the soft-delete so they return on restore.
    // The overlay skips links whose endpoint widget isn't present, so a trashed
    // widget's lines simply hide until it's restored.
    if (widget) {
      recordActionWithToast({
        label: `Delete ${widget.kind}${widget.title ? ` “${widget.title}”` : ''}`,
        undo: async () => {
          await window.api.widgets.restore(id)
          if (!get().widgets.some((w) => w.id === id)) set({ widgets: [...get().widgets, widget] })
        },
        redo: async () => {
          await window.api.widgets.delete(id)
          set({ widgets: get().widgets.filter((w) => w.id !== id) })
        }
      })
    }
    recordSnapshotSoon(removedTaskId)
  },
  archive: async (id) => {
    await window.api.widgets.update(id, { archived: true })
    set({
      widgets: get().widgets.map((w) => (w.id === id ? { ...w, archived: true } : w))
    })
  },
  restore: async (id) => {
    await window.api.widgets.update(id, { archived: false })
    set({
      widgets: get().widgets.map((w) => (w.id === id ? { ...w, archived: false } : w))
    })
  },
  parkAll: async (keepActive) => {
    const activeId = get().activeWidgetId
    const eligible = get().widgets.filter(
      (w) =>
        !w.archived &&
        !w.pinned &&
        w.kind !== 'section' &&
        w.parentSectionId === null &&
        (!keepActive || w.id !== activeId)
    )
    if (eligible.length === 0) return 0
    await Promise.all(
      eligible.map((w) => window.api.widgets.update(w.id, { archived: true }))
    )
    const ids = new Set(eligible.map((w) => w.id))
    set({
      widgets: get().widgets.map((w) => (ids.has(w.id) ? { ...w, archived: true } : w))
    })
    return eligible.length
  },
  bringToFront: async (id) => {
    const updated = await window.api.widgets.bringToFront(id)
    if (!updated) return
    set({ widgets: get().widgets.map((w) => (w.id === id ? updated : w)) })
  },
  pinToZone: async (id, zone) => {
    // Zone pins don't need pinnedScreenX/Y — the pinned-layer computes
    // position from zone + neighbours. We do keep the widget's stored
    // width/height so the dock layout knows its size. Width/height are
    // expressed in screen pixels at scale=1 for zone-pinned widgets.
    const updated = await window.api.widgets.update(id, {
      pinned: true,
      pinnedZone: zone,
      pinnedScreenX: null,
      pinnedScreenY: null
    })
    if (updated) {
      set({
        widgets: get().widgets.map((x) => (x.id === id ? updated : x)),
        layoutVersion: get().layoutVersion + 1
      })
    }
  },
  unpinWidget: async (id) => {
    const w = get().widgets.find((x) => x.id === id)
    if (!w) return
    const { zoom, panX, panY } = get()
    // Legacy free-position pins still translate their screen pos back to
    // canvas-space. Zone pins just clear the pin flags — the widget
    // returns to wherever it was on the canvas before pinning.
    const patch: WidgetPatch = {
      pinned: false,
      pinnedZone: null,
      pinnedScreenX: null,
      pinnedScreenY: null
    }
    if (w.pinnedZone === null && w.pinnedScreenX !== null) {
      const canvasX = (w.pinnedScreenX - panX) / zoom
      const canvasY = ((w.pinnedScreenY ?? 0) - panY) / zoom
      patch.x = Math.round(canvasX)
      patch.y = Math.round(canvasY)
      patch.width = Math.round(w.width / zoom)
      patch.height = Math.round(w.height / zoom)
    }
    const updated = await window.api.widgets.update(id, patch)
    if (updated) {
      set({
        widgets: get().widgets.map((x) => (x.id === id ? updated : x)),
        layoutVersion: get().layoutVersion + 1
      })
    }
  },
  togglePin: async (id) => {
    const state = get()
    const w = state.widgets.find((x) => x.id === id)
    if (!w) return
    const { zoom, panX, panY } = state
    if (w.pinned) {
      // Unpin: convert screen-space pos+size back to canvas-space, so widget stays visually where it is.
      const sx = w.pinnedScreenX ?? 0
      const sy = w.pinnedScreenY ?? 0
      const canvasX = (sx - panX) / zoom
      const canvasY = (sy - panY) / zoom
      const canvasW = w.width / zoom
      const canvasH = w.height / zoom
      const updated = await window.api.widgets.update(id, {
        pinned: false,
        pinnedScreenX: null,
        pinnedScreenY: null,
        x: Math.round(canvasX),
        y: Math.round(canvasY),
        width: Math.round(canvasW),
        height: Math.round(canvasH)
      })
      if (updated) {
        set({
          widgets: get().widgets.map((x) => (x.id === id ? updated : x)),
          layoutVersion: get().layoutVersion + 1
        })
      }
    } else {
      // Pin: compute current on-screen position+size and store, so widget remains visually unchanged.
      const screenX = w.x * zoom + panX
      const screenY = w.y * zoom + panY
      const screenW = w.width * zoom
      const screenH = w.height * zoom
      const updated = await window.api.widgets.update(id, {
        pinned: true,
        pinnedScreenX: Math.round(screenX),
        pinnedScreenY: Math.round(screenY),
        width: Math.round(screenW),
        height: Math.round(screenH)
      })
      if (updated) {
        set({
          widgets: get().widgets.map((x) => (x.id === id ? updated : x)),
          layoutVersion: get().layoutVersion + 1
        })
      }
    }
  }
}))
