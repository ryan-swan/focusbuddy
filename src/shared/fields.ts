// ── Field type system ────────────────────────────────────────────────────────
//
// One typed value model used in three places:
//   1. Columns inside a Table widget (Airtable/Notion-style database)
//   2. Standalone Field widgets on the canvas (user's "free fields" idea)
//   3. Blocks inside a Page widget (future)
//
// The single registry means a "single-select with these options" looks and
// behaves identically whether it's a column in a table or a free widget on
// the desk. Adding a new type adds it everywhere at once.

export type FieldType =
  | 'text-short'
  | 'text-long'
  | 'text-rich' // formatted text (Tiptap)
  | 'number'
  | 'checkbox'
  | 'single-select'
  | 'multi-select'
  | 'date'
  | 'attachment' // references one or more fb_files entries
  | 'button' // programmable: runs a shell command or AI prompt
  | 'relation' // links to rows of another fb_tables table

// Per-type config. Discriminated by `type` at runtime via a parent
// FieldDefinition so we never need to inspect this in isolation.
export interface SelectOption {
  id: string
  label: string
  // Tailwind-compatible accent for chip background. Optional — defaults pick from a palette.
  color?: string
}

export interface FieldConfigByType {
  'text-short': { placeholder?: string }
  'text-long': { placeholder?: string }
  'text-rich': { placeholder?: string }
  number: { precision?: number; prefix?: string; suffix?: string }
  checkbox: { label?: string }
  'single-select': { options: SelectOption[] }
  'multi-select': { options: SelectOption[] }
  date: { withTime?: boolean }
  attachment: { maxBytes?: number; acceptMime?: string[] }
  button: {
    action: 'shell' | 'ai-prompt'
    // For 'shell': a command line. For 'ai-prompt': the prompt template.
    payload: string
    // Display label on the button itself.
    label?: string
  }
  relation: {
    // The fb_tables.id this column links to. null = unbound (picker shows a
    // table-chooser instead of a row-chooser).
    tableId: string | null
    // Optional: which column of the linked table is the "primary" display
    // field (e.g. the row title). If null, the relation chip just shows the
    // row's short id.
    displayColumnId?: string | null
    // false = single-row, true = multi-row. We use a single value-shape
    // (string[]) for both so the storage layer stays uniform; UI enforces
    // the cardinality.
    multi?: boolean
  }
}

// Type-safe field definition: the runtime value of `type` selects which
// shape of `config` we expect. TS narrows accordingly when you switch on
// `def.type`.
export type FieldDefinition = {
  [K in FieldType]: {
    id: string
    type: K
    label: string
    config: FieldConfigByType[K]
    // Display width hint for table columns. Ignored for standalone field
    // widgets, which size to their canvas dimensions.
    widthHint?: number
  }
}[FieldType]

// Value shapes — what gets stored as cells_json[colId] for each type.
export type FieldValueByType = {
  'text-short': string
  'text-long': string
  'text-rich': string // serialized Tiptap JSON
  number: number | null
  checkbox: boolean
  'single-select': string | null // SelectOption.id
  'multi-select': string[] // SelectOption.ids
  date: number | null // unix ms; if withTime=false, normalised to UTC midnight
  attachment: string[] // fb_files.id[]
  button: never // buttons don't store values; they have execution history elsewhere
  relation: string[] // fb_rows.id[] in the target table
}

export type FieldValue = FieldValueByType[FieldType]

