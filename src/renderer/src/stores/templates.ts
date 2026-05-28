import { create } from 'zustand'
import type { Template } from '@shared/types'

interface TemplateStore {
  templates: Template[]
  loading: boolean
  refresh: () => Promise<void>
  saveFromTask: (taskId: string, name: string, description?: string) => Promise<Template>
  remove: (id: string) => Promise<void>
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: [],
  loading: false,
  refresh: async () => {
    set({ loading: true })
    const templates = await window.api.templates.list()
    set({ templates, loading: false })
  },
  saveFromTask: async (taskId, name, description) => {
    const t = await window.api.templates.createFromTask(taskId, name, description)
    set({ templates: [t, ...get().templates] })
    return t
  },
  remove: async (id) => {
    await window.api.templates.delete(id)
    set({ templates: get().templates.filter((t) => t.id !== id) })
  }
}))
