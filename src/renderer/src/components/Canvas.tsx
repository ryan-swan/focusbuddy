import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useConnectedAppsStore } from '../stores/connectedApps'
import { CONNECTED_APP_DRAG_MIME } from './Sidebar'
import StickyWidget from './widgets/StickyWidget'
import WebViewWidget from './widgets/WebViewWidget'
import NoteWidget from './widgets/NoteWidget'
import MarkdownWidget from './widgets/MarkdownWidget'
import TaskLinkWidget from './widgets/TaskLinkWidget'
import LocalAppLauncherWidget from './widgets/LocalAppLauncherWidget'
import FileWidget from './widgets/FileWidget'
import FieldWidget from './widgets/FieldWidget'
import PageWidget from './widgets/PageWidget'
import TableWidget from './widgets/TableWidget'
import CalculatorWidget from './widgets/CalculatorWidget'
import ColorWidget from './widgets/ColorWidget'
import ImageWidget from './widgets/ImageWidget'
import VideoWidget from './widgets/VideoWidget'
import TimerWidget from './widgets/TimerWidget'
import SectionWidget from './widgets/SectionWidget'
import StreamDeckWidget from './widgets/StreamDeckWidget'
import WidgetPalette from './WidgetPalette'
import WidgetDock from './WidgetDock'
import WidgetFocusMode from './WidgetFocusMode'
import ExtensionPrompt from './ExtensionPrompt'
import ResumeModal from './ResumeModal'
import AISetupDialog from './AISetupDialog'
import SaveTemplateDialog from './SaveTemplateDialog'
import AiBuilderDialog from './AiBuilderDialog'
import type { AiBuildSuggestion } from '@shared/types'
import LoadMeter from './LoadMeter'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import FloatingToolbar, { type ToolbarAction } from './FloatingToolbar'
import MinimapWidget from './widgets/MinimapWidget'
import VoiceRecorderWidget from './widgets/VoiceRecorderWidget'
import MindMapWidget from './widgets/MindMapWidget'
import DiagramWidget from './widgets/DiagramWidget'
import ScratchpadWidget from './widgets/ScratchpadWidget'
import ShapeWidget from './widgets/ShapeWidget'
import CardWidget from './widgets/CardWidget'
import CustomBlockWidget from './widgets/CustomBlockWidget'
import AgentWidget from './widgets/AgentWidget'
import PortalWidget from './widgets/PortalWidget'
import ZoomControls from './ZoomControls'
import CanvasEdgeIndicators from './CanvasEdgeIndicators'
import { useEdgePan } from '../lib/useEdgePan'
import { useNavPrefs, frictionFromGlide } from '../lib/navPrefs'
import CanvasAIAssistantRail from './CanvasAIAssistantRail'
import Icon from './Icon'
import { useChatStore } from '../stores/chat'
import { useFocusSessionStore } from '../stores/focusSession'
import { chimeIn, futuristicPowerOn, sonarPing } from '../lib/audioBeep'
import type { WidgetSuggestion } from '@shared/types'
import {
  CATEGORIES,
  DRAG_MIME,
  WIDGET_CATALOG,
  catalogFor,
  type WidgetCatalogEntry,
  type WidgetCategory
} from '../lib/widgetCatalog'
import {
  computeSectionFrame,
  computeLayoutCells,
  effectiveLayout,
  SECTION_PADDING,
  SECTION_MIN_W,
  SECTION_MIN_H
} from '../lib/sectionGeometry'
import { lookupWebview } from '../lib/webviewRegistry'
import {
  getOrigin,
  subscribeOrigins,
  isKitDismissed,
  dismissKit,
  type NodeCanvasOrigin
} from '../lib/nodeCanvasOrigin'
import MindmapStartingKit from './MindmapStartingKit'
import SyncWidgetPicker from './SyncWidgetPicker'
import CanvasBreadcrumb from './CanvasBreadcrumb'
import type { StandardApp } from '../lib/standardApps'
import {
  PinLayoutContext,
  computeZonePinPositions,
  type ChromeInsets
} from '../lib/pinLayout'
import {
  AI_RAIL_BUTTON_SIZE,
  AI_RAIL_WIDTH,
  useAIRailCollapsed
} from '../lib/chromeState'
import LinkOverlay from './LinkOverlay'
import { useLinksStore } from '../stores/links'
import { LinkDragContext } from '../lib/linkDragContext'
import type {
  ContextMenuPayload,
  SectionLayout,
  Widget,
  WidgetDraft,
  WidgetKind
} from '@shared/types'

const CATEGORY_ICON: Record<WidgetCategory, string> = {
  Notes: 'sticky_note_2',
  Web: 'public',
  Files: 'folder',
  Tools: 'build',
  Comms: 'mail',
  Layout: 'crop_free'
}

const CATEGORY_COLOR: Record<WidgetCategory, string> = {
  Notes: '#f59e0b',
  Web: '#3b82f6',
  Files: '#10b981',
  Tools: '#8b5cf6',
  Comms: '#ec4899',
  Layout: '#737373'
}

const WEB_KINDS: WidgetKind[] = ['webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email']
const isWebKind = (k: WidgetKind): boolean => WEB_KINDS.includes(k)

function renderWidget(w: Widget): JSX.Element | null {
  switch (w.kind) {
    case 'sticky':
      return <StickyWidget widget={w} />
    case 'note':
      return <NoteWidget widget={w} />
    case 'markdown':
      return <MarkdownWidget widget={w} />
    case 'task-link':
      return <TaskLinkWidget widget={w} />
    case 'local-app-launcher':
      return <LocalAppLauncherWidget widget={w} />
    case 'file':
      return <FileWidget widget={w} />
    case 'field':
      return <FieldWidget widget={w} />
    case 'page':
      return <PageWidget widget={w} />
    case 'table':
      return <TableWidget widget={w} />
    case 'calculator':
      return <CalculatorWidget widget={w} />
    case 'color':
      return <ColorWidget widget={w} />
    case 'image':
      return <ImageWidget widget={w} />
    case 'video':
      return <VideoWidget widget={w} />
    case 'timer':
      return <TimerWidget widget={w} />
    case 'streamdeck':
      return <StreamDeckWidget widget={w} />
    case 'minimap':
      return <MinimapWidget widget={w} />
    case 'voice-recorder':
      return <VoiceRecorderWidget widget={w} />
    case 'mindmap':
      return <MindMapWidget widget={w} />
    case 'diagram':
      return <DiagramWidget widget={w} />
    case 'scratchpad':
      return <ScratchpadWidget widget={w} />
    case 'shape':
      return <ShapeWidget widget={w} />
    case 'card':
      return <CardWidget widget={w} />
    case 'custom-block':
      return <CustomBlockWidget widget={w} />
    case 'agent':
      return <AgentWidget widget={w} />
    case 'portal':
      return <PortalWidget widget={w} />
    case 'section':
      return <SectionWidget widget={w} renderChild={renderWidget} />
    case 'webview':
    case 'pdf':
    case 'gdoc':
    case 'gsheet':
    case 'gslide':
    case 'email':
      return <WebViewWidget widget={w} />
    default:
      return null
  }
}

const STATUS_META: Record<
  'open' | 'in_progress' | 'done' | 'parked',
  { label: string; icon: string; next: 'open' | 'in_progress' | 'done' | 'parked' }
> = {
  open: { label: 'Start', icon: 'play_arrow', next: 'in_progress' },
  in_progress: { label: 'Done', icon: 'check', next: 'done' },
  done: { label: 'Reopen', icon: 'refresh', next: 'open' },
  parked: { label: 'Resume', icon: 'play_arrow', next: 'open' }
}