// Sensible defaults so adding a new column / field doesn't require the user
// to configure everything before they can save.
export function defaultConfig<T extends FieldType>(type: T): FieldConfigByType[T] {
  switch (type) {
    case 'text-short':
    case 'text-long':
    case 'text-rich':
      return {} as FieldConfigByType[T]
    case 'number':
      return {} as FieldConfigByType[T]
    case 'checkbox':
      return {} as FieldConfigByType[T]
    case 'single-select':
    case 'multi-select':
      return { options: [] } as unknown as FieldConfigByType[T]
    case 'date':
      return { withTime: false } as unknown as FieldConfigByType[T]
    case 'attachment':
      return {} as FieldConfigByType[T]
    case 'button':
      return {
        action: 'shell',
        payload: '',
        label: 'Run'
      } as unknown as FieldConfigByType[T]
    case 'relation':
      return {
        tableId: null,
        displayColumnId: null,
        multi: true
      } as unknown as FieldConfigByType[T]
    default:
      return {} as FieldConfigByType[T]
  }
}

export function defaultValue<T extends FieldType>(type: T): FieldValueByType[T] {
  switch (type) {
    case 'text-short':
    case 'text-long':
    case 'text-rich':
      return '' as unknown as FieldValueByType[T]
    case 'number':
      return null as unknown as FieldValueByType[T]
    case 'checkbox':
      return false as unknown as FieldValueByType[T]
    case 'single-select':
      return null as unknown as FieldValueByType[T]
    case 'multi-select':
      return [] as unknown as FieldValueByType[T]
    case 'date':
      return null as unknown as FieldValueByType[T]
    case 'attachment':
      return [] as unknown as FieldValueByType[T]
    case 'button':
      return null as unknown as FieldValueByType[T]
    case 'relation':
      return [] as unknown as FieldValueByType[T]
    default:
      return null as unknown as FieldValueByType[T]
  }
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  'text-short': 'Short text',
  'text-long': 'Long text',
  'text-rich': 'Rich text',
  number: 'Number',
  checkbox: 'Checkbox',
  'single-select': 'Single select',
  'multi-select': 'Multi-select',
  date: 'Date',
  attachment: 'Attachment',
  button: 'Button',
  relation: 'Related records'
}

export const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  'text-short': 'short_text',
  'text-long': 'subject',
  'text-rich': 'format_paragraph',
  number: 'numbers',
  checkbox: 'check_box',
  'single-select': 'radio_button_checked',
  'multi-select': 'checklist',
  date: 'calendar_today',
  attachment: 'attach_file',
  button: 'smart_button',
  relation: 'link'
}

// ── Tables ──────────────────────────────────────────────────────────────────

export interface TableSchema {
  // Ordered list of column definitions. Order in this array == display order.
  columns: FieldDefinition[]
}

export interface FbTable {
  id: string
  taskId: string | null
  title: string
  schema: TableSchema
  createdAt: number
  updatedAt: number
}

export interface FbTableDraft {
  taskId: string | null
  title?: string
  schema?: TableSchema
}

export interface FbTablePatch {
  title?: string
  schema?: TableSchema
}

export interface FbRow {
  id: string
  tableId: string
  // cells maps a column id to its current value. Untouched columns are
  // missing keys, NOT null entries — that way we can add a new column without
  // having to backfill every existing row.
  cells: Record<string, unknown>
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface FbRowDraft {
  tableId: string
  cells?: Record<string, unknown>
}

export interface FbRowPatch {
  cells?: Record<string, unknown>
  sortOrder?: number
}

// ── Files ───────────────────────────────────────────────────────────────────

export interface FbFile {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  ext: string
  // Absolute path on disk (read-only — main process owns the storage layout
  // under userData and is responsible for any future migrations).
  storedPath: string
  createdAt: number
}

export interface FbFileMetaOnly {
  // Same as FbFile but without the resolved storedPath. Used by ingest where
  // the renderer only needs to know "where is it filed" via id + ext.
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  ext: string
  createdAt: number
}

// Broad classification used by the file widget to pick a renderer. We keep
// this in shared/ so renderer + main agree on the same buckets.
export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'generic'

export function fileKindFromMime(mime: string, ext: string): FileKind {
  const e = ext.replace(/^\./, '').toLowerCase()
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) {
    return 'image'
  }
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf'
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(e)) return 'video'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(e)) return 'audio'
  return 'generic'
}
