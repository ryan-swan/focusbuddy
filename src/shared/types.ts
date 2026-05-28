export type AxisValue = 1 | 2 | 3 | 4 | 5
export type NodeKind = 'folder' | 'task'
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'parked'
export type SectionLayout = 'free' | 'grid' | 'stacks' | 'icons' | 'list'

// Pin-to-screen zones. Pinned widgets dock to one of four corners; multiple
// pins in the same zone stack horizontally without overlap. Legacy widgets
// pinned by pixel-position (pinnedScreenX/Y) still render via the old path
// when pinnedZone is null.
export type PinZone = 'tl' | 'tr' | 'bl' | 'br'

export type WidgetKind =
  | 'sticky'
  | 'note'
  | 'markdown'
  | 'webview'
  | 'pdf'
  | 'gdoc'
  | 'gsheet'
  | 'gslide'
  | 'email'
  | 'calculator'
  | 'color'
  | 'image'
  | 'video'
  | 'timer'
  | 'section'
  | 'task-link'
  | 'local-app-launcher'
  // New: rich data primitives
  | 'file' // unified file widget — type detected from MIME / extension
  | 'field' // single field (text, number, select, checkbox, etc.) on canvas
  | 'page' // Tiptap-based Notion-style document
  | 'table' // Notion/Airtable-style database with typed columns

export type ContextMenuAction =
  | 'createStickyFromSelection'
  | 'createNoteFromSelection'
  | 'openLinkInNewBrowser'
  | 'saveImageToCanvas'
  | 'saveVideoToCanvas'

export interface ContextMenuPayload {
  action: ContextMenuAction
  webContentsId: number
  x: number
  y: number
  selectionText?: string
  linkURL?: string
  srcURL?: string
}

export interface FbNode {
  id: string
  parentId: string | null
  kind: NodeKind
  title: string
  description: string
  status: TaskStatus
  priority: AxisValue
  interest: AxisValue
  importance: AxisValue
  sortOrder: number
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
  estimateMinutes: number | null
  extensionsMinutes: number
  resumeMarkdown: string | null
  resumeUpdatedAt: number | null
  dueDate: number | null
}

export interface NodeDraft {
  parentId: string | null
  kind: NodeKind
  title: string
  description?: string
  priority?: AxisValue
  interest?: AxisValue
  importance?: AxisValue
  estimateMinutes?: number | null
  dueDate?: number | null
}

export interface NodePatch {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: AxisValue
  interest?: AxisValue
  importance?: AxisValue
  parentId?: string | null
  sortOrder?: number
  estimateMinutes?: number | null
  extensionsMinutes?: number
  resumeMarkdown?: string | null
  resumeUpdatedAt?: number | null
  dueDate?: number | null
}

export interface Widget {
  id: string
  taskId: string
  kind: WidgetKind
  title: string
  content: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  color: string | null
  pinned: boolean
  pinnedScreenX: number | null
  pinnedScreenY: number | null
  // null = legacy free-position pin (uses pinnedScreenX/Y). Set to one of the
  // four zones for the new auto-stacking pin model.
  pinnedZone: PinZone | null
  parentSectionId: string | null
  layout: SectionLayout | null
  // When a Connected App was dragged onto the canvas, this links the widget to that
  // app so the webview reuses the app's session partition (cookies, auth state) and
  // can auto-fill from the bound vault entry.
  sourceAppId: string | null
  // Render mode for local-app-launcher widgets:
  //  - 'launcher' (default): click-to-launch tile with icon + running indicator
  //  - 'mirror': punch-through live view of the real native app window, positioned
  //    behind a transparent region of the canvas. Click-through goes to the real
  //    app, full interactivity.
  // Null for non-launcher widgets.
  mode: 'launcher' | 'mirror' | null
  // Living-page fields — only meaningful when kind === 'page'. When
  // livingQuery is non-null the page is "living": its `content` (Tiptap
  // JSON) is regenerated periodically from the task's other widgets via an
  // Anthropic call. The user types the query (e.g. "summary of every note
  // about pricing") and the system keeps the page in sync as the task
  // accumulates more material. Setting livingQuery back to null flips the
  // page to manual mode (the user can then edit content directly).
  livingQuery: string | null
  livingGeneratedAt: number | null
  // Paused = don't auto-regen on widget changes. The user can still
  // "regenerate now" manually. Useful when the user wants the current
  // snapshot to stick.
  livingPaused: boolean
  createdAt: number
  updatedAt: number
  archived: boolean
}

