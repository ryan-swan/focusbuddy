// Personal Custom-Block templates — saved layouts (fields without entered
// values) the user can reuse across folders / tasks / canvases. Stored in
// localStorage so they follow the user on this device (cross-device sync can
// come later alongside the rest of the prefs). Broadcast via a subscribe()
// pattern so any open palette/menu updates live.

export type BlockFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'email'
  | 'url'
  | 'select'
  | 'checkbox'
  | 'heading'
  | 'divider'

export interface BlockField {
  id: string
  type: BlockFieldType
  label: string
  x: number
  y: number
  w: number
  h: number
  options?: string[]
  required?: boolean
  value?: string | boolean
}

export interface BlockData {
  title: string
  fields: BlockField[]
}

export interface BlockTemplate {
  id: string
  name: string
  createdAt: number
  data: BlockData // values stripped on save
}

const KEY = 'fb.customBlock.templates'
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function listTemplates(): BlockTemplate[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as BlockTemplate[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persist(all: BlockTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage full / unavailable — non-fatal
  }
  emit()
}

/** Save a template from block data — strips entered values so the template is a
 *  clean blank form. Returns the saved template. */
export function saveTemplate(name: string, data: BlockData): BlockTemplate {
  const stripped: BlockData = {
    title: data.title,
    fields: data.fields.map((f) => {
      const { value, ...rest } = f
      void value
      return { ...rest }
    })
  }
  const tpl: BlockTemplate = {
    id: `tpl-${cryptoId()}`,
    name: name.trim() || 'Untitled template',
    createdAt: stampNow(),
    data: stripped
  }
  persist([tpl, ...listTemplates()])
  return tpl
}

export function deleteTemplate(id: string): void {
  persist(listTemplates().filter((t) => t.id !== id))
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// crypto.randomUUID is available in the renderer; fall back defensively.
function cryptoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2)
  }
}
function stampNow(): number {
  try {
    return Date.now()
  } catch {
    return 0
  }
}
