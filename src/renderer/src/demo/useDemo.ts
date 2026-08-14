import { create } from 'zustand'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import { useFocusSplitStore } from '../stores/focusSplit'
import { useDocumentsStore } from '../stores/documents'
import { tidyPositions } from '../lib/autoArrange'
import { useAssistantChrome } from '../stores/assistantChrome'
import { useChatStore } from '../stores/chat'
import { tween, type DemoContext, type DemoScenario } from './demoEngine'
import { scenarioWeek } from './scenarioWeek'

// Registry — add a scenario here and it appears in the demo launcher.
export const SCENARIOS: DemoScenario[] = [scenarioWeek]

interface DemoStore {
  active: boolean
  paused: boolean
  currentStep: number
  totalSteps: number
  scenarioTitle: string
  scenarioSubtitle: string
  scenarioId: number | null
  demoComplete: boolean
  _caption: string
  _act: string
  _actor: 'you' | 'ai' | null
  _createdNodeIds: string[]
  _createdWidgetIds: string[]
  _createdDocIds: string[]
  _cancelFlag: { cancelled: boolean }

  startScenario: (id: number) => Promise<void>
  pause: () => void
  resume: () => void
  skip: () => void
  exit: (keepWorkspace?: boolean) => Promise<void>
}

// Step-advance resolvers live outside zustand so they never get serialised or
// trigger a re-render on every tick.
let _resolveStep: (() => void) | null = null
let _stepTimer: ReturnType<typeof setTimeout> | null = null

function clearStepTimer(): void {
  if (_stepTimer !== null) {
    clearTimeout(_stepTimer)
    _stepTimer = null
  }
}