export interface WidgetDraft {
  taskId: string
  kind: WidgetKind
  title?: string
  content: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string | null
  sourceAppId?: string | null
  mode?: 'launcher' | 'mirror' | null
}

export interface WidgetPatch {
  title?: string
  content?: string
  x?: number
  y?: number
  width?: number
  height?: number
  zIndex?: number
  color?: string | null
  pinned?: boolean
  pinnedScreenX?: number | null
  pinnedScreenY?: number | null
  pinnedZone?: PinZone | null
  parentSectionId?: string | null
  layout?: SectionLayout | null
  sourceAppId?: string | null
  mode?: 'launcher' | 'mirror' | null
  livingQuery?: string | null
  livingGeneratedAt?: number | null
  livingPaused?: boolean
  archived?: boolean
}

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: ChatRole
  content: string
  ts: number
}

export interface ChatRequest {
  taskId: string | null
  messages: ChatMessage[]
}

export interface ChatResponse {
  ok: boolean
  message?: ChatMessage
  error?: string
  needsApiKey?: boolean
  // Action proposals returned alongside the text. The assistant declares what
  // it WOULD do; the renderer shows each as a confirmable card and only
  // executes those the user accepts. Empty/undefined for plain chat replies.
  proposals?: ActionProposal[]
}

// ── Action proposals (AI → workspace actions, gated by user confirmation) ───
// The assistant can propose to create widgets, spawn tasks, open URLs, start
// focus sessions, etc. Each proposal has a stable id (for selection state)
// and a typed payload. The renderer's actionExecutor.ts knows how to apply
// each kind.

export type ActionProposal =
  | {
      id: string
      kind: 'create-widget'
      widgetKind: WidgetKind
      title?: string
      content?: string
      reason?: string
    }
  | {
      id: string
      kind: 'create-task'
      title: string
      notes?: string
      parentId?: string | null
      reason?: string
    }
  | {
      id: string
      kind: 'open-url'
      url: string
      title?: string
      reason?: string
    }
  | {
      id: string
      kind: 'create-todo-list'
      title: string
      items: string[]
      reason?: string
    }
  | {
      id: string
      kind: 'create-page'
      title: string
      content: string // serialized Tiptap JSON
      reason?: string
    }
  | {
      id: string
      kind: 'start-focus-session'
      minutes: number
      reason?: string
    }
  | {
      id: string
      kind: 'delete-widget'
      widgetId: string
      label: string // user-facing description ("the empty sticky note")
      reason?: string
    }
  | {
      id: string
      kind: 'update-widget'
      widgetId: string
      label: string
      title?: string
      content?: string
      reason?: string
    }
  | {
      id: string
      kind: 'create-table'
      title: string
      columns: Array<{
        label: string
        type:
          | 'text-short'
          | 'text-long'
          | 'number'
          | 'checkbox'
          | 'single-select'
          | 'multi-select'
          | 'date'
          | 'attachment'
          | 'button'
        options?: string[] // for select types
      }>
      reason?: string
    }
  | {
      id: string
      kind: 'add-table-row'
      tableId: string
      cells: Record<string, string>
      reason?: string
    }
  | {
      id: string
      kind: 'create-field'
      label: string
      fieldType:
        | 'text-short'
        | 'text-long'
        | 'number'
        | 'checkbox'
        | 'single-select'
        | 'multi-select'
        | 'date'
      options?: string[]
      reason?: string
    }

// ── AI model routing ─────────────────────────────────────────────────────────
// The user picks a mode (Auto / Haiku / Sonnet / Opus). In Auto mode, each AI
// purpose has a sensible default. A manual override locks every call to that model.

export type ModelMode = 'auto' | 'haiku' | 'sonnet' | 'opus'

export type AIPurpose =
  | 'chat'
  | 'welcome'
  | 'setup'
  | 'resume'
  | 'trail_summary'
  | 'body_double'
  | 'smart_stack'
  | 'living_page'

// Inter-widget spatial link. Directed (source → target) — users can draw a
// reverse link as a separate row to express asymmetric relationships.
// Rendered as a line on the canvas between the two widget centres.
export interface WidgetLink {
  id: string
  sourceWidgetId: string
  targetWidgetId: string
  taskId: string
  createdAt: number
}

