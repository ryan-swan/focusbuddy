import { create } from 'zustand'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import type { DemoContext, DemoScenario } from './demoEngine'
import { scenario1 } from './scenario1'
import { scenario2 } from './scenario2'

interface DemoStore {
  active: boolean
  paused: boolean
  currentStep: number
  totalSteps: number
  scenarioTitle: string
  scenarioId: 1 | 2 | null
  demoComplete: boolean
  _caption: string
  // Ids of everything created during demo so we can clean up
  _createdNodeIds: string[]
  _createdWidgetIds: string[]
  _cancelFlag: { cancelled: boolean }

  startScenario: (n: 1 | 2) => Promise<void>
  pause: () => void
  resume: () => void
  skip: () => void
  exit: (keepWorkspace?: boolean) => Promise<void>
  _advance: () => void
}

// Resolvers for external step-advance signals (pause/skip). These live outside
// Zustand so they don't get serialised or trigger re-renders.
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
  scenarioId: null,
  demoComplete: false,
  _caption: '',
  _createdNodeIds: [],
  _createdWidgetIds: [],
  _cancelFlag: { cancelled: false },

  startScenario: async (n) => {
    // If already running, exit cleanly first
    const existing = get()
    if (existing.active) {
      await existing.exit(true)
    }

    const scenario: DemoScenario = n === 1 ? scenario1 : scenario2

    const cancelFlag = { cancelled: false }
    const createdNodeIds: string[] = []
    const createdWidgetIds: string[] = []
    let deskId: string | null = null

    set({
      active: true,
      paused: false,
      currentStep: 0,
      totalSteps: scenario.steps.length,
      scenarioTitle: scenario.title,
      scenarioId: n,
      demoComplete: false,
      _caption: '',
      _createdNodeIds: createdNodeIds,
      _createdWidgetIds: createdWidgetIds,
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
        // Give canvas a moment to mount
      },

      typeInto: async (setter, text, speedMs = 28) => {
        for (let i = 1; i <= text.length; i++) {
          if (cancelFlag.cancelled) return
          setter(text.slice(0, i))
          // Throttle IPC calls — only flush on punctuation or every 8 chars
          if (i % 8 === 0 || /[.\n!?]/.test(text[i - 1] ?? '')) {
            await new Promise<void>((r) => setTimeout(r, speedMs * 2))
          } else {
            await new Promise<void>((r) => setTimeout(r, speedMs))
          }
        }
      },

      delay: (ms) => new Promise<void>((r) => setTimeout(r, ms))
    }

    // Run steps sequentially
    for (let i = 0; i < scenario.steps.length; i++) {
      if (cancelFlag.cancelled) break

      const step = scenario.steps[i]
      set({ currentStep: i, _caption: step.caption })

      // Last step (empty caption) = end card, break immediately
      if (i === scenario.steps.length - 1) {
        await step.action(ctx)
        set({ demoComplete: true })
        break
      }

      // Execute the step's action
      await step.action(ctx)
      if (cancelFlag.cancelled) break

      // Wait for durationMs — but allow skip/pause to interrupt via promise race
      await new Promise<void>((resolve) => {
        _resolveStep = resolve

        const advance = (): void => {
          clearStepTimer()
          _resolveStep = null
          resolve()
        }

        // Auto-advance after durationMs
        _stepTimer = setTimeout(advance, step.durationMs)

        // Poll for pause — when paused we hold the advance promise open until resumed
        const pausePoll = setInterval(() => {
          if (!get().paused) return
          // paused — clear the timer, hold the promise
          clearStepTimer()
          clearInterval(pausePoll)
          // Watch for resume
          const resumePoll = setInterval(() => {
            if (get().paused) return
            clearInterval(resumePoll)
            // Restart the remaining wait time (simplified: just advance immediately)
            advance()
          }, 100)
        }, 50)

        // Wrap resolve to also clear the pause poll
        _resolveStep = () => {
          clearInterval(pausePoll)
          advance()
        }
      })
    }

    // If not cancelled, leave the demo overlay showing the end card
    if (!cancelFlag.cancelled) {
      set({ demoComplete: true })
    }
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

  _advance: () => {
    if (_resolveStep) {
      const r = _resolveStep
      _resolveStep = null
      clearStepTimer()
      r()
    }
  },

  exit: async (keepWorkspace = false) => {
    const { _cancelFlag, _createdNodeIds, _createdWidgetIds } = get()
    _cancelFlag.cancelled = true
    clearStepTimer()
    _resolveStep = null

    if (!keepWorkspace) {
      // Delete all created nodes and widgets (reverse order so children go first)
      for (const id of [..._createdNodeIds].reverse()) {
        try {
          await window.api.nodes.delete(id)
        } catch {
          // best-effort
        }
      }
      for (const id of [..._createdWidgetIds].reverse()) {
        try {
          await window.api.widgets.delete(id)
        } catch {
          // best-effort
        }
      }
      // Refresh the node store
      await useNodeStore.getState().refresh()
      useWidgetStore.getState().clear()
      // Navigate home
      useViewStore.getState().goHome()
    }

    set({
      active: false,
      paused: false,
      currentStep: 0,
      totalSteps: 0,
      scenarioTitle: '',
      scenarioId: null,
      demoComplete: false,
      _caption: '',
      _createdNodeIds: [],
      _createdWidgetIds: [],
      _cancelFlag: { cancelled: false }
    })
  }
}))
