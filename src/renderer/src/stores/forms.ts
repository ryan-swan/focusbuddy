import { create } from 'zustand'
import type { PlexiForm, PlexiFormPatch } from '@shared/forms'
import type { TableSchema } from '@shared/fields'

// PlexiForms store. A form is a thin record over a backing table: creating a form
// creates the table that holds its fields (columns) and responses (rows). Reads
// only real forms; an empty workspace has none.

interface FormsStore {
  forms: PlexiForm[]
  loaded: boolean
  load: () => Promise<void>
  create: (title?: string) => Promise<PlexiForm | null>
  update: (id: string, patch: PlexiFormPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

const STARTER_SCHEMA: TableSchema = {
  columns: [{ id: 'c-name', type: 'text-short', label: 'Name', config: {} } as never]
}

export const useFormsStore = create<FormsStore>((set, get) => ({
  forms: [],
  loaded: false,
  load: async () => {
    const forms = await window.api.forms.list().catch(() => [] as PlexiForm[])
    set({ forms, loaded: true })
  },
  create: async (title) => {
    // The backing table holds the fields and the responses.
    const table = await window.api.tables
      .create({ taskId: null, title: `${title ?? 'Form'} responses`, schema: STARTER_SCHEMA })
      .catch(() => null)
    if (!table) return null
    const form = await window.api.forms.create({ title: title ?? 'Untitled form', tableId: table.id }).catch(() => null)
    if (form) await get().load()
    return form
  },
  update: async (id, patch) => {
    await window.api.forms.update(id, patch).catch(() => null)
    await get().load()
  },
  remove: async (id) => {
    await window.api.forms.delete(id).catch(() => false)
    await get().load()
  }
}))
