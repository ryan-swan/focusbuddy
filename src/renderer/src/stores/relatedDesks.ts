import { create } from 'zustand'

// Open/close state for the Related Desks manager. Any surface (the command
// palette, a desk action) opens it for a given desk; the modal mounted in App
// reads this store and renders itself.
interface RelatedDesksStore {
  open: boolean
  taskId: string | null
  show: (taskId: string) => void
  hide: () => void
}

export const useRelatedDesksStore = create<RelatedDesksStore>((set) => ({
  open: false,
  taskId: null,
  show: (taskId) => set({ open: true, taskId }),
  hide: () => set({ open: false, taskId: null })
}))