export default function Canvas(): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const nodes = useNodeStore((s) => s.nodes)
  const updateNode = useNodeStore((s) => s.update)
  const setActiveTask = useNodeStore((s) => s.setActive)
  const expandFolder = useNodeStore((s) => s.expand)
  // Breadcrumb origin: if this task's canvas was opened by exploring a mind-map
  // node, show a path back to the map. Re-read on task switch + origin changes.
  const [nodeOrigin, setNodeOrigin] = useState<NodeCanvasOrigin | null>(() =>
    getOrigin(activeTaskId)
  )
  useEffect(() => {
    const read = (): void => setNodeOrigin(getOrigin(activeTaskId))
    read()
    return subscribeOrigins(read)
  }, [activeTaskId])
  // Bumped when the user dismisses the starting kit, to re-evaluate visibility.
  const [kitDismissTick, setKitDismissTick] = useState(0)
  const [syncPickerOpen, setSyncPickerOpen] = useState(false)
  const widgets = useWidgetStore((s) => s.widgets)
  // Auto-offer the starting kit on a freshly-explored, still-EMPTY node canvas.
  // "Empty" ignores the auto-created minimap + any pinned chrome.
  const showStartingKit =
    kitDismissTick >= 0 &&
    !!nodeOrigin &&
    !!activeTaskId &&
    widgets.filter((w) => w.kind !== 'minimap' && !w.pinned).length === 0 &&
    !isKitDismissed(activeTaskId)
  const focusedId = useWidgetStore((s) => s.focusedWidgetId)
  const activeId = useWidgetStore((s) => s.activeWidgetId)
  const setActive = useWidgetStore((s) => s.setActive)
  const focusOn = useWidgetStore((s) => s.focusOn)
  const centerToken = useWidgetStore((s) => s.centerToken)
  const layoutVersion = useWidgetStore((s) => s.layoutVersion)
  const zoom = useWidgetStore((s) => s.zoom)
  const panX = useWidgetStore((s) => s.panX)
  const panY = useWidgetStore((s) => s.panY)
  const setZoom = useWidgetStore((s) => s.setZoom)
  const panBy = useWidgetStore((s) => s.panBy)
  const nav = useNavPrefs()
  const zoomTowardPoint = useWidgetStore((s) => s.zoomTowardPoint)
  const resetView = useWidgetStore((s) => s.resetView)
  const loadForTask = useWidgetStore((s) => s.loadForTask)
  const clearWidgets = useWidgetStore((s) => s.clear)
  const createWidget = useWidgetStore((s) => s.create)
  const updateWidget = useWidgetStore((s) => s.update)
  const bumpLayoutVersion = useWidgetStore((s) => s.bumpLayoutVersion)
  const selectedIds = useWidgetStore((s) => s.selectedIds)
  const setSelection = useWidgetStore((s) => s.setSelection)
  const clearSelection = useWidgetStore((s) => s.clearSelection)
  const removeWidget = useWidgetStore((s) => s.remove)
  const groupDragActive = useWidgetStore((s) => s.groupDrag !== null)
  const dropRef = useRef<HTMLDivElement | null>(null)
  const setPan = useWidgetStore((s) => s.setPan)
  const [savingTemplate] = useState(false)
  // Controls the SaveTemplateDialog. context distinguishes the toolbar
  // entry point from the task-done auto-prompt so the dialog headline
  // and the skip-button copy can adapt.
  const [saveTemplateOpen, setSaveTemplateOpen] = useState<
    null | { context: 'toolbar' | 'task-done' }
  >(null)
  // Track tasks we've already prompted about on done so re-clicking
  // "Done → Reopen → Done" doesn't re-open the prompt in a loop. Reset
  // when the task changes.
  const promptedDoneRef = useRef<Set<string>>(new Set())
  // (palette state is local to WidgetPalette now — it manages its own
  // popover open/closed; we removed the canvas-level toggle.)
  const [animatingPan, setAnimatingPan] = useState(false)
  // (The minimap measures the canvas viewport itself via its own
  // ResizeObserver — see MinimapWidget — so Canvas no longer tracks a
  // separate, unread viewportSize here.)
  // Edge-pan / "infinite map" camera. The hook installs a rAF loop
  // that pans the canvas when the cursor enters a 80px margin near
  // any edge — closer to the edge = faster pan (quadratic ramp).
  // Disabled while a widget is active (the user is editing inside it),
  // while a zoom-to-fit animation is running, or when keyboard focus is
  // in a form input. Returns the live per-edge intensity (0-1) for the
  // visual indicators below.
  const edgeIntensity = useEdgePan({
    containerRef: dropRef,
    // Only animatingPan disables edge-pan. We DELIBERATELY no longer
    // disable on `activeId !== null`. Reasoning: a user moving the
    // cursor to the canvas edge is unambiguously asking to navigate
    // the canvas — even with a widget currently active. The old gate
    // meant clicking any widget killed edge-pan until the user
    // remembered to press Escape or click on bare canvas to deselect.
    // Hiding canvas navigation behind a manual deselect step was the
    // root cause of "edge-pan stopped working" complaints — paired
    // with the form-focus gate (now scoped to canvas-internal forms),
    // any kind of widget interaction would silently kill it.
    disabled: animatingPan || !nav.edgePanEnabled,
    maxSpeedPerSecond: 1100 * nav.edgePanSpeed
  })
  const [, setNowTick] = useState(0) // for the running-task clock
  const [snoozeUntil, setSnoozeUntil] = useState<number>(0)
  const [showResume, setShowResume] = useState(false)
  const [showAISetup, setShowAISetup] = useState(false)
  // AI Builder: free-form "describe what you want" prompt that returns
  // suggested widgets (pages, tables, fields). Independent of the existing
  // AI Setup (which is task-context-driven and uses the older suggestion
  // format).
  const [showAiBuilder, setShowAiBuilder] = useState(false)
  const welcomedTasksRef = useRef<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<{
    screenX: number
    screenY: number
    canvasX: number
    canvasY: number
  } | null>(null)

  const activeTask = activeTaskId ? nodes.find((n) => n.id === activeTaskId) ?? null : null

  // Spatial-link state — load per task, mirror the widgets pattern. The
  // overlay reads this store; Canvas owns the link-arm gesture.
  //
  // Gesture state is split into two pieces:
  //   - linkSourceId: the widget the user "armed" the link from. Only set
  //     on arm start / cleared on arm end. Drives the banner + the install
  //     of the global mouse/keyboard listeners.
  //   - ghostCursor: world-space cursor position. Updated on every
  //     mousemove. Only this triggers ghost-line re-renders, so the
  //     listener-install effect doesn't churn on every cursor frame.
  const loadLinksForTask = useLinksStore((s) => s.loadForTask)
  const clearLinks = useLinksStore((s) => s.clear)
  const createLink = useLinksStore((s) => s.create)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)
  const [ghostCursor, setGhostCursor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (activeTaskId) void loadForTask(activeTaskId)
    else clearWidgets()
  }, [activeTaskId, loadForTask, clearWidgets])

  useEffect(() => {
    if (activeTaskId) void loadLinksForTask(activeTaskId)
    else clearLinks()
  }, [activeTaskId, loadLinksForTask, clearLinks])

  // Minimap auto-create. Every task gets a minimap widget pinned to its
  // BR zone the first time it's opened — gives users an always-available
  // canvas overview without forcing them to dig through the widget picker.
  //
  // Once spawned, the minimap is a regular widget: the user can resize,
  // pin to a different zone, drag back to the canvas, or delete it.
  // Deletion writes a localStorage flag (fb-minimap-dismissed:{taskId})
  // so we don't re-create the widget the next time the task opens. The
  // user can always re-add it from the widget picker — kind 'minimap'
  // appears in the Layout category.
  //
  // We poll the store via `loadingFor === null` to know when loadForTask
  // has completed (the store doesn't expose a Promise we can await from
  // here). The createdMinimapForRef set guards against double-creates if
  // React strict-mode runs the effect twice in dev.
  const widgetsLoadingFor = useWidgetStore((s) => s.loadingFor)
  const widgetIds = useWidgetStore((s) =>
    s.widgets.map((w) => `${w.id}:${w.kind}`).join('|')
  )
  const createdMinimapForRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!activeTaskId) return
    if (widgetsLoadingFor !== null) return // still loading
    if (createdMinimapForRef.current.has(activeTaskId)) return
    const dismissed = localStorage.getItem(`fb-minimap-dismissed:${activeTaskId}`) === '1'
    if (dismissed) {
      createdMinimapForRef.current.add(activeTaskId)
      return
    }
    const mine = useWidgetStore
      .getState()
      .widgets.filter((w) => w.kind === 'minimap' && w.taskId === activeTaskId)
    if (mine.length >= 1) {
      createdMinimapForRef.current.add(activeTaskId)
      // Self-heal: a load-race in an earlier session could have created several
      // minimaps (the user saw four). Keep exactly one, delete the rest. This
      // also stops new dupes accumulating on every refresh.
      if (mine.length > 1) {
        for (const extra of mine.slice(1)) {
          void useWidgetStore.getState().remove(extra.id)
        }
      }
      return
    }
    createdMinimapForRef.current.add(activeTaskId)
    void createWidget({
      taskId: activeTaskId,
      kind: 'minimap',
      title: '',
      content: '',
      x: 0,
      y: 0,
      width: 220,
      height: 160,
      pinned: true,
      pinnedZone: 'br'
    })
    // Suppress noise about widgetIds — included in deps to re-evaluate
    // after widgets load completes, but we use the getState() snapshot.
    void widgetIds
  }, [activeTaskId, widgetsLoadingFor, widgetIds, createWidget])

  // Track minimap deletions → write the dismissed flag so we don't auto-
  // resurrect. Pure observer; doesn't touch the store from inside the
  // subscribe callback (which could loop).
  useEffect(() => {
    if (!activeTaskId) return
    let prevHadMinimap = useWidgetStore
      .getState()
      .widgets.some((w) => w.kind === 'minimap' && w.taskId === activeTaskId)
    const unsubscribe = useWidgetStore.subscribe((state) => {
      const hasMinimap = state.widgets.some(
        (w) => w.kind === 'minimap' && w.taskId === activeTaskId
      )
      if (prevHadMinimap && !hasMinimap) {
        localStorage.setItem(`fb-minimap-dismissed:${activeTaskId}`, '1')
      } else if (!prevHadMinimap && hasMinimap) {
        localStorage.removeItem(`fb-minimap-dismissed:${activeTaskId}`)
      }
      prevHadMinimap = hasMinimap
    })
    return unsubscribe
  }, [activeTaskId])

  // Imperative controller exposed via context to WidgetFrame / SectionWidget.
  // The .start() call is what arms the link gesture — it's invoked from a
  // widget header button's onClick handler. We keep this on a ref so the
  // identity is stable across renders.
  const linkDragController = useRef({
    start: (sourceWidgetId: string): void => {
      setLinkSourceId(sourceWidgetId)
      setGhostCursor(null) // appears on first mousemove
    }
  }).current

  // While armed: mousemove updates ghost cursor, click capture-phase
  // completes/cancels, Esc cancels. Listeners install ONCE per arm session
  // (deps key on linkSourceId, not on ghostCursor) so they don't churn on
  // every cursor frame.
  useEffect(() => {
    if (!linkSourceId) return
    // Stable reference for the duration of this arm session — TypeScript
    // can't narrow `linkSourceId` inside the nested handlers below, so we
    // pin it locally.
    const sourceId: string = linkSourceId
    function onMove(e: MouseEvent): void {
      // Raw viewport coords — the LinkOverlay SVG is now position: fixed
      // covering the viewport, so client coords ARE its coord space.
      // Previously this subtracted dropRef's left/top; that broke as soon
      // as the SVG's positioned ancestor diverged from dropRef, which
      // turned out to be the cause of the long-standing "ghost lines
      // float off in the middle of nowhere" bug.
      setGhostCursor({ x: e.clientX, y: e.clientY })
    }
    function endArm(): void {
      setLinkSourceId(null)
      setGhostCursor(null)
    }
    function onClickCapture(e: MouseEvent): void {
      const target = e.target as HTMLElement | null
      // The banner + its cancel button are tagged with data-link-skip so
      // their clicks don't complete the gesture.
      if (target?.closest('[data-link-skip]')) return
      const widgetEl = target?.closest('[data-widget-id]') as HTMLElement | null
      const toId = widgetEl?.dataset.widgetId ?? null
      // Click on the same source widget, on a pinned/child widget, or on
      // bare canvas → cancel without creating.
      if (!toId || toId === sourceId || !activeTaskId) {
        endArm()
        return
      }
      const ws = useWidgetStore.getState().widgets
      const from = ws.find((w) => w.id === sourceId)
      const to = ws.find((w) => w.id === toId)
      if (!from || !to) {
        endArm()
        return
      }
      if (from.pinned || to.pinned) {
        endArm()
        return
      }
      // Linking widgets inside sections — and to sections themselves — is
      // now permitted. The visual link is drawn between the actual
      // rendered widget rects (LinkOverlay reads getBoundingClientRect on
      // [data-widget-id]) so an in-section widget produces a line that
      // anchors to its visible position inside the section frame, and a
      // section produces a line that anchors to the section's outer
      // frame. The persisted row in widget_links stores source + target
      // widget ids regardless of section membership.
      void createLink(sourceId, toId, activeTaskId)
      endArm()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') endArm()
    }
    window.addEventListener('mousemove', onMove)
    // Capture phase — fires BEFORE the widget's own onClick activator.
    // Otherwise the activation handler could swallow the click via
    // stopPropagation and the completion would never reach us.
    window.addEventListener('click', onClickCapture, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [linkSourceId, panX, panY, zoom, activeTaskId, createLink])

  // Proactive welcome: when a task transitions to in_progress for the first time this session,
  // and the user hasn't already started a chat about it, the AI opens with a 1-2 sentence hello + first step.
  useEffect(() => {
    if (!activeTask) return
    if (activeTask.status !== 'in_progress') return
    if (welcomedTasksRef.current.has(activeTask.id)) return
    welcomedTasksRef.current.add(activeTask.id)
    void useChatStore.getState().sendProactiveWelcome(activeTask.id)
  }, [activeTask?.id, activeTask?.status])

  // Task-done auto-prompt: when an active task transitions to `done`,
  // ask whether to save its canvas as a template before the user moves
  // on. The thinking is: most templates the user would EVER want to
  // make are the ones for tasks they've JUST finished — they know what
  // worked. Catching them at that moment is the maximum-leverage prompt.
  //
  // Guards:
  //  - Only fire once per task per session (promptedDoneRef).
  //  - Only fire if the task has ≥1 widget — empty desks can't template.
  //  - Skip if another modal is already open (focus mode, AI setup, resume)
  //    so we don't stack dialogs.
  useEffect(() => {
    if (!activeTask) return
    if (activeTask.status !== 'done') return
    if (promptedDoneRef.current.has(activeTask.id)) return
    const haveWidgets = widgets.some(
      (w) => w.taskId === activeTask.id && !w.archived
    )
    if (!haveWidgets) return
    if (focusedId !== null || showResume || showAISetup || showAiBuilder) return
    promptedDoneRef.current.add(activeTask.id)
    setSaveTemplateOpen({ context: 'task-done' })
  }, [
    activeTask?.id,
    activeTask?.status,
    widgets,
    focusedId,
    showResume,
    showAISetup,
    showAiBuilder
  ])

  // Reset the "prompted on done" set when the active task changes — so
  // a future Done → Reopen → Done flow on the SAME task isn't re-prompted
  // this session, but a different task that gets done later still is.
  // (We don't clear when same id stays active.)
  useEffect(() => {
    // Effect intentionally empty besides the ref-clear behaviour below —
    // promptedDoneRef persists across re-renders by design.
  }, [activeTaskId])

  // Re-render every second while a task is in progress (drives the title-bar clock)
  useEffect(() => {
    if (!activeTask) return
    if (activeTask.status !== 'in_progress') return
    if (!activeTask.estimateMinutes) return
    const id = window.setInterval(() => setNowTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [activeTask?.status, activeTask?.estimateMinutes, activeTask?.id])

  // Receive context-menu actions from main process (right-click inside webview)
  useEffect(() => {
    const off = window.api.contextMenu.onAction((payload: ContextMenuPayload) => {
      void handleContextMenu(payload)
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, panX, panY, zoom])

  async function handleContextMenu(payload: ContextMenuPayload): Promise<void> {
    if (!activeTaskId || !dropRef.current) return
    const entry = lookupWebview(payload.webContentsId)
    if (!entry) return
    const wvRect = entry.el.getBoundingClientRect()
    const canvasRect = dropRef.current.getBoundingClientRect()
    const screenX = wvRect.left + payload.x
    const screenY = wvRect.top + payload.y
    const canvasX = (screenX - canvasRect.left - panX) / zoom
    const canvasY = (screenY - canvasRect.top - panY) / zoom
    const baseX = Math.round(canvasX + 20)
    const baseY = Math.round(canvasY + 20)
    const common: Pick<WidgetDraft, 'taskId' | 'x' | 'y'> = {
      taskId: activeTaskId,
      x: baseX,
      y: baseY
    }
    switch (payload.action) {
      case 'createStickyFromSelection':
        if (!payload.selectionText) return
        await createWidget({
          ...common,
          kind: 'sticky',
          content: payload.selectionText,
          width: 280,
          height: 220,
          color: '#fef08a'
        })
        return
      case 'createNoteFromSelection':
        if (!payload.selectionText) return
        await createWidget({
          ...common,
          kind: 'note',
          content: payload.selectionText,
          width: 380,
          height: 300,
          color: null
        })
        return
      case 'openLinkInNewBrowser':
        if (!payload.linkURL) return
        await createWidget({
          ...common,
          kind: 'webview',
          content: payload.linkURL,
          width: 560,
          height: 400,
          color: null
        })
        return
      case 'saveImageToCanvas':
        if (!payload.srcURL) return
        await createWidget({
          ...common,
          kind: 'image',
          content: payload.srcURL,
          width: 360,
          height: 280,
          color: null
        })
        return
      case 'saveVideoToCanvas':
        if (!payload.srcURL) return
        await createWidget({
          ...common,
          kind: 'video',
          content: payload.srcURL,
          width: 480,
          height: 320,
          color: null
        })
        return
    }
  }

  // Auto-center on the active widget when a click triggers requestCenter()
  useEffect(() => {
    if (centerToken === 0) return
    if (!activeId || !dropRef.current) return
    const w = widgets.find((x) => x.id === activeId)
    if (!w) return

    let cx = w.x
    let cy = w.y
    let cw = w.width
    let ch = w.height

    if (w.parentSectionId) {
      // Child of a section: its stored x/y are relative. Translate to canvas coords.
      const parent = widgets.find((p) => p.id === w.parentSectionId)
      if (parent) {
        const parentLayout = effectiveLayout(parent.layout)
        if (parentLayout === 'free') {
          cx = parent.x + SECTION_PADDING + w.x
          cy = parent.y + SECTION_PADDING + w.y
        } else {
          // Non-free layouts (grid/stacks/icons/list): the child's stored x/y
          // are meaningless — its real position is computed by the layout.
          // Re-run the exact layout math to find this child's cell, so the
          // camera centres on the item itself, not the whole section.
          const siblings = widgets.filter((c) => c.parentSectionId === parent.id)
          const frame = computeSectionFrame(siblings, parentLayout)
          const contentW = frame.width - 2 * SECTION_PADDING
          const cells = computeLayoutCells(parentLayout, siblings, contentW)
          const idx = siblings.findIndex((c) => c.id === w.id)
          const cell = idx >= 0 ? cells[idx] : undefined
          if (cell) {
            cx = parent.x + SECTION_PADDING + cell.x
            cy = parent.y + SECTION_PADDING + cell.y
            cw = cell.width
            ch = cell.height
          } else {
            // Defensive fallback: centre the section if the child vanished.
            cx = parent.x
            cy = parent.y
            cw = frame.width
            ch = frame.height
          }
        }
      }
    } else if (w.kind === 'section') {
      // Sections: stored width/height can lag actual; use computed frame
      const children = widgets.filter((c) => c.parentSectionId === w.id)
      const frame = computeSectionFrame(children, effectiveLayout(w.layout))
      cw = frame.width
      ch = frame.height
    }

    const rect = dropRef.current.getBoundingClientRect()
    const targetX = rect.width / 2 - (cx + cw / 2) * zoom
    const targetY = rect.height / 2 - (cy + ch / 2) * zoom
    setAnimatingPan(true)
    setPan(targetX, targetY)
    const t = window.setTimeout(() => setAnimatingPan(false), 280)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerToken])

  function centerOnHome(): void {
    if (!dropRef.current) return
    const canvasItems = widgets.filter((w) => !w.pinned && !w.parentSectionId)
    if (canvasItems.length === 0) {
      resetView()
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const w of canvasItems) {
      let width = w.width
      let height = w.height
      if (w.kind === 'section') {
        const sChildren = widgets.filter((c) => c.parentSectionId === w.id)
        const frame = computeSectionFrame(sChildren, effectiveLayout(w.layout))
        width = frame.width
        height = frame.height
      }
      minX = Math.min(minX, w.x)
      minY = Math.min(minY, w.y)
      maxX = Math.max(maxX, w.x + width)
      maxY = Math.max(maxY, w.y + height)
    }
    const bbW = Math.max(1, maxX - minX)
    const bbH = Math.max(1, maxY - minY)
    const rect = dropRef.current.getBoundingClientRect()
    const PAD = 60
    const zoomX = (rect.width - 2 * PAD) / bbW
    const zoomY = (rect.height - 2 * PAD) / bbH
    const newZoom = Math.max(0.25, Math.min(zoomX, zoomY, 1))
    const bbCenterX = minX + bbW / 2
    const bbCenterY = minY + bbH / 2
    const targetPanX = rect.width / 2 - bbCenterX * newZoom
    const targetPanY = rect.height / 2 - bbCenterY * newZoom
    setAnimatingPan(true)
    setZoom(newZoom)
    setPan(targetPanX, targetPanY)
    window.setTimeout(() => setAnimatingPan(false), 280)
  }

  // Keyboard: Cmd+] zoom in, Cmd+[ zoom out, Cmd+0 reset, Cmd+H home, Esc deactivate widget
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && activeId !== null) {
        setActive(null)
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === ']') {
        e.preventDefault()
        setZoom(zoom + 0.1)
      } else if (e.key === '[') {
        e.preventDefault()
        setZoom(zoom - 0.1)
      } else if (e.key === '0') {
        e.preventDefault()
        resetView()
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        centerOnHome()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, setZoom, resetView, activeId, setActive, widgets])

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      return { x: (screenX - panX) / zoom, y: (screenY - panY) / zoom }
    },
    [panX, panY, zoom]
  )

  function handleWheel(e: React.WheelEvent<HTMLDivElement>): void {
    // If an active widget contains the wheel target, leave it alone — its content scrolls
    if (activeId !== null) {
      const target = e.target as HTMLElement
      if (target.closest(`[data-widget-id="${activeId}"]`)) return
    }
    // ⌘/Ctrl + wheel = zoom toward cursor; otherwise pan (works for trackpad swipe)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.005 * nav.zoomSensitivity)
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      zoomTowardPoint(zoom * factor, cursorX, cursorY)
    } else {
      e.preventDefault()
      panBy(-e.deltaX * nav.wheelSensitivity, -e.deltaY * nav.wheelSensitivity)
    }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>): void {
    // Clicks on bare-canvas areas (not on a widget) deactivate the active widget
    const target = e.target as HTMLElement
    if (target.dataset.bareCanvas !== undefined && activeId !== null) {
      setActive(null)
    }
  }

  // ── Click-drag canvas panning ──────────────────────────────────────────────
  // Press on bare canvas → a sonar ping + a pulsing ring confirm the grab; hold
  // and move and the camera pans 1:1 with the cursor (panX/panY are screen-space
  // translations, so the delta maps directly). A press without a drag still acts
  // as a click (deactivate the active widget).
  const panDragRef = useRef<{
    startX: number
    startY: number
    startPanX: number
    startPanY: number
    moved: boolean
    pointerId: number
  } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const [panPing, setPanPing] = useState<{ x: number; y: number } | null>(null)
  // ── Rubber-band (marquee) selection ────────────────────────────────────────
  // rubberRef holds the canvas-space anchor while a Shift+drag is in flight;
  // rubberRect is the live canvas-space rectangle (rendered as a screen-space
  // overlay so the dashed border stays crisp at any zoom).
  const rubberRef = useRef<{ startX: number; startY: number; pointerId: number } | null>(null)
  const [rubberRect, setRubberRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  )
  // Last hit-set (sorted, joined) so we only push a new selection when the set
  // of overlapped widgets actually changes — avoids a re-render every mousemove.
  const lastHitsRef = useRef<string>('')
  // Widgets eligible for marquee/selection: top-level, non-pinned, not the
  // minimap, and not a section (sections can be moved but aren't multi-selected
  // in v1). Their x/y/width/height are absolute canvas coords.
  const selectableWidgets = useCallback(
    () =>
      useWidgetStore
        .getState()
        .widgets.filter(
          (w) =>
            w.parentSectionId === null &&
            !w.pinned &&
            w.kind !== 'section' &&
            w.kind !== 'minimap'
        ),
    []
  )

  // Screen-space bounding box of the current selection (for the floating
  // selection toolbar). Recomputed when the selection or any widget moves.
  const selectionBBox = useMemo(() => {
    if (selectedIds.length === 0) return null
    const sel = widgets.filter((w) => selectedIds.includes(w.id))
    if (sel.length === 0) return null
    const minX = Math.min(...sel.map((w) => w.x))
    const minY = Math.min(...sel.map((w) => w.y))
    const maxX = Math.max(...sel.map((w) => w.x + w.width))
    const maxY = Math.max(...sel.map((w) => w.y + w.height))
    return { minX, minY, maxX, maxY, count: sel.length }
  }, [selectedIds, widgets])

  // Wrap the selected widgets in a new section that encloses them. The section
  // is sized to their bounding box (+ padding); each child's absolute canvas
  // x/y becomes section-local. Free layout preserves their relative positions.
  const groupIntoSection = useCallback(async (): Promise<void> => {
    const all = useWidgetStore.getState().widgets
    const sel = all.filter(
      (w) =>
        selectedIds.includes(w.id) &&
        w.parentSectionId === null &&
        !w.pinned &&
        w.kind !== 'section' &&
        w.kind !== 'minimap'
    )
    if (sel.length < 1) return
    const minX = Math.min(...sel.map((w) => w.x))
    const minY = Math.min(...sel.map((w) => w.y))
    const maxX = Math.max(...sel.map((w) => w.x + w.width))
    const maxY = Math.max(...sel.map((w) => w.y + w.height))
    const sectionX = minX - SECTION_PADDING
    const sectionY = minY - SECTION_PADDING
    const sectionW = Math.max(maxX - minX + 2 * SECTION_PADDING, SECTION_MIN_W)
    const sectionH = Math.max(maxY - minY + 2 * SECTION_PADDING, SECTION_MIN_H)
    const section = await createWidget({
      taskId: sel[0].taskId,
      kind: 'section',
      title: 'Group',
      content: '',
      x: sectionX,
      y: sectionY,
      width: sectionW,
      height: sectionH
    })
    chimeIn()
    await Promise.all(
      sel.map((w) =>
        updateWidget(w.id, {
          parentSectionId: section.id,
          x: Math.round(w.x - sectionX - SECTION_PADDING),
          y: Math.round(w.y - sectionY - SECTION_PADDING)
        })
      )
    )
    bumpLayoutVersion()
    clearSelection()
  }, [selectedIds, createWidget, updateWidget, bumpLayoutVersion, clearSelection])

  // Duplicate every selected widget as an independent copy, offset slightly,
  // then select the new copies so the user can immediately reposition them.
  const duplicateSelection = useCallback(async (): Promise<void> => {
    const all = useWidgetStore.getState().widgets
    const sel = all.filter((w) => selectedIds.includes(w.id))
    if (sel.length === 0) return
    const created = await Promise.all(
      sel.map((w) =>
        createWidget({
          taskId: w.taskId,
          kind: w.kind,
          title: w.title,
          content: w.content,
          x: w.x + 28,
          y: w.y + 28,
          width: w.width,
          height: w.height,
          color: w.color,
          sourceAppId: w.sourceAppId,
          mode: w.mode
        })
      )
    )
    setSelection(created.map((w) => w.id))
  }, [selectedIds, createWidget, setSelection])

  const deleteSelection = useCallback(async (): Promise<void> => {
    const ids = useWidgetStore.getState().selectedIds.slice()
    clearSelection()
    await Promise.all(ids.map((id) => removeWidget(id)))
  }, [clearSelection, removeWidget])

  // Keyboard: Esc clears the selection; Cmd/Ctrl+A selects every selectable
  // widget on the desk (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === 'Escape' && useWidgetStore.getState().selectedIds.length > 0) {
        clearSelection()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !typing) {
        const ids = selectableWidgets().map((w) => w.id)
        if (ids.length > 0) {
          e.preventDefault()
          setSelection(ids)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, selectableWidgets, setSelection])

  const panPingTimer = useRef<number | null>(null)
  // Release-inertia state: smoothed velocity (px/frame), last sample, and the
  // running glide animation frame.
  const panVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 })
  const panLastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const panInertiaRaf = useRef<number | null>(null)

  function cancelPanInertia(): void {
    if (panInertiaRaf.current !== null) {
      cancelAnimationFrame(panInertiaRaf.current)
      panInertiaRaf.current = null
    }
  }
  useEffect(() => cancelPanInertia, [])

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return // primary button only
    const target = e.target as HTMLElement
    if (target.dataset.bareCanvas === undefined) return // only on bare canvas
    cancelPanInertia() // a fresh grab stops any in-flight glide
    panVelocityRef.current = { vx: 0, vy: 0 }
    // Shift+drag on the bare canvas = rubber-band (marquee) select. This works
    // even when drag-pan is disabled in settings, and intentionally pre-empts
    // panning so the user can sweep a selection box. Plain drag falls through
    // to panning below.
    if (e.shiftKey) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pt = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      rubberRef.current = { startX: pt.x, startY: pt.y, pointerId: e.pointerId }
      lastHitsRef.current = ''
      setRubberRect({ x: pt.x, y: pt.y, w: 0, h: 0 })
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // pointer capture unsupported — marquee still works while over the surface
      }
      return
    }
    if (!nav.dragPanEnabled) return // click-drag panning turned off in settings
    panLastMoveRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panX,
      startPanY: panY,
      moved: false,
      pointerId: e.pointerId
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // pointer capture unsupported — drag still works while over the surface
    }
    setGrabbing(true)
    if (nav.sonarOnGrab) {
      sonarPing()
      // Surface-relative coords so the ring positions correctly regardless of
      // any transformed ancestor (position:absolute inside dropRef).
      const rect = e.currentTarget.getBoundingClientRect()
      setPanPing({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (panPingTimer.current !== null) window.clearTimeout(panPingTimer.current)
      panPingTimer.current = window.setTimeout(() => setPanPing(null), 650)
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const rub = rubberRef.current
    if (rub) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pt = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      const x = Math.min(rub.startX, pt.x)
      const y = Math.min(rub.startY, pt.y)
      const w = Math.abs(pt.x - rub.startX)
      const h = Math.abs(pt.y - rub.startY)
      setRubberRect({ x, y, w, h })
      // Live hit-test in canvas space — highlight everything the box overlaps.
      const hits = selectableWidgets()
        .filter(
          (wd) => x < wd.x + wd.width && x + w > wd.x && y < wd.y + wd.height && y + h > wd.y
        )
        .map((wd) => wd.id)
      const key = hits.slice().sort().join(',')
      if (key !== lastHitsRef.current) {
        lastHitsRef.current = key
        setSelection(hits)
      }
      return
    }
    const d = panDragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true
    setPan(d.startPanX + dx * nav.dragSensitivity, d.startPanY + dy * nav.dragSensitivity)
    // Track smoothed velocity (normalised to ~16ms frames) for release inertia.
    const last = panLastMoveRef.current
    const now = performance.now()
    if (last) {
      const mdt = Math.max(1, now - last.t)
      const fvx = ((e.clientX - last.x) / mdt) * 16
      const fvy = ((e.clientY - last.y) / mdt) * 16
      // Weight the most-recent sample heavily so a fast flick's peak speed
      // carries into the release (less smoothing = punchier slingshot).
      panVelocityRef.current = {
        vx: panVelocityRef.current.vx * 0.35 + fvx * 0.65,
        vy: panVelocityRef.current.vy * 0.35 + fvy * 0.65
      }
    }
    panLastMoveRef.current = { x: e.clientX, y: e.clientY, t: now }
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const rub = rubberRef.current
    if (rub) {
      try {
        e.currentTarget.releasePointerCapture(rub.pointerId)
      } catch {
        // ignore
      }
      rubberRef.current = null
      setRubberRect(null)
      // Selection was set live during the move. A shift-click that never moved
      // leaves the (empty) selection as-is.
      return
    }
    const d = panDragRef.current
    if (!d) return
    panDragRef.current = null
    setGrabbing(false)
    try {
      e.currentTarget.releasePointerCapture(d.pointerId)
    } catch {
      // ignore
    }
    // A press with no drag behaves like a bare-canvas click (idempotent with
    // onClick, which may not fire reliably after a pointer-capture sequence).
    if (!d.moved) {
      const target = e.target as HTMLElement
      if (target.dataset.bareCanvas !== undefined) {
        if (activeId !== null) setActive(null)
        clearSelection() // click empty space → drop the selection
      }
      return
    }
    // Release inertia: slingshot in the drag direction, then decelerate to a
    // stop. slingshot × sensitivity multiply the release speed so a flick
    // coasts past the cursor; glide (friction) sets how long it keeps moving.
    // All user-configurable in Settings → Navigation.
    if (!nav.momentumEnabled) return
    const launch = nav.slingshot * nav.dragSensitivity
    const MAX_LAUNCH = 160 // px/frame
    let vx = Math.max(-MAX_LAUNCH, Math.min(MAX_LAUNCH, panVelocityRef.current.vx * launch))
    let vy = Math.max(-MAX_LAUNCH, Math.min(MAX_LAUNCH, panVelocityRef.current.vy * launch))
    if (Math.hypot(vx, vy) > 1.2) {
      const friction = frictionFromGlide(nav.glide)
      const step = (): void => {
        panBy(vx, vy)
        vx *= friction
        vy *= friction
        if (Math.hypot(vx, vy) > 0.4) {
          panInertiaRaf.current = requestAnimationFrame(step)
        } else {
          panInertiaRaf.current = null
        }
      }
      panInertiaRaf.current = requestAnimationFrame(step)
    }
  }

  function handleCanvasContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement
    // Only open our menu on bare-canvas clicks; widgets/webviews handle their own context menus
    if (target.dataset.bareCanvas === undefined) return
    e.preventDefault()
    const rect = dropRef.current?.getBoundingClientRect()
    if (!rect) return
    const canvasPt = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
    setCtxMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      canvasX: canvasPt.x,
      canvasY: canvasPt.y
    })
  }

  async function placeWidgetAtCanvas(
    entry: WidgetCatalogEntry,
    canvasX: number,
    canvasY: number
  ): Promise<void> {
    if (!activeTaskId) return
    await createWidget({
      taskId: activeTaskId,
      kind: entry.kind,
      content: entry.defaultContent,
      x: Math.round(canvasX - entry.defaultWidth / 2),
      y: Math.round(canvasY - 20),
      width: entry.defaultWidth,
      height: entry.defaultHeight,
      color: entry.kind === 'sticky' ? '#fef08a' : null
    })
  }

  async function groupByType(useStacks: boolean): Promise<void> {
    if (!activeTaskId) return
    const topLevel = widgets.filter(
      (w) => !w.parentSectionId && w.kind !== 'section' && !w.pinned
    )
    if (topLevel.length === 0) return
    const byKind = new Map<WidgetKind, Widget[]>()
    for (const w of topLevel) {
      const list = byKind.get(w.kind) ?? []
      list.push(w)
      byKind.set(w.kind, list)
    }
    const layout: SectionLayout = useStacks ? 'stacks' : 'grid'
    const PADDING = 80
    const GAP = 40

    // Pre-compute frames for each new section
    const newSections: Array<{
      items: Widget[]
      frame: { width: number; height: number }
      color: string
      title: string
    }> = []
    for (const [kind, items] of byKind) {
      if (items.length === 0) continue
      const entry = catalogFor(kind)
      const cat: WidgetCategory = entry?.category ?? 'Notes'
      const synthetic: Widget[] = items.map((w) => ({
        ...w,
        parentSectionId: 'tmp',
        x: 0,
        y: 0
      }))
      const frame = computeSectionFrame(synthetic, layout)
      newSections.push({
        items,
        frame,
        color: CATEGORY_COLOR[cat],
        title: entry?.label ?? kind
      })
    }
    if (newSections.length === 0) return

    // Place new sections BELOW existing sections (avoid overlap with anything already on canvas)
    const existingSections = widgets.filter((w) => w.kind === 'section' && !w.pinned)
    let startY = PADDING
    if (existingSections.length > 0) {
      const existingBottom = existingSections.reduce((maxY, s) => {
        const sChildren = widgets.filter((c) => c.parentSectionId === s.id)
        const sFrame = computeSectionFrame(sChildren, effectiveLayout(s.layout))
        return Math.max(maxY, s.y + sFrame.height)
      }, 0)
      startY = existingBottom + GAP
    }

    // Flex-wrap using visible canvas width as the row limit
    const rect = dropRef.current?.getBoundingClientRect()
    const visibleW = rect ? rect.width / zoom : 1800
    const ROW_LIMIT_X = PADDING + visibleW
    let cursorX = PADDING
    let cursorY = startY
    let rowMaxH = 0

    for (const ns of newSections) {
      if (cursorX !== PADDING && cursorX + ns.frame.width > ROW_LIMIT_X) {
        cursorX = PADDING
        cursorY += rowMaxH + GAP
        rowMaxH = 0
      }
      const section = await createWidget({
        taskId: activeTaskId,
        kind: 'section',
        title: ns.title,
        content: '',
        x: cursorX,
        y: cursorY,
        width: ns.frame.width,
        height: ns.frame.height,
        color: ns.color
      })
      await updateWidget(section.id, { layout })
      for (const w of ns.items) {
        await updateWidget(w.id, { parentSectionId: section.id, x: 0, y: 0 })
      }
      cursorX += ns.frame.width + GAP
      rowMaxH = Math.max(rowMaxH, ns.frame.height)
    }
    bumpLayoutVersion()
  }

  function buildCtxMenu(): CtxMenuItem[] {
    if (!ctxMenu || !activeTaskId) return []
    const cx = ctxMenu.canvasX
    const cy = ctxMenu.canvasY
    const addWidget: CtxMenuItem = {
      label: 'Add object',
      icon: 'add',
      children: CATEGORIES.map((cat) => ({
        label: cat,
        icon: CATEGORY_ICON[cat],
        children: WIDGET_CATALOG.filter((e) => e.category === cat).map((entry) => ({
          label: entry.label,
          icon: entry.icon,
          onClick: () => void placeWidgetAtCanvas(entry, cx, cy)
        }))
      }))
    }
    const arrange: CtxMenuItem = {
      label: 'Auto-arrange',
      icon: 'view_module',
      children: [
        {
          label: 'Group by type',
          icon: 'workspaces',
          onClick: () => void groupByType(false)
        },
        {
          label: 'Stack by type',
          icon: 'layers',
          onClick: () => void groupByType(true)
        },
        {
          label: 'Clean up (Tidy)',
          icon: 'grid_view',
          onClick: () => void handleAutoArrange()
        }
      ]
    }
    return [
      addWidget,
      { separator: true },
      arrange,
      { separator: true },
      {
        label: 'Home — fit all to view',
        icon: 'home',
        shortcut: '⌘H',
        onClick: () => centerOnHome()
      },
      {
        label: 'Reset view',
        icon: 'center_focus_strong',
        shortcut: '⌘0',
        onClick: () => resetView()
      }
    ]
  }

  async function placeWidget(entry: WidgetCatalogEntry, x: number, y: number): Promise<void> {
    if (!activeTaskId) return
    await createWidget({
      taskId: activeTaskId,
      kind: entry.kind,
      content: entry.defaultContent,
      x: Math.round(x),
      y: Math.round(y),
      width: entry.defaultWidth,
      height: entry.defaultHeight,
      color: entry.kind === 'sticky' ? '#fef08a' : null
    })
  }

  function handleClickAdd(entry: WidgetCatalogEntry): void {
    const rect = dropRef.current?.getBoundingClientRect()
    if (!rect) {
      void placeWidget(entry, 80, 80)
      return
    }
    const screenCenterX = rect.width / 2
    const screenCenterY = rect.height / 2
    const center = screenToCanvas(screenCenterX, screenCenterY)
    const jitter = (): number => (Math.random() - 0.5) * 80
    void placeWidget(entry, center.x - entry.defaultWidth / 2 + jitter(), center.y - entry.defaultHeight / 2 + jitter())
  }

  async function handleImportFile(): Promise<void> {
    if (!activeTaskId) return
    const path = await window.api.fileImport.pick()
    if (!path) return // user cancelled
    const isMarkdown = /\.(md|markdown)$/i.test(path)
    const isTxt = /\.txt$/i.test(path)
    // Default mapping: .txt → note, .md → markdown. Tabular formats
    // self-elect on the backend.
    const preferredTextKind = isMarkdown ? 'markdown' : isTxt ? 'note' : 'page'
    const draft = await window.api.fileImport.run({ path, preferredTextKind })
    // ImportError has no `kind`; every success draft does. Narrowing on the
    // positive `kind` key reliably removes the error member from the union for
    // the branches below — the prior `'ok' in draft && draft.ok === false`
    // guard didn't narrow the fall-through, leaving draft.kind/title/etc.
    // unresolved across the whole handler.
    if (!('kind' in draft)) {
      // eslint-disable-next-line no-alert
      window.alert(draft.error)
      return
    }
    const rect = dropRef.current?.getBoundingClientRect()
    const center = rect
      ? screenToCanvas(rect.width / 2, rect.height / 2)
      : { x: 80, y: 80 }
    const jitter = (): number => (Math.random() - 0.5) * 60
    if (draft.kind === 'text') {
      // Use the catalog entry's default size when available so import
      // widgets feel like a natural drop, not a unique footprint.
      const targetCatalogKind: 'page' | 'markdown' | 'note' = draft.targetKind
      const entry = catalogFor(targetCatalogKind)
      const w = entry?.defaultWidth ?? 360
      const h = entry?.defaultHeight ?? 280
      await useWidgetStore.getState().create({
        taskId: activeTaskId,
        kind: targetCatalogKind,
        title: draft.title,
        content: draft.content,
        x: center.x - w / 2 + jitter(),
        y: center.y - h / 2 + jitter(),
        width: w,
        height: h,
        color: null
      })
    } else if (draft.kind === 'page-from-json') {
      const entry = catalogFor('page')
      const w = entry?.defaultWidth ?? 420
      const h = entry?.defaultHeight ?? 320
      await useWidgetStore.getState().create({
        taskId: activeTaskId,
        kind: 'page',
        title: draft.title,
        content: draft.content,
        x: center.x - w / 2 + jitter(),
        y: center.y - h / 2 + jitter(),
        width: w,
        height: h,
        color: null
      })
    } else if (draft.kind === 'table') {
      // CSV / array-of-objects JSON → create the backing table first,
      // append every parsed row, then spawn the widget pointing at it.
      const { useTablesStore } = await import('../stores/tables')
      const table = await useTablesStore.getState().createTable({
        taskId: activeTaskId,
        title: draft.title,
        schema: draft.schema
      })
      // Append rows. addRow expects cell values keyed by column id;
      // our import emits them keyed by label, so we re-key via the
      // schema.
      const byLabel = new Map(
        draft.schema.columns.map((c) => [c.label.toLowerCase(), c])
      )
      for (const row of draft.rows) {
        const cells: Record<string, unknown> = {}
        for (const [label, raw] of Object.entries(row)) {
          const col = byLabel.get(label.toLowerCase())
          if (!col) continue
          cells[col.id] = coerceImportedCell(col.type, raw)
        }
        if (Object.keys(cells).length > 0) {
          await useTablesStore.getState().addRow(table.id, cells)
        }
      }
      const entry = catalogFor('table')
      const w = entry?.defaultWidth ?? 480
      const h = entry?.defaultHeight ?? 320
      await useWidgetStore.getState().create({
        taskId: activeTaskId,
        kind: 'table',
        title: draft.title,
        content: table.id,
        x: center.x - w / 2 + jitter(),
        y: center.y - h / 2 + jitter(),
        width: w,
        height: h,
        color: null
      })
    }
  }

  // Light cell coercion mirroring actionExecutor.coerceCellValue but
  // inlined here so import doesn't have to thread its proposal through
  // the apply pipeline.
  function coerceImportedCell(
    type: import('@shared/fields').FieldDefinition['type'],
    raw: string
  ): unknown {
    if (raw === '') return type === 'checkbox' ? false : ''
    switch (type) {
      case 'number': {
        const n = Number(raw)
        return Number.isFinite(n) ? n : raw
      }
      case 'checkbox':
        return /^(true|yes|1)$/i.test(raw)
      default:
        return raw
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    const types = Array.from(e.dataTransfer.types)
    if (
      types.includes(DRAG_MIME) ||
      types.includes('text/fb-task-link') ||
      types.includes(CONNECTED_APP_DRAG_MIME) ||
      types.includes('Files')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    // OS file drop (drag from Finder) — spawn one file widget per dropped file.
    // We use ingestBuffer because Electron 32+ stripped File.path; reading via
    // arrayBuffer is the supported path and works for any file size up to the
    // renderer's memory budget.
    if (e.dataTransfer.files.length > 0 && activeTaskId) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const cursor = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      const entry = catalogFor('file')
      const width = entry?.defaultWidth ?? 360
      const height = entry?.defaultHeight ?? 280
      let offset = 0
      const filesArray = Array.from(e.dataTransfer.files)
      for (const f of filesArray) {
        const buffer = await f.arrayBuffer()
        const ingested = await window.api.files.ingestBuffer({
          buffer,
          originalName: f.name,
          mimeType: f.type || 'application/octet-stream'
        })
        await createWidget({
          taskId: activeTaskId,
          kind: 'file',
          title: f.name,
          content: ingested.id,
          x: Math.round(cursor.x - width / 2 + offset),
          y: Math.round(cursor.y - 20 + offset),
          width,
          height,
          color: null
        })
        offset += 24 // cascade subsequent drops slightly so they don't stack exactly
      }
      return
    }
    // Dragged Connected App from sidebar → spawn a webview widget bound to it.
    // Bound widgets share the app's session partition (so logged-in cookies
    // persist between full-pane view and canvas widget) and inherit its vault
    // auto-fill binding.
    const connectedAppId = e.dataTransfer.getData(CONNECTED_APP_DRAG_MIME)
    if (connectedAppId && activeTaskId) {
      e.preventDefault()
      const appsState = useConnectedAppsStore.getState()
      const app = appsState.apps.find((a) => a.id === connectedAppId) ?? null
      if (!app) return
      // Local apps can't render inside a <webview> — spawn a launcher tile
      // instead. Web apps get the existing webview widget with session sharing.
      const kind = app.kind === 'local' ? 'local-app-launcher' : 'webview'
      const entry = catalogFor(kind)
      const width = entry?.defaultWidth ?? (kind === 'local-app-launcher' ? 200 : 560)
      const height = entry?.defaultHeight ?? (kind === 'local-app-launcher' ? 120 : 400)
      const rect = e.currentTarget.getBoundingClientRect()
      const cursor = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      await createWidget({
        taskId: activeTaskId,
        kind,
        title: app.title,
        content: kind === 'webview' ? app.url : '',
        x: Math.round(cursor.x - width / 2),
        y: Math.round(cursor.y - 20),
        width,
        height,
        color: null,
        sourceAppId: app.id
      })
      void appsState.touch(app.id)
      return
    }
    // Dragged task from sidebar → spawn a task-link widget
    const taskId = e.dataTransfer.getData('text/fb-task-link')
    if (taskId && activeTaskId && taskId !== activeTaskId) {
      e.preventDefault()
      const entry = catalogFor('task-link')
      if (!entry) return
      const rect = e.currentTarget.getBoundingClientRect()
      const cursor = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      await createWidget({
        taskId: activeTaskId,
        kind: 'task-link',
        title: '',
        content: taskId,
        x: Math.round(cursor.x - entry.defaultWidth / 2),
        y: Math.round(cursor.y - 20),
        width: entry.defaultWidth,
        height: entry.defaultHeight,
        color: null
      })
      return
    }
    // Standard palette → widget drop
    const kind = e.dataTransfer.getData(DRAG_MIME) as WidgetKind
    if (!kind) return
    e.preventDefault()
    const entry = catalogFor(kind)
    if (!entry) return
    const rect = e.currentTarget.getBoundingClientRect()
    const cursor = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
    void placeWidget(entry, cursor.x - entry.defaultWidth / 2, cursor.y - 20)
  }

  function handleSaveTemplate(): void {
    if (!activeTaskId || widgets.length === 0 || savingTemplate) return
    setSaveTemplateOpen({ context: 'toolbar' })
  }

  // Spawn a browser (webview) widget for a standard app — used by the starting
  // kit's "open a browser" quick-adds. Staggered so multiple don't stack.
  async function addBrowserApp(app: StandardApp): Promise<void> {
    if (!activeTaskId) return
    const entry = catalogFor('webview')
    const n = useWidgetStore.getState().widgets.filter((w) => !w.pinned).length
    await createWidget({
      taskId: activeTaskId,
      kind: 'webview',
      title: app.title,
      content: app.url,
      x: 60 + (n % 5) * 36,
      y: 60 + (n % 5) * 36,
      width: entry?.defaultWidth ?? 520,
      height: entry?.defaultHeight ?? 360
    })
  }

  // AI Builder accept path. Distinct from handleAISetupAccept because each
  // suggestion can carry a richer payload (table schema, Tiptap doc, field
  // def) that needs translating into the corresponding storage layer before
  // the widget can be spawned.
  async function handleAiBuilderAccept(suggestions: AiBuildSuggestion[]): Promise<void> {
    if (!activeTaskId || !dropRef.current) return
    const rect = dropRef.current.getBoundingClientRect()
    const visibleW = rect.width / zoom
    const PADDING = 60
    const GAP = 24
    const existing = widgets.filter((w) => !w.pinned && !w.parentSectionId)
    const startBelow = existing.reduce((maxY, w) => {
      let h = w.height
      if (w.kind === 'section') {
        const ch = widgets.filter((c) => c.parentSectionId === w.id)
        const fr = computeSectionFrame(ch, effectiveLayout(w.layout))
        h = fr.height
      }
      return Math.max(maxY, w.y + h)
    }, 0)
    let cursorX = PADDING
    let cursorY = existing.length > 0 ? startBelow + 40 : PADDING
    let rowMaxH = 0
    for (const s of suggestions) {
      const entry = catalogFor(s.kind)
      const w = entry?.defaultWidth ?? 300
      const h = entry?.defaultHeight ?? 200
      if (cursorX !== PADDING && cursorX + w > PADDING + visibleW) {
        cursorX = PADDING
        cursorY += rowMaxH + GAP
        rowMaxH = 0
      }
      // Per-kind translation: turn the suggestion's payload into the
      // widget.content + any backing entity (e.g. fb_tables row).
      let content = s.content ?? ''
      let title = s.title || ''
      if (s.kind === 'table' && s.tableSchema) {
        // Provision the backing table now so widget.content is the table id.
        // The AI returned columns in the shared FieldDefinition shape; we
        // trust the structure but the IPC layer would defensively reject
        // unknown column types.
        try {
          const created = await window.api.tables.create({
            taskId: activeTaskId,
            title: s.title || 'Untitled',
            schema: {
              columns: s.tableSchema.columns.map((c) => ({
                id: c.id,
                type: c.type,
                label: c.label,
                config: c.config
              })) as never
            }
          })
          content = created.id
        } catch {
          // Fall through: spawn an empty table widget that will auto-
          // provision its own schema on first render.
          content = ''
        }
      } else if (s.kind === 'page' && s.pageContent) {
        // Tiptap stores its content as a JSON object; we serialize so the
        // existing widget.content string field can carry it.
        content = JSON.stringify(s.pageContent)
      } else if (s.kind === 'field' && s.fieldDef) {
        // The FieldWidget reads content as `{ def, value }` JSON; we wrap
        // the AI-provided def with a defaultValue for its type. Type isn't
        // fully validated here — the FieldWidget's switch will gracefully
        // show "unsupported field" if the AI returns a type we don't render.
        content = JSON.stringify({
          def: s.fieldDef,
          // We can't import defaultValue from @shared/fields without making
          // Canvas.tsx aware of every field type — but the FieldWidget
          // handles a null/missing value by substituting the default itself.
          value: null
        })
        title = s.fieldDef.label || s.title
      }
      await createWidget({
        taskId: activeTaskId,
        kind: s.kind,
        title,
        content,
        x: Math.round(cursorX),
        y: Math.round(cursorY),
        width: w,
        height: h,
        color: s.kind === 'sticky' ? '#fef08a' : null
      })
      cursorX += w + GAP
      rowMaxH = Math.max(rowMaxH, h)
    }
    chimeIn()
    bumpLayoutVersion()
    setTimeout(() => centerOnHome(), 100)
  }

  async function handleAISetupAccept(suggestions: WidgetSuggestion[]): Promise<void> {
    if (!activeTaskId || !dropRef.current) return
    const rect = dropRef.current.getBoundingClientRect()
    const visibleW = rect.width / zoom
    const PADDING = 60
    const GAP = 24
    // Find a starting Y below existing canvas content so we don't overlap
    const existing = widgets.filter((w) => !w.pinned && !w.parentSectionId)
    const startBelow = existing.reduce((maxY, w) => {
      let h = w.height
      if (w.kind === 'section') {
        const ch = widgets.filter((c) => c.parentSectionId === w.id)
        const fr = computeSectionFrame(ch, effectiveLayout(w.layout))
        h = fr.height
      }
      return Math.max(maxY, w.y + h)
    }, 0)
    let cursorX = PADDING
    let cursorY = existing.length > 0 ? startBelow + 40 : PADDING
    let rowMaxH = 0
    for (const s of suggestions) {
      const entry = catalogFor(s.kind)
      const w = entry?.defaultWidth ?? 300
      const h = entry?.defaultHeight ?? 200
      if (cursorX !== PADDING && cursorX + w > PADDING + visibleW) {
        cursorX = PADDING
        cursorY += rowMaxH + GAP
        rowMaxH = 0
      }
      await createWidget({
        taskId: activeTaskId,
        kind: s.kind,
        title: s.title || '',
        content: s.content || (entry?.defaultContent ?? ''),
        x: Math.round(cursorX),
        y: Math.round(cursorY),
        width: w,
        height: h,
        color: s.kind === 'sticky' ? '#fef08a' : null
      })
      cursorX += w + GAP
      rowMaxH = Math.max(rowMaxH, h)
    }
    chimeIn()
    bumpLayoutVersion()
    // Pan/zoom so the freshly spawned widgets land in view
    setTimeout(() => centerOnHome(), 100)
  }

  async function handleAutoArrange(): Promise<void> {
    if (widgets.length === 0 || !dropRef.current) return
    const rect = dropRef.current.getBoundingClientRect()
    const visibleW = rect.width / zoom
    const PADDING = 60
    const GAP = 40
    const catOrder: Record<WidgetCategory, number> = {
      Notes: 0,
      Web: 1,
      Files: 2,
      Tools: 3,
      Comms: 4,
      Layout: 5
    }

    type LayoutItem = {
      id: string
      w: number
      h: number
      catRank: number
      createdAt: number
    }
    const items: LayoutItem[] = []
    for (const w of widgets) {
      if (w.pinned) continue
      if (w.parentSectionId) continue
      let width = w.width
      let height = w.height
      if (w.kind === 'section') {
        const sChildren = widgets.filter((c) => c.parentSectionId === w.id)
        const frame = computeSectionFrame(sChildren, effectiveLayout(w.layout))
        width = frame.width
        height = frame.height
      }
      items.push({
        id: w.id,
        w: width,
        h: height,
        catRank: catOrder[catalogFor(w.kind)?.category ?? 'Notes'],
        createdAt: w.createdAt
      })
    }
    if (items.length === 0) return

    items.sort((a, b) => a.catRank - b.catRank || a.createdAt - b.createdAt)

    let cursorX = PADDING
    let cursorY = PADDING
    let rowMaxH = 0
    const positions = new Map<string, { x: number; y: number }>()
    for (const item of items) {
      if (cursorX !== PADDING && cursorX + item.w > PADDING + visibleW) {
        cursorX = PADDING
        cursorY += rowMaxH + GAP
        rowMaxH = 0
      }
      positions.set(item.id, { x: Math.round(cursorX), y: Math.round(cursorY) })
      cursorX += item.w + GAP
      rowMaxH = Math.max(rowMaxH, item.h)
    }
    for (const [id, pos] of positions) {
      await updateWidget(id, { x: pos.x, y: pos.y })
    }
    bumpLayoutVersion()
  }

  if (!activeTask) {
    return (
      <>
        <div className="h-full flex items-center justify-center desk-paper">
          <div className="text-center max-w-md px-6">
            <Icon name="desk" size={48} className="text-stone-400 dark:text-stone-500 mb-3" />
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Your desk is clear</h2>
            <p className="text-stone-600 dark:text-stone-300 text-sm leading-relaxed">
              Pick a task from the left to bring it to the desk — its sticky notes, browser windows
              and tools will appear here.
            </p>
          </div>
        </div>
        <WidgetFocusMode />
      </>
    )
  }

  const status = STATUS_META[activeTask.status]
  const zoomPct = Math.round(zoom * 100)

  // Task time tracking
  const totalEstimateMin =
    (activeTask.estimateMinutes ?? 0) + (activeTask.extensionsMinutes ?? 0)
  const isTracked =
    activeTask.status === 'in_progress' &&
    !!activeTask.estimateMinutes &&
    !!activeTask.startedAt
  const elapsedMs =
    isTracked && activeTask.startedAt ? Date.now() - activeTask.startedAt : 0
  const elapsedMin = elapsedMs / 60000
  const remainingMin = isTracked ? totalEstimateMin - elapsedMin : 0
  const isOverdue = isTracked && remainingMin < 0
  const showExtensionPrompt = isOverdue && Date.now() > snoozeUntil

  function fmtMin(min: number): string {
    const abs = Math.abs(min)
    const m = Math.floor(abs)
    const s = Math.floor((abs - m) * 60)
    const sign = min < 0 ? '-' : ''
    return `${sign}${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <CanvasBreadcrumb
          activeTask={activeTask}
          nodes={nodes}
          onOpenTask={(id) => setActiveTask(id)}
          onRevealFolder={(id) => expandFolder(id, true)}
          onHome={() => setActiveTask(null)}
          fromMindmap={!!nodeOrigin}
        />
        <div className="px-4 py-2.5 border-b border-[color:var(--glass-chrome-border)] fb-glass-chrome flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Icon name="task_alt" size={18} className="text-stone-700 dark:text-stone-300 shrink-0" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate flex-1 min-w-[80px]">
            {activeTask.title}
          </h2>
          <div className="hidden md:flex items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1" title="Priority">
              <Icon name="priority_high" size={14} />
              {activeTask.priority}
            </span>
            <span className="flex items-center gap-1" title="Interest / Novelty">
              <Icon name="bolt" size={14} />
              {activeTask.interest}
            </span>
            <span className="flex items-center gap-1" title="Importance">
              <Icon name="flag" size={14} />
              {activeTask.importance}
            </span>
          </div>

          {isTracked && (
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono ${
                isOverdue
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 animate-pulse'
                  : remainingMin < 5
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400'
                    : 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300'
              }`}
              title={`${Math.floor(elapsedMin)} of ${totalEstimateMin} min elapsed`}
            >
              <Icon name={isOverdue ? 'alarm' : 'timer'} size={14} />
              <span>{fmtMin(remainingMin)}</span>
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 px-1 border border-stone-300 dark:border-stone-600 rounded">
            <button
              onClick={() => setZoom(zoom - 0.1)}
              className="icon-btn !h-6 !w-6"
              title="Zoom out (⌘[)"
            >
              <Icon name="remove" size={14} />
            </button>
            <button
              onClick={resetView}
              className="text-[11px] text-stone-700 dark:text-stone-300 font-mono px-1.5 min-w-[42px] hover:text-stone-900 dark:hover:text-stone-100"
              title="Reset view (⌘0)"
            >
              {zoomPct}%
            </button>
            <button
              onClick={() => setZoom(zoom + 0.1)}
              className="icon-btn !h-6 !w-6"
              title="Zoom in (⌘])"
            >
              <Icon name="add" size={14} />
            </button>
          </div>

          <LoadMeter />
          <button
            onClick={() => void handleAutoArrange()}
            disabled={widgets.length === 0}
            className="btn-ghost"
            title="Lay widgets out in tidy rows by category"
          >
            <Icon name="grid_view" size={14} />
            <span>Tidy</span>
          </button>
          <button
            onClick={() => void updateNode(activeTask.id, { status: status.next })}
            className="btn-ghost"
            title={`Mark as ${status.next.replace('_', ' ')}`}
          >
            <Icon name={status.icon} size={14} />
            <span>{status.label}</span>
          </button>
          <button
            onClick={() => setShowAiBuilder(true)}
            className="btn-ghost"
            title="Describe what you want to build — AI suggests pages, tables, fields, files"
          >
            <Icon name="auto_fix_high" size={14} className="text-accent" />
            <span>Build with AI</span>
          </button>
          <button
            onClick={() => setShowAISetup(true)}
            className="btn-ghost"
            title="Let the AI suggest widgets you need to start this task"
          >
            <Icon name="auto_awesome" size={14} className="text-accent" />
            <span>AI Setup</span>
          </button>
          <FivePromiseButton taskId={activeTask.id} />
          <button
            onClick={() => setShowResume(true)}
            className={`btn-ghost ${activeTask.resumeMarkdown ? '!text-stone-900' : ''}`}
            title={
              activeTask.resumeMarkdown
                ? 'View / regenerate your handoff document'
                : 'Generate a handoff document to resume this task later'
            }
          >
            <Icon
              name="description"
              size={14}
              filled={!!activeTask.resumeMarkdown}
              className={activeTask.resumeMarkdown ? 'text-amber-600' : ''}
            />
            <span>Resume</span>
          </button>
          <button
            onClick={() => void handleSaveTemplate()}
            disabled={widgets.length === 0 || savingTemplate}
            className="btn-ghost"
            title="Save this workspace layout as a reusable template"
          >
            <Icon name="bookmark_add" size={14} />
            <span>{savingTemplate ? 'Saving…' : 'Save template'}</span>
          </button>
          {/* Compact desk-objects palette — single "+ Add" button that
              opens a portalled popover with categorised chips. Replaces
              the previous full-width horizontal strip that wasted ~100px
              of vertical real estate even when collapsed. */}
          <WidgetPalette
            onAdd={handleClickAdd}
            onImport={() => void handleImportFile()}
            onBringSynced={activeTaskId ? () => setSyncPickerOpen(true) : undefined}
            disabled={!activeTaskId}
          />
        </div>

        <div
          ref={dropRef}
          data-bare-canvas
          data-canvas-surface="true"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          onContextMenu={handleCanvasContextMenu}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          className="flex-1 relative overflow-hidden desk-paper"
          style={{ overscrollBehavior: 'none', cursor: grabbing ? 'grabbing' : undefined }}
        >
          {panPing && (
            <div
              className="absolute pointer-events-none z-[200]"
              style={{ left: panPing.x, top: panPing.y, transform: 'translate(-50%, -50%)' }}
            >
              <span className="block h-10 w-10 rounded-full border-2 border-accent/70 animate-ping" />
              <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-accent shadow" />
            </div>
          )}
          {showStartingKit && nodeOrigin && activeTaskId && (
            <MindmapStartingKit
              taskId={activeTaskId}
              nodeLabel={nodeOrigin.nodeLabel}
              nodePath={nodeOrigin.nodePath}
              onAddWidgets={handleAiBuilderAccept}
              onAddBrowser={addBrowserApp}
              onDismiss={() => {
                if (activeTaskId) dismissKit(activeTaskId)
                setKitDismissTick((t) => t + 1)
              }}
            />
          )}
          {/* Marquee selection box — screen-space projection of the canvas-space
              rubber-band rect, so the marching ants stay 1px crisp at any zoom. */}
          {rubberRect && (
            <div
              className="fb-marquee absolute pointer-events-none z-[150]"
              style={{
                left: rubberRect.x * zoom + panX,
                top: rubberRect.y * zoom + panY,
                width: rubberRect.w * zoom,
                height: rubberRect.h * zoom
              }}
            />
          )}
          {/* Floating selection toolbar — appears above the selection's bounding
              box. Hidden mid-marquee and during a group drag (positions in flux). */}
          {selectionBBox && !rubberRect && !groupDragActive && (
            <div
              className="absolute z-[210]"
              style={{
                left: ((selectionBBox.minX + selectionBBox.maxX) / 2) * zoom + panX,
                top: selectionBBox.minY * zoom + panY - 12,
                transform: 'translate(-50%, -100%)'
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-0.5 rounded-full bg-stone-900/92 backdrop-blur px-1.5 py-1 shadow-xl ring-1 ring-white/10 text-stone-100">
                <span className="px-2 text-[11px] font-medium tabular-nums whitespace-nowrap">
                  {selectionBBox.count} selected
                </span>
                <div className="h-4 w-px bg-white/20" />
                <button
                  onClick={() => void groupIntoSection()}
                  title="Group into a section"
                  className="h-7 px-2 inline-flex items-center gap-1 rounded-full hover:bg-white/15 text-[11px]"
                >
                  <Icon name="dashboard" size={13} />
                  <span>Group</span>
                </button>
                <button
                  onClick={() => void duplicateSelection()}
                  title="Duplicate all selected"
                  aria-label="Duplicate selected"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-white/15"
                >
                  <Icon name="content_copy" size={13} />
                </button>
                <button
                  onClick={() => void deleteSelection()}
                  title="Delete all selected"
                  aria-label="Delete selected"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-rose-500/30 text-rose-200"
                >
                  <Icon name="delete" size={13} />
                </button>
                <div className="h-4 w-px bg-white/20" />
                <button
                  onClick={() => clearSelection()}
                  title="Clear selection (Esc)"
                  aria-label="Clear selection"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-white/15"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            </div>
          )}
          {widgets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-stone-500">
                Drag an object from the palette onto the desk.
              </p>
            </div>
          )}
          <LinkDragContext.Provider value={linkDragController}>
          <div
            data-bare-canvas
            className={`absolute top-0 left-0 will-change-transform ${
              animatingPan ? 'transition-transform duration-[280ms] ease-out' : ''
            }`}
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            {/* Sections first (render behind non-section widgets). Sections render their own children. */}
            {widgets.map((w) => {
              if (w.archived) return null
              if (w.pinned || w.kind !== 'section') return null
              return (
                <div key={`${w.id}-${layoutVersion}`}>{renderWidget(w)}</div>
              )
            })}
            {widgets.map((w) => {
              if (w.archived) return null
              if (w.pinned || w.kind === 'section') return null
              if (w.parentSectionId !== null) return null // owned by a section, rendered inside it
              // For web kinds, fully UNMOUNT the focused widget so its unmount-flush
              // commits the latest URL before focus mode's separate WebViewWidget mounts.
              if (focusedId === w.id && isWebKind(w.kind)) return null
              return (
                <div key={`${w.id}-${layoutVersion}`}>
                  {renderWidget(w)}
                </div>
              )
            })}
          </div>
          {/* Spatial-link overlay renders in screen-space, OUTSIDE the
              transformed container. It reads each linked widget's actual
              rendered position via getBoundingClientRect on every frame
              during a drag, so lines can never visually detach from the
              widget they're attached to. Pinned widgets and section
              children are excluded from linking in v1. */}
          <LinkOverlay
            ghost={
              linkSourceId && ghostCursor
                ? {
                    fromWidgetId: linkSourceId,
                    cursorScreenX: ghostCursor.x,
                    cursorScreenY: ghostCursor.y
                  }
                : null
            }
          />
          </LinkDragContext.Provider>
          {/* Pinned-widget layer: screen-space, in front of the transformed canvas.
              Zone-pinned widgets have their position computed here and provided
              via PinLayoutContext so any nested WidgetFrame can look up its
              docked rect without prop-drilling through every widget kind. */}
          <PinnedLayer
            widgets={widgets}
            layoutVersion={layoutVersion}
            focusedId={focusedId}
            renderWidget={renderWidget}
          />
          <FloatingToolbar
            actions={(() => {
              // Quick-jump buttons for every section currently on the canvas
              const sections = widgets.filter((w) => w.kind === 'section' && !w.pinned)
              const sectionJumps: ToolbarAction[] = sections.map((s, idx) => {
                const entry = WIDGET_CATALOG.find((e) => e.label === s.title)
                return {
                  icon: entry?.icon ?? 'crop_free',
                  label: s.title || 'Section',
                  color: s.color ?? undefined,
                  onClick: () => focusOn(s.id),
                  separatorAfter: idx === sections.length - 1
                }
              })
              const staticActions: ToolbarAction[] = [
                {
                  icon: 'layers',
                  label: 'Stack by type',
                  onClick: () => void groupByType(true)
                },
                {
                  icon: 'grid_view',
                  label: 'Tile by type',
                  onClick: () => void groupByType(false),
                  separatorAfter: true
                },
                {
                  icon: 'auto_fix_high',
                  label: 'Clean up',
                  onClick: () => void handleAutoArrange(),
                  separatorAfter: true
                },
                {
                  icon: 'home',
                  label: 'Home',
                  shortcut: '⌘H',
                  onClick: () => centerOnHome()
                },
                {
                  icon: 'center_focus_strong',
                  label: 'Reset view',
                  shortcut: '⌘0',
                  onClick: () => resetView()
                }
              ]
              return [...sectionJumps, ...staticActions]
            })()}
          />
          {activeId && !linkSourceId && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-stone-900/85 backdrop-blur text-[11px] text-stone-50 shadow flex items-center gap-1.5 pointer-events-none">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>Widget active · click outside or press Esc to pan canvas</span>
            </div>
          )}
          {/* Edge-pan boundary indicators — subtle violet glow hugging
              each edge. Idle: faint breathing hairline so the user
              discovers the affordance. Active: brighter halo that
              matches the live mouse intensity from useEdgePan. Hidden
              while a widget is being edited (so editing UI isn't
              competing with ambient motion) — but EXPLICITLY shown
              again while the user is mid-drag, which is exactly when
              edge-pan matters most. */}
          <CanvasEdgeIndicators
            intensity={edgeIntensity}
            visible={!animatingPan}
          />
          {/* Minimap is now a standard widget kind — per-task, pinned to BR
              by default, auto-created on first task open (see the minimap
              auto-create effect earlier in this component). The legacy
              standalone CanvasMinimap render lived here. */}
          {/* Zoom + pan controls — bottom-left. Mirrors the 2.0 mockup. */}
          <ZoomControls />
          {/* Right-side AI Assistant rail — workspace health + next actions
              + AI suggestions. Collapsible; user preference persisted. The
              projectId is resolved by walking up the active task's parent
              chain to the first folder, so the rail's health scope matches
              the project the user is inside. */}
          {activeTaskId && (() => {
            let cur: typeof nodes[number] | undefined = nodes.find(
              (n) => n.id === activeTaskId
            )
            while (cur && cur.kind === 'task') {
              const parentId: string | null = cur.parentId
              cur = parentId ? nodes.find((n) => n.id === parentId) : undefined
            }
            return <CanvasAIAssistantRail projectId={cur?.id ?? null} />
          })()}
          {linkSourceId && (() => {
            const src = widgets.find((w) => w.id === linkSourceId)
            const label = src?.title || src?.kind || 'widget'
            return (
              <div
                data-link-skip
                className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-[11px] shadow-lg flex items-center gap-2 z-40"
                style={{
                  backgroundColor: 'rgb(var(--accent))',
                  color: 'white'
                }}
              >
                <Icon name="hub" size={13} />
                <span>
                  Linking from <strong className="font-semibold">{label}</strong> · click another widget to connect
                </span>
                <button
                  data-link-skip
                  onClick={(e) => {
                    e.stopPropagation()
                    setLinkSourceId(null)
                    setGhostCursor(null)
                  }}
                  className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-white/20"
                  aria-label="Cancel linking"
                  title="Cancel (Esc)"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            )
          })()}
        </div>

        <WidgetDock />
      </div>
      <WidgetFocusMode />
      {saveTemplateOpen && activeTask && (
        <SaveTemplateDialog
          task={activeTask}
          context={saveTemplateOpen.context}
          onClose={() => setSaveTemplateOpen(null)}
        />
      )}
      {showResume && activeTask && (
        <ResumeModal task={activeTask} onClose={() => setShowResume(false)} />
      )}
      {showAISetup && activeTask && (
        <AISetupDialog
          task={activeTask}
          onClose={() => setShowAISetup(false)}
          onAccept={handleAISetupAccept}
        />
      )}
      {showAiBuilder && (
        <AiBuilderDialog
          taskId={activeTaskId ?? null}
          onClose={() => setShowAiBuilder(false)}
          onAccept={handleAiBuilderAccept}
        />
      )}
      {syncPickerOpen && activeTaskId && (
        <SyncWidgetPicker targetTaskId={activeTaskId} onClose={() => setSyncPickerOpen(false)} />
      )}
      {ctxMenu && (
        <CanvasContextMenu
          x={ctxMenu.screenX}
          y={ctxMenu.screenY}
          items={buildCtxMenu()}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {showExtensionPrompt && (
        <ExtensionPrompt
          task={activeTask}
          elapsedMin={elapsedMin}
          totalEstimateMin={totalEstimateMin}
          onExtend={(min) => {
            void updateNode(activeTask.id, {
              extensionsMinutes: (activeTask.extensionsMinutes ?? 0) + min
            })
            setSnoozeUntil(0)
          }}
          onMarkDone={() => {
            void updateNode(activeTask.id, { status: 'done' })
            setSnoozeUntil(0)
          }}
          onSnooze={() => setSnoozeUntil(Date.now() + 5 * 60 * 1000)}
        />
      )}
    </>
  )
}

function FivePromiseButton({ taskId }: { taskId: string }): JSX.Element {
  const active = useFocusSessionStore((s) => s.active)
  const start = useFocusSessionStore((s) => s.start)
  const isOnThisTask = active?.taskId === taskId
  if (isOnThisTask) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-accent cursor-default"
        title="5-Minute Promise running — see the pill at top of canvas"
      >
        <Icon name="bolt" size={14} filled />
        <span>In session</span>
      </span>
    )
  }
  return (
    <button
      onClick={() => {
        // Fire chime on user gesture (autoplay-friendly) then start the session
        futuristicPowerOn()
        void start(taskId, 5 * 60, '5min')
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white transition-all hover:brightness-110"
      style={{ backgroundColor: 'rgb(var(--accent))' }}
      title="The 5-Minute Promise: just five minutes, no commitment past that. The most-evidence-backed ADHD initiation technique."
    >
      <Icon name="bolt" size={14} />
      <span>Just 5 min</span>
    </button>
  )
}

// ── Pinned-widget layer ─────────────────────────────────────────────────────
// Lives screen-space above the transformed canvas. Tracks its own bounding
// box (the main pane minus the canvas chrome) via ResizeObserver, then
// computes zone-pin positions for any widget with a pinnedZone set. The
// computed positions are dropped into a Map provided via PinLayoutContext so
// the deeply-nested WidgetFrame inside each pinned widget can read its own
// zone rect without prop-drilling through every widget kind.

function PinnedLayer({
  widgets,
  layoutVersion,
  focusedId,
  renderWidget
}: {
  widgets: Widget[]
  layoutVersion: number
  focusedId: string | null
  renderWidget: (w: Widget) => JSX.Element | null
}): JSX.Element {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  // Subscribe to the AI rail's collapsed state so any change re-runs the
  // pin-position memo. When the rail opens, BR/TR widgets glide left by
  // AI_RAIL_WIDTH + gap; when it collapses to the small icon, they glide
  // back. ChromeInsets is the single point where rail width + (later)
  // dock height + zoom-controls inset get composed.
  const railCollapsed = useAIRailCollapsed()
  const insets: ChromeInsets = useMemo(
    () => ({
      top: 0,
      right: railCollapsed ? AI_RAIL_BUTTON_SIZE + 8 : AI_RAIL_WIDTH + 12,
      bottom: 0,
      left: 0
    }),
    [railCollapsed]
  )

  useEffect(() => {
    const el = layerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setBounds({ width: r.width, height: r.height })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    setBounds({ width: rect.width, height: rect.height })
    return () => ro.disconnect()
  }, [])

  const zonePositions = useMemo(
    () => computeZonePinPositions(widgets, bounds, insets),
    [widgets, bounds, insets]
  )

  return (
    <PinLayoutContext.Provider value={zonePositions}>
      <div
        ref={layerRef}
        className="absolute inset-0 z-30 pointer-events-none"
        data-pinned-layer
      >
        {widgets.map((w) => {
          if (w.archived) return null
          if (!w.pinned || w.kind !== 'section') return null
          return (
            <div key={`${w.id}-pin-${layoutVersion}`}>{renderWidget(w)}</div>
          )
        })}
        {widgets.map((w) => {
          if (w.archived) return null
          if (!w.pinned || w.kind === 'section') return null
          if (w.parentSectionId !== null) return null
          if (focusedId === w.id && isWebKind(w.kind)) return null
          return (
            <div key={`${w.id}-pin-${layoutVersion}`}>{renderWidget(w)}</div>
          )
        })}
      </div>
    </PinLayoutContext.Provider>
  )
}
