import { create } from 'zustand'
import type { PinZone, Widget, WidgetDraft, WidgetPatch } from '@shared/types'
import { recordTrail } from '../lib/trail'
import { sectionCreate, widgetOpen } from '../lib/audioBeep'
import { useLinksStore } from './links'

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
      zoom: 1,
      panX: 0,
      panY: 0
    })
    const widgets = await window.api.widgets.listByTask(taskId)
    if (get().loadingFor === taskId) {
      set({ widgets, loadingFor: null })
    }
  },
  clear: () =>
    set({
      widgets: [],
      loadingFor: null,
      focusedWidgetId: null,
      activeWidgetId: null,
      zoom: 1,
      panX: 0,
      panY: 0
    }),
  setFocused: (id) => set({ focusedWidgetId: id }),
  setActive: (id) => set({ activeWidgetId: id }),
  setHoveredSection: (id) => set({ hoveredSectionId: id }),
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
  },
  remove: async (id) => {
    await window.api.widgets.delete(id)
    set({ widgets: get().widgets.filter((w) => w.id !== id) })
    // The DB cascade already dropped any widget_links referencing this id;
    // mirror that into the local links store so the SVG overlay doesn't
    // render a dangling line until the next loadForTask.
    useLinksStore.getState().pruneByWidget(id)
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