export const useDemoStore = create<DemoStore>((set, get) => ({
  active: false,
  paused: false,
  currentStep: 0,
  totalSteps: 0,
  scenarioTitle: '',
  scenarioSubtitle: '',
  scenarioId: null,
  demoComplete: false,
  _caption: '',
  _act: '',
  _actor: null,
  _createdNodeIds: [],
  _createdWidgetIds: [],
  _createdDocIds: [],
  _cancelFlag: { cancelled: false },

  startScenario: async (id) => {
    const existing = get()
    if (existing.active) await existing.exit(true)

    const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]

    const cancelFlag = { cancelled: false }
    const createdNodeIds: string[] = []
    const createdWidgetIds: string[] = []
    const createdDocIds: string[] = []
    let deskId: string | null = null

    set({
      active: true,
      paused: false,
      currentStep: 0,
      totalSteps: scenario.steps.length,
      scenarioTitle: scenario.title,
      scenarioSubtitle: scenario.subtitle ?? '',
      scenarioId: scenario.id,
      demoComplete: false,
      _caption: '',
      _act: '',
      _actor: null,
      _createdNodeIds: createdNodeIds,
      _createdWidgetIds: createdWidgetIds,
      _createdDocIds: createdDocIds,
      _cancelFlag: cancelFlag
    })

    const ctx: DemoContext = {
      get deskId() {
        return deskId
      },
      setDeskId(id: string) {
        deskId = id
      },
      isCancelled: () => cancelFlag.cancelled,

      createNode: async (draft) => {
        const node = await useNodeStore.getState().create(draft)
        createdNodeIds.push(node.id)
        return node
      },

      updateNode: async (id, patch) => {
        await useNodeStore.getState().update(id, patch)
      },

      createWidget: async (draft) => {
        const widget = await useWidgetStore.getState().create(draft)
        createdWidgetIds.push(widget.id)
        return widget
      },

      updateWidgetContent: async (id, content) => {
        await useWidgetStore.getState().update(id, { content })
      },

      setActiveTask: (id) => {
        useNodeStore.getState().setActive(id)
      },

      navigate: (taskId) => {
        useViewStore.getState().goTask(taskId)
      },

      camera: async ({ x, y, zoom, ms = 900 }) => {
        const w = useWidgetStore.getState()
        const from = { x: w.panX, y: w.panY, zoom: w.zoom }
        const to = {
          x: x ?? from.x,
          y: y ?? from.y,
          zoom: zoom ?? from.zoom
        }
        await tween(from, to, ms, (v) => {
          if (cancelFlag.cancelled) return
          const s = useWidgetStore.getState()
          s.setPan(v.x, v.y)
          s.setZoom(v.zoom)
        })
      },

      assistant: (open, tab) => {
        const chrome = useAssistantChrome.getState()
        if (open) {
          if (tab) chrome.setTab(tab)
          chrome.openPanel()
        } else {
          chrome.close()
        }
      },

      chatSay: (content) => {
        useChatStore.getState().pushAssistantMessage(deskId, content)
      },

      focus: (widgetId) => {
        // Same state a canvas double-click sets — Focus Mode reads
        // widgets.focusedWidgetId, so this is the real path, not a simulation.
        useWidgetStore.getState().setFocused(widgetId)
      },

      splitWith: (widgetId) => {
        const focused = useWidgetStore.getState().focusedWidgetId
        const split = useFocusSplitStore.getState()
        if (focused && split.state.panes.length <= 1) {
          split.initFromSource({ kind: 'widget', widgetId: focused })
        }
        split.addPane({ kind: 'widget', widgetId }, 'R')
      },

      unsplit: () => {
        useFocusSplitStore.getState().reset()
      },

      tidy: async (mode = 'square') => {
        if (!deskId) return
        const widgets = useWidgetStore.getState().widgets.filter((w) => w.taskId === deskId)
        if (widgets.length === 0) return
        // tidyPositions is pure — it returns coordinates and the caller commits
        // them, exactly as the Tidy menu does from Canvas.
        const placed = tidyPositions(
          widgets.map((w) => ({ id: w.id, w: w.width, h: w.height })),
          { mode },
          1600
        )
        for (const p of placed) {
          if (cancelFlag.cancelled) return
          await useWidgetStore.getState().update(p.id, { x: p.x, y: p.y })
        }
      },

      createDocWidget: async (docType, title, box) => {
        // A real fb_documents row, then a widget whose content is its id —
        // exactly how the app's own "Document" widget is created.
        const doc = await useDocumentsStore.getState().createBlank(docType, title)
        const widget = await useWidgetStore.getState().create({
          taskId: deskId ?? '',
          kind: docType === 'doc' ? 'doc' : docType === 'sheet' ? 'sheet' : 'map',
          title,
          content: doc.id,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        })
        createdWidgetIds.push(widget.id)
        createdDocIds.push(doc.id)
        return { widgetId: widget.id, docId: doc.id }
      },

      writeDoc: async (docId, paragraphs) => {
        const docs = useDocumentsStore.getState()
        await docs.open(docId)
        // Legacy-shape Tiptap JSON, which parseDocBody accepts directly.
        docs.saveBody({
          type: 'doc',
          content: paragraphs.map((text) => ({
            type: 'paragraph',
            content: text ? [{ type: 'text', text }] : []
          }))
        })
      },

      typeInto: async (setter, text, speedMs = 26) => {
        for (let i = 1; i <= text.length; i++) {
          if (cancelFlag.cancelled) return
          setter(text.slice(0, i))
          // Throttle the IPC write — flush on punctuation or every 8 chars so a
          // long paragraph doesn't fire hundreds of round-trips.
          if (i % 8 === 0 || /[.\n!?]/.test(text[i - 1] ?? '')) {
            await new Promise<void>((r) => setTimeout(r, speedMs * 2))
          } else {
            await new Promise<void>((r) => setTimeout(r, speedMs))
          }
        }
      },

      delay: (ms) => new Promise<void>((r) => setTimeout(r, ms))
    }

    for (let i = 0; i < scenario.steps.length; i++) {
      if (cancelFlag.cancelled) break

      const step = scenario.steps[i]
      set({
        currentStep: i,
        _caption: step.caption,
        _act: step.act ?? get()._act,
        _actor: step.actor ?? null
      })

      // Final step is the end card — run it and stop.
      if (i === scenario.steps.length - 1) {
        await step.action(ctx)
        if (!cancelFlag.cancelled) set({ demoComplete: true })
        break
      }

      await step.action(ctx)
      if (cancelFlag.cancelled) break

      await new Promise<void>((resolve) => {
        const advance = (): void => {
          clearStepTimer()
          _resolveStep = null
          resolve()
        }
        _stepTimer = setTimeout(advance, step.durationMs)

        const pausePoll = setInterval(() => {
          if (!get().paused) return
          clearStepTimer()
          clearInterval(pausePoll)
          const resumePoll = setInterval(() => {
            if (get().paused) return
            clearInterval(resumePoll)
            advance()
          }, 100)
        }, 50)

        _resolveStep = () => {
          clearInterval(pausePoll)
          advance()
        }
      })
    }

    if (!cancelFlag.cancelled) set({ demoComplete: true })
  },

  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),

  skip: () => {
    if (_resolveStep) {
      const r = _resolveStep
      _resolveStep = null
      clearStepTimer()
      r()
    }
  },

  exit: async (keepWorkspace = false) => {
    const { _cancelFlag, _createdNodeIds, _createdWidgetIds, _createdDocIds } = get()
    _cancelFlag.cancelled = true
    clearStepTimer()
    _resolveStep = null

    // Always leave Focus/split, even when keeping the workspace — otherwise the
    // demo ends with the user stuck inside a split view they didn't open.
    useFocusSplitStore.getState().reset()
    useWidgetStore.getState().setFocused(null)

    if (!keepWorkspace) {
      for (const id of _createdDocIds) {
        try {
          await useDocumentsStore.getState().remove(id)
        } catch {
          /* best-effort cleanup */
        }
      }
      // Widgets first, then nodes — deleting a desk cascades to its widgets, so
      // the reverse order would leave the widget deletes operating on dead rows.
      for (const id of [..._createdWidgetIds].reverse()) {
        try {
          await window.api.widgets.delete(id)
        } catch {
          /* best-effort cleanup */
        }
      }
      for (const id of [..._createdNodeIds].reverse()) {
        try {
          await window.api.nodes.delete(id)
        } catch {
          /* best-effort cleanup */
        }
      }
      await useNodeStore.getState().refresh()
      useWidgetStore.getState().clear()
      useWidgetStore.getState().setPan(0, 0)
      useWidgetStore.getState().setZoom(1)
      useViewStore.getState().goHome()
    }

    set({
      active: false,
      paused: false,
      currentStep: 0,
      totalSteps: 0,
      scenarioTitle: '',
      scenarioSubtitle: '',
      scenarioId: null,
      demoComplete: false,
      _caption: '',
      _act: '',
      _actor: null,
      _createdNodeIds: [],
      _createdWidgetIds: [],
      _createdDocIds: [],
      _cancelFlag: { cancelled: false }
    })
  }
}))