// Result of a living-page regeneration. ok=true → returns freshly-generated
// Tiptap JSON in `content`. The renderer applies it via the widget store so
// the local optimistic copy stays in sync. skip=true → no relevant material
// on the canvas yet; the renderer should keep the prior content and surface
// "no source material" in the UI rather than blanking the page.
export interface LivingPageRegenerateResponse {
  ok: boolean
  content?: string
  generatedAt?: number
  skip?: boolean
  reason?: string
  error?: string
  needsApiKey?: boolean
}

export interface BodyDoubleResponse {
  ok: boolean
  skip?: boolean // model decided no presence ping is warranted right now
  line?: string
  error?: string
  needsApiKey?: boolean
}

export interface SmartStackGroup {
  name: string
  widgetIds: string[]
  reason: string
}

export interface SmartStackResponse {
  ok: boolean
  groups?: SmartStackGroup[]
  error?: string
  needsApiKey?: boolean
}

// Trail event kinds — append new ones; never repurpose existing.
export type ActivityKind =
  | 'task_switched'
  | 'widget_added'
  | 'widget_focused'
  | 'widget_removed'
  | 'browser_nav'
  | 'note_edit'
  | 'chat_sent'
  | 'session_started'
  | 'session_ended'
  | 'ai_setup_run'
  | 'resume_generated'

export interface ActivityEvent {
  id: string
  taskId: string | null
  ts: number
  kind: ActivityKind
  payload: Record<string, unknown>
}

export interface ActivityRecordDraft {
  taskId: string | null
  kind: ActivityKind
  payload?: Record<string, unknown>
}

export interface TrailSummaryResponse {
  ok: boolean
  summary?: string
  eventCount?: number
  error?: string
  needsApiKey?: boolean
}

export type FocusSessionOutcome = 'done' | 'continued' | 'abandoned'

export interface FocusSession {
  id: string
  taskId: string | null
  kind: string // '5min' | 'custom' (string for forward-compat)
  plannedSeconds: number
  startedAt: number
  completedAt: number | null
  actualSeconds: number | null
  outcome: FocusSessionOutcome | null
}

export interface FocusSessionStartDraft {
  taskId: string | null
  kind?: string
  plannedSeconds: number
}

export interface FocusSessionCompletePatch {
  actualSeconds: number
  outcome: FocusSessionOutcome
}

// ── Haptics ──────────────────────────────────────────────────────────────────

export type HapticFeel = 'light' | 'medium' | 'success' | 'warning' | 'rigid'

// ── Energy log ───────────────────────────────────────────────────────────────

export type EnergyLevel = 'low' | 'medium' | 'high'

export interface EnergyLogEntry {
  id: string
  ts: number
  level: EnergyLevel
}

// ── Dashboard layouts (Phase 6) ──────────────────────────────────────────────

export type DashboardCardKind =
  | 'quick-start'
  | 'stats'
  | 'garden'
  | 'today-tasks'
  | 'recent-activity'
  | 'energy'

export interface DashboardLayout {
  dashboardKey: string // 'home' for the master dashboard, or a project node id
  cardIds: DashboardCardKind[]
  updatedAt: number
}

// ── Vault (Phase 7) ──────────────────────────────────────────────────────────
// Master-password-encrypted credential storage. All ciphertext is base64. The vault
// has TWO states from the user's perspective: locked (master password needed) and
// unlocked (master key kept in renderer memory until lock).

export interface VaultMeta {
  exists: boolean
  iterations: number
  salt: string // base64
  verifierIv: string // base64
  verifierCiphertext: string // base64 — encrypts a known plaintext to verify the master password
  createdAt?: number
  updatedAt?: number
}

export interface VaultEntryStored {
  id: string
  title: string
  url: string | null
  username: string | null
  iv: string // base64
  ciphertext: string // base64 — encrypts a JSON blob: { password, totp, notes }
  sortOrder: number
  createdAt: number
  updatedAt: number
}

// Decrypted in renderer only — never crosses IPC after unlock
export interface VaultSecret {
  password?: string
  totp?: string // base32 secret for RFC 6238 TOTP
  notes?: string
}

export interface VaultEntryDraft {
  title: string
  url?: string | null
  username?: string | null
  iv: string
  ciphertext: string
}

export interface VaultEntryPatch {
  title?: string
  url?: string | null
  username?: string | null
  iv?: string
  ciphertext?: string
}

// 'web' apps render inside an Electron <webview> (existing behaviour). 'local'
// apps are native macOS apps launched via `open -a` — they can't render inside
// the canvas (only HTML can), so they spawn launcher tiles instead.
export type ConnectedAppKind = 'web' | 'local'

