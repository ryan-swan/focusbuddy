import { create } from 'zustand'

// Per-desk view mode. A desk can be shown as the infinite spatial Canvas (the
// default) or as Columns (stacked scrollable walls). The choice is remembered
// per desk so switching desks restores how each one was last viewed. Stored in
// localStorage rather than the synced DB because it is a local viewing
// preference, not shared content.

export type DeskViewMode = 'canvas' | 'columns'

const KEY = 'fb.deskView.v1'

function load(): Record<string, DeskViewMode> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, DeskViewMode>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface DeskViewStore {
  modes: Record<string, DeskViewMode>
  get: (taskId: string | null) => DeskViewMode
  set: (taskId: string, mode: DeskViewMode) => void
  toggle: (taskId: string) => void
}

export const useDeskViewStore = create<DeskViewStore>((setState, getState) => ({
  modes: load(),
  get: (taskId) => (taskId ? getState().modes[taskId] ?? 'canvas' : 'canvas'),
  set: (taskId, mode) => {
    const modes = { ...getState().modes, [taskId]: mode }
    setState({ modes })
    try {
      localStorage.setItem(KEY, JSON.stringify(modes))
    } catch {
      /* ignore quota / private mode */
    }
  },
  toggle: (taskId) => {
    const cur = getState().modes[taskId] ?? 'canvas'
    getState().set(taskId, cur === 'canvas' ? 'columns' : 'canvas')
  }
}))