export interface ConnectedApp {
  id: string
  title: string
  // For 'web' apps this is the homepage URL. For 'local' apps it's the file://
  // path or just left as the appPath for back-compat (the source of truth for
  // local apps is `appPath`).
  url: string
  icon: string // Material Symbols name (fallback when no real icon is cached)
  color: string | null
  sortOrder: number
  kind: ConnectedAppKind
  // Local-app fields. For web apps both are null. `appPath` is the .app bundle
  // path on disk (e.g. /Applications/Spotify.app); `bundleId` is the macOS
  // bundle identifier (e.g. com.spotify.client) when available.
  appPath: string | null
  bundleId: string | null
  // Base64-encoded PNG of the app's real icon, captured at create-time via
  // Electron's app.getFileIcon. Cached so we don't hit disk on every render.
  iconPngBase64: string | null
  // Pinned to the always-visible Favourites strip in the sidebar.
  pinned: boolean
  // Auto-promoted into Favourites by usage if pinned=false; sorted by recency × count.
  useCount: number
  lastUsedAt: number | null
  // Vault binding for auto-fill. null when the user hasn't linked credentials.
  // Only meaningful for kind='web' — local apps don't have web forms to fill.
  vaultEntryId: string | null
  autofillEnabled: boolean
  createdAt: number
  updatedAt: number
}

export interface ConnectedAppDraft {
  title: string
  url: string
  icon?: string
  color?: string | null
  pinned?: boolean
  vaultEntryId?: string | null
  kind?: ConnectedAppKind
  appPath?: string | null
  bundleId?: string | null
  iconPngBase64?: string | null
}

export interface ConnectedAppPatch {
  title?: string
  url?: string
  icon?: string
  color?: string | null
  pinned?: boolean
  vaultEntryId?: string | null
  autofillEnabled?: boolean
  appPath?: string | null
  bundleId?: string | null
  iconPngBase64?: string | null
}

export interface BrowsingHistoryEntry {
  url: string
  title: string
  host: string
  taskId: string | null
  firstVisitedAt: number
  lastVisitedAt: number
  visitCount: number
}

// ── AI Builder ──────────────────────────────────────────────────────────────
// Richer than WidgetSuggestion: each AI Builder suggestion can carry a full
// table schema (for table widgets), a Tiptap doc (for page widgets), or a
// field definition (for field widgets). The shapes are deliberately optional
// per-kind so the AI can omit irrelevant payloads.

export interface AiBuildSuggestion {
  id: string // unique within the response, used for selection bookkeeping
  kind: WidgetKind
  title: string
  reason: string // one-sentence "why this helps"
  // Common content (used by sticky, note, markdown, webview/pdf/gdoc URLs,
  // color, calculator, timer JSON, etc.)
  content?: string
  // For kind='page': Tiptap document JSON. We pass through as an opaque
  // object — the renderer serializes it before saving into widget.content.
  pageContent?: object
  // For kind='table': schema with columns. The renderer creates the backing
  // fb_tables row before spawning the widget.
  tableSchema?: {
    columns: Array<{
      id: string
      type: string
      label: string
      config: unknown
    }>
  }
  // For kind='field': initial field definition. Same shape as FieldDefinition
  // but kept untyped here so the shared module doesn't import @shared/fields
  // (which would create a circular reference for some toolchains).
  fieldDef?: {
    id: string
    type: string
    label: string
    config: unknown
  }
}

export interface AiBuildResponse {
  ok: boolean
  // One-sentence interpretation of what the user wants. Shown above the
  // suggestion list so the user can verify the AI understood them.
  intent?: string
  suggestions?: AiBuildSuggestion[]
  error?: string
  needsApiKey?: boolean
}

export interface WidgetSuggestion {
  kind: WidgetKind
  title: string
  content: string
  reason: string
}

export interface SetupSuggestResponse {
  ok: boolean
  suggestions?: WidgetSuggestion[]
  error?: string
  needsApiKey?: boolean
}

export interface TemplateWidget {
  kind: WidgetKind
  title: string
  content: string
  x: number
  y: number
  width: number
  height: number
  color: string | null
}

export interface Template {
  id: string
  name: string
  description: string
  sourceTaskId: string | null
  widgets: TemplateWidget[]
  createdAt: number
}

export interface TemplateDraft {
  name: string
  description?: string
  sourceTaskId: string | null
  widgets: TemplateWidget[]
}
