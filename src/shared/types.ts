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
  // Office documents on the canvas — a doc / spreadsheet / slide deck backed by
  // the fb_documents store (widget.content holds the document id), embedding the
  // full editor so the same file can live on a canvas and in the Documents view.
  | 'doc'
  | 'sheet'
  | 'slides'
  // PlexiMaps — a node/edge diagram & workflow map document, embeddable on the
  // canvas like the other office docs (backed by an fb_documents row of type 'map').
  | 'map'
  // Stream Deck — Elgato-style 10×3 button grid with folder navigation,
  // macros, app launching, media keys, and volume control. Configuration
  // (buttons, folders, action payloads) lives in widget.content as JSON.
  | 'streamdeck'
  // Canvas minimap — bottom-right overview rectangle with widget silhouettes
  // and a draggable viewport rect. Auto-created on every new task pinned to
  // BR, but it's a regular widget the user can resize, unpin, drag to the
  // canvas, delete, or re-add via the widget picker like anything else.
  | 'minimap'
  // Voice / video recorder — captures audio (and later webcam video) via
  // MediaRecorder, persists the blob through the files store, and runs
  // it through Whisper (OpenAI) for transcription, then Anthropic for
  // optional cleanup or summary. The widget owns the Record/Stop UI and
  // the post-record three-way mode picker (Full / Cleaned / Summary). A
  // separate post-processing modal surfaces extracted ActionProposals
  // (new tasks, new widgets, etc.) for one-click apply.
  | 'voice-recorder'
  // AI mind mapper — root-of-thought node tree. Each node has a label
  // and an optional kind classifier (idea / task / question / tool /
  // agent). Clicking a node fires Claude with the full root-path
  // context and generates 3-5 child branches. A side panel shows
  // suggested Agent OS agents that could execute on the node's topic,
  // sourced from .claude/agents/*.md and ranked by Claude.
  //
  // PHASE_2: embedded mini-widgets per node (tables, fields, searches)
  // PHASE_2: agent-creation wizard for "no matching agent" flow
  // PHASE_3: autonomous agent execution on the canvas via a runtime
  //   that watches state changes + proposes actions with kill switches
  | 'mindmap'
  // Diagram — a React Flow node/edge canvas for structured diagrams: flowcharts,
  // entity hierarchies, server/software design, mind-map-style trees, and basic
  // Venn (overlapping translucent circle nodes). Nodes can be boxes, circles,
  // text, or an uploaded image/icon; edges are connectors. The whole graph
  // (nodes + edges + viewport) is serialised to widget.content as JSON.
  | 'diagram'
  // Scratchpad — a freeform sketch surface (pressure-sensitive ink via
  // perfect-freehand) for quick drawings, annotations, and visual thinking.
  // Strokes + background are serialised to widget.content as JSON.
  | 'scratchpad'
  // Shape — a vector shape (rect/ellipse/diamond/triangle/hexagon/star/line/
  // arrow) with fill, stroke and an optional centred label. Stretches to fill
  // the widget. Config serialised to widget.content as JSON.
  | 'shape'
  // Card — a titled callout card: accent bar + bold title + multi-line body.
  | 'card'
  // Custom block — a WYSIWYG form/record designer: freely-placed typed fields
  // the user lays out themselves; doubles as a data-entry form. Layout + values
  // serialised to widget.content as JSON; can be saved as a reusable template.
  | 'custom-block'
  // Desk agent — a standing AI agent placed on the canvas. Its "senses" are the
  // live wires drawn INTO it (each wired-in widget's content is an input); it
  // holds a standing instruction and a trigger (manual / interval / on a wired
  // input changing), runs with a visible kill switch, and keeps a run log in its
  // own body. Config + history serialised to widget.content as JSON.
  | 'agent'
  // Portal — a live window into ANOTHER task's desk. Shows a shrunk,
  // content-aware miniature of the target desk, refreshed periodically; click to
  // dive in. The target task id is serialised to widget.content as JSON.
  | 'portal'
  // Living doc — a read-only document that writes itself. The user gives it a
  // brief (stored in livingQuery), and the AI keeps it as a running summary of
  // the OTHER widgets on the same desk, regenerated on demand and auto-refreshed
  // when source widgets change (see livingPageScheduler). content is serialized
  // Tiptap JSON, system-owned (never hand-edited). Reuses the living* fields.
  | 'living-doc'

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
  // Soft-delete / "put away" flag for folders and tasks. Archived nodes
  // are hidden from the main sidebar tree by default but remain
  // recoverable via the dashboard's archived view. Task `status` is
  // about the work itself (open / in_progress / done / parked); archived
  // is about whether the node should be visible in day-to-day surfaces.
  archived: boolean
  // Handle of the person who shared this node with you, set when the node
  // was reconstructed from an accepted share. Null for your own nodes. The
  // sidebar uses it to show a "Shared by <handle>" badge + avatar.
  sharedFromHandle: string | null
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
  // Set when reconstructing a node from an accepted share — stamps the
  // sharer's handle so the UI can badge it.
  sharedFromHandle?: string | null
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
  archived?: boolean
}

// ── Time blocks (calendar time-blocking) ────────────────────────────────────
// A booked stretch of time on the calendar, optionally tied to a task. This is
// how the calendar goes from "tasks shown on their due day" to "I've booked
// 2-3pm to focus on this", and a block can launch a focus session for its task.
export type TimeBlockStatus = 'planned' | 'done'

export interface TimeBlock {
  id: string
  taskId: string | null // null = a generic focus/time block with no task
  title: string
  startMs: number // absolute start time
  durationMin: number
  status: TimeBlockStatus
  createdAt: number
  updatedAt: number
}

export interface TimeBlockDraft {
  taskId?: string | null
  title?: string
  startMs: number
  durationMin: number
}

export interface TimeBlockPatch {
  taskId?: string | null
  title?: string
  startMs?: number
  durationMin?: number
  status?: TimeBlockStatus
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
  // When set, this widget is a LINKED duplicate: all widgets sharing the same
  // syncGroupId mirror their content + title + colour to each other (across
  // tasks). Position / size / which task each copy lives in stay independent.
  // null = standalone (not linked).
  syncGroupId: string | null
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
  // Pin a widget to a screen zone at creation time. Used by the minimap
  // auto-create flow (and any future "always-on" widget that should
  // dock to a corner from the moment it spawns). Defaults are unpinned
  // free-positioned via x/y.
  pinned?: boolean
  pinnedZone?: PinZone | null
  // Link this new widget into a sync group (used by Duplicate so the copy stays
  // in sync with its source).
  syncGroupId?: string | null
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
  // Set to a group id to LINK this widget into a sync group, or null to UNLINK.
  syncGroupId?: string | null
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
      // Position / size mutations — all optional. Any field omitted is left
      // unchanged. Voice commands like "move this to the top right" or "make
      // it bigger" land here.
      x?: number
      y?: number
      width?: number
      height?: number
      // For content updates: replace (default) wipes the existing body,
      // append/prepend tack the new text onto either end with a leading
      // space/newline. Lets voice commands like "add 'call dentist' to my
      // todo list" append without obliterating the existing items.
      operation?: 'replace' | 'append' | 'prepend'
      reason?: string
    }
  | {
      id: string
      kind: 'link-widgets'
      // Source / target are widget ids. The voice interpreter resolves
      // user-friendly references ("the budget table") into ids before
      // returning this proposal — Apply just calls widgetLinks.create.
      sourceWidgetId: string
      targetWidgetId: string
      sourceLabel: string
      targetLabel: string
      reason?: string
    }
  | {
      id: string
      kind: 'focus-widget'
      widgetId: string
      label: string
      reason?: string
    }
  | {
      id: string
      kind: 'toggle-todo-item'
      // Mark an item in a Markdown / Page widget's task list as done/undone.
      // The renderer finds the line containing `itemMatch` (substring,
      // case-insensitive) and flips its `- [ ]` ↔ `- [x]` marker.
      widgetId: string
      widgetLabel: string
      itemMatch: string
      checked: boolean
      reason?: string
    }
  | {
      id: string
      kind: 'drill-in-widget'
      // Opens the widget in FocusMode (single-widget zoomed modal).
      widgetId: string
      label: string
      reason?: string
    }
  | {
      id: string
      kind: 'arrange-widgets'
      // Auto-layouts widgets into a tidy grid. When widgetIds is
      // omitted, applies to every non-pinned widget on the active task.
      widgetIds?: string[] | null
      label: string
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
  | 'wire_transform'
  | 'desk_agent'
  | 'command_route'
  | 'document'
  | 'doc_rewrite'
  | 'tone_profile'
  | 'email_reply_draft'

// Result of asking AI to draft a reply to an open email in the user's voice.
// `skip` is the expected, non-error outcome for newsletters / no-reply senders /
// nothing-to-reply-to. `needsApiKey` distinguishes a missing key from a real
// failure so the UI can point at Settings instead of showing a scary error.
export interface EmailReplyDraftResult {
  ok: boolean
  reply?: string
  confidence?: number
  note?: string
  skip?: boolean
  skipReason?: string
  needsApiKey?: boolean
  error?: string
}

// Desk time-travel: metadata for one canvas snapshot (the full widget payload
// lives in the DB and is fetched on demand).
export interface SnapshotMeta {
  id: string
  taskId: string
  at: number
  label: string
  widgetCount: number
}

// "Live wire" semantics for an inter-widget link. A dead line becomes a pipe:
//   context   — passive. The target's AI is told this source is a related
//               family member (the default; never acts on its own).
//   transform — reactive. When the SOURCE content changes, an AI call runs the
//               wire's `verb` over the source and writes the result into the
//               TARGET.
//   mirror    — reactive. The SOURCE's content is copied into the TARGET on
//               change (sync expressed as a connection, no AI).
export type WireType = 'context' | 'transform' | 'mirror'

// Inter-widget spatial link, now a typed "live wire". Directed (source →
// target) — users can draw a reverse link as a separate row to express
// asymmetric relationships. Rendered as a line on the canvas between the two
// widget centres, with a small badge showing its wire type.
export interface WidgetLink {
  id: string
  sourceWidgetId: string
  targetWidgetId: string
  taskId: string
  createdAt: number
  // Live-wire fields. Existing rows default to a passive 'context' wire.
  type: WireType
  // Free-text instruction for a 'transform' wire, e.g. "extract action items".
  verb: string
  // Kill switch — a disabled reactive wire stays drawn but never fires.
  enabled: boolean
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

// AI-generated presence narration (the existing "you're not alone, your
// pair-worker is still here" nudges). NOT the user-to-user body double
// feature — that's the BodyDouble* types below. Kept separate so the AI
// helper and the peer matching feature can evolve independently.
export interface BodyDoubleResponse {
  ok: boolean
  skip?: boolean // model decided no presence ping is warranted right now
  line?: string
  error?: string
  needsApiKey?: boolean
}

// ── Peer-to-peer body double feature ────────────────────────────────────────
//
// User-to-user body doubling — Omegle-style random matching for ADHD-style
// "I need someone working alongside me" sessions. Two strangers express an
// interaction preference; a matching service pairs them when their
// preferences are compatible; the session runs with whatever channels the
// shared preference allows.

// How much interaction the user wants during the session. Both partners
// must agree on a mode (compatible matching only — see matcher logic).
export type BodyDoubleMode =
  | 'silent' // names + presence dot only; no chat, no audio
  | 'greetings' // exchange one hello + "what are you working on", then quiet
  | 'light' // text chat available, occasional progress pings welcome
  | 'open' // full conversation; text + audio (when audio ships)

// The handle shown to a partner — pseudonymous "FocusedFalcon" style names
// generated client-side. No real identity, no auth. A user MAY choose a
// persistent handle later via Settings; v1 generates a fresh one per
// session for total deniability.
export interface BodyDoublePartner {
  handle: string
  // Optional one-line context: "drafting Q3 brief", "studying for finals".
  // Only shared when the agreed mode is >= greetings.
  workingOn?: string | null
  // Soft session start so the partner sees how long the OTHER user has
  // been in the room — useful for "this person just arrived" cues.
  joinedAt: number
}

// What the user puts on the matching queue.
export interface BodyDoubleRequest {
  mode: BodyDoubleMode
  workingOn?: string | null
  // Local handle — generated when the request is created. Tells the matcher
  // who to introduce on the other side.
  handle: string
}

// Status of the local user's session. Drives the UI: which panel renders,
// whether the chat is active, whether we keep polling for partners.
export type BodyDoubleStatus =
  | 'idle' // no active intent
  | 'looking' // in the matching queue, no partner yet
  | 'matched' // partner found, exchanging intros
  | 'connected' // session active
  | 'ending' // one side is wrapping up

export interface BodyDoubleChatMessage {
  id: string
  senderHandle: string // either local or partner; UI compares to know which side
  text: string
  ts: number
}

// ── Universal sharing (folders / tasks / widgets) ───────────────────────────
//
// Any user-owned entity in PlexiDesk can be shared via a token. The token
// resolves to a read-only view (no auth required) or a "collaborator" copy
// the recipient owns once they sign up. Same data model for folder, task,
// and widget — the kind field discriminates so consumers pick the right
// rendering.
//
// v1 generates tokens locally and stores them in the local DB. There's no
// global address book; the token URL is the only way to reach the share
// once distributed. When the production server lands, tokens get mirrored
// up so the URL resolves to a hosted viewer; the renderer code path stays
// identical.

export type ShareableKind = 'folder' | 'task' | 'widget'

// Permission level granted by the share. Two levels in v1 — keeping it
// simple. "view" = read-only render. "copy" = recipient can sign up and
// clone the item into their workspace.
export type ShareScope = 'view' | 'copy'

export interface ShareLink {
  // Stable id (uuid) for revoking + tracking.
  id: string
  // Random opaque token used in the URL (e.g. fb.app/share/<token>).
  // Distinct from id so id can be exposed to the owner while the token
  // stays the address ring that controls access.
  token: string
  // What's being shared.
  kind: ShareableKind
  entityId: string
  // Human-readable label for the share list ("Q3 brief", "Marketing
  // folder"). Captured at create-time so revoked / renamed items still
  // make sense in the share manager.
  label: string
  scope: ShareScope
  // Audit fields.
  createdAt: number
  // null = never expires. Otherwise unix ms.
  expiresAt: number | null
  // Cached visit count for the share manager UI. Incremented by the server
  // when the viewer URL is hit. In local-mock mode this stays 0.
  viewCount: number
  // Revoke = soft-delete. The token stops resolving and the share manager
  // shows it as "Revoked" so the owner can audit who they shared with.
  revoked: boolean
}

// Items shared WITH the current user — the "Shared with me" sidebar
// section. v1 these are populated when the user accepts a share invite;
// production will sync from the server on sign-in.
export interface SharedItem {
  id: string
  token: string
  kind: ShareableKind
  // Cached snapshot of the shared content for offline viewing. For
  // folders this is the folder + its task tree; for tasks it's the task
  // + its widgets; for widgets it's the widget record.
  snapshot: unknown
  // Who shared it — pseudonymous handle until accounts ship.
  fromHandle: string
  acceptedAt: number
  scope: ShareScope
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
  | 'folders'
  | 'workspace-progress'
  | 'workspace-health'
  | 'focus-session'
  | 'ai-assistant'
  | 'recent-notes'

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

// ── Mail (IMAP) ────────────────────────────────────────────────────────────
// Shapes shared by the main-process IMAP client, the preload bridge and the
// renderer mail store. The password is never part of any renderer-facing type.

export interface MailAccountInput {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  email?: string
}

export interface MailAccountPublic {
  configured: boolean
  host: string
  port: number
  secure: boolean
  user: string
  email?: string
}

export interface MailListItem {
  uid: number
  fromName: string
  fromAddress: string
  subject: string
  date: number
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
}

export interface MailFullMessage {
  uid: number
  fromName: string
  fromAddress: string
  to: string
  subject: string
  date: number
  text: string
  html: string | null
  attachments: { filename: string; size: number; contentType: string }[]
  // RFC822 Message-ID of this message and the References chain it carried, used
  // to thread a reply correctly (In-Reply-To + References headers on the way
  // out). Null when the server/message did not provide them.
  messageId: string | null
  references: string[]
  // Every recipient address on the original (To + Cc), so a "Reply all" can be
  // pre-populated without re-parsing. Excludes the user's own address at send
  // time, not here.
  toAddresses: string[]
  ccAddresses: string[]
}

// What the renderer hands the main process to send a message. Sent through the
// same account the user reads with; the main process derives SMTP from the
// stored IMAP host and reuses the stored app password.
export interface MailSendInput {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  // Plain-text body the user typed. HTML is generated from it on send so the
  // message has both parts; we do not author raw HTML in the composer.
  text: string
  // Threading headers when this is a reply — the original's Message-ID and the
  // References chain to append it to.
  inReplyTo?: string | null
  references?: string[]
}

export type MailSendResult = { ok: true } | { ok: false; error: string }

// ── Office documents (doc / sheet / slides) ─────────────────────────────────
// Standalone files created and edited as first-class artifacts. One table, one
// list, one AI-create flow; the body shape switches on docType.

export type DocType = 'doc' | 'sheet' | 'slides' | 'map'

// A single global-search result. `type` decides how the renderer routes a click;
// `taskId` is the canvas to open for widget / table-row hits, `docType` the
// document kind. `snippet` is a short, match-centred excerpt for display.
export interface SearchHit {
  type: 'task' | 'folder' | 'widget' | 'document' | 'file' | 'table-row'
  id: string
  title: string
  snippet: string
  score: number
  taskId?: string | null
  docType?: DocType
  widgetKind?: string
}

// ── Spreadsheet body ────────────────────────────────────────────────────────
// v1 was a single grid of string cells: { columns, rows }. v2 wraps one or more
// such grids as named tabs and adds per-cell formatting, column widths, a freeze
// region and charts. v1 bodies on disk stay valid and are lifted to v2 on open
// by normalizeBody (src/renderer/src/lib/sheetBody.ts); nothing is rewritten at
// rest until the user edits. A cell whose value starts with '=' is a formula
// evaluated at render time; what cannot be computed shows #ERR, never a fake
// number.

export interface SheetBodyV1 {
  columns: string[]
  rows: string[][]
}

// How a value should be displayed (the engine still stores the true value).
export type SheetNumberFormat =
  | { kind: 'general' }
  | { kind: 'number'; decimals: number; thousands?: boolean }
  | { kind: 'currency'; decimals: number; symbol: string }
  | { kind: 'percent'; decimals: number }
  | { kind: 'date'; pattern: string }

export interface SheetCellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string // text colour, hex
  bg?: string // fill colour, hex
  align?: 'left' | 'center' | 'right'
  fontFamily?: string // CSS font-family (e.g. a Google font)
  numFmt?: SheetNumberFormat
}

export interface SheetChartSpec {
  id: string
  type: 'bar' | 'line' | 'pie'
  range: string // e.g. 'A1:C10' on the owning tab
  title?: string
  headerRow?: boolean // first row holds series labels
  headerCol?: boolean // first column holds category labels
}

export interface SheetTab {
  id: string
  name: string
  columns: string[]
  rows: string[][]
  // Sparse per-cell formatting keyed "r,c". Absent = general/default.
  formats?: Record<string, SheetCellFormat>
  colWidths?: Record<number, number> // px; absent = default
  freeze?: { rows: number; cols: number }
  charts?: SheetChartSpec[]
}

export interface SheetBodyV2 {
  version: 2
  sheets: SheetTab[]
  activeSheet?: number
}

export type SheetBody = SheetBodyV1 | SheetBodyV2

// ── Slides body ───────────────────────────────────────────────────────────────
// v1 slides were fixed title + bullets + notes + layout. v2 models each slide as
// a set of positioned ELEMENTS (text boxes, images, shapes, lines) in a fixed
// 1280x720 logical space, plus a deck theme and per-slide transition. v1 decks
// open unchanged and are converted to elements on load by migrateSlidesBody
// (src/shared/slidesMigrate.ts); the old title/bullets fields are kept optional
// so a half-migrated body still renders.

export type SlideLayout =
  | 'title'
  | 'title-content'
  | 'two-content'
  | 'section'
  | 'blank'
  | 'image-caption'
  // legacy value, mapped to 'title-content' on migration
  | 'bullets'

export type SlideTransition = 'none' | 'fade' | 'slide'

export interface SlideFill {
  type: 'solid' | 'none'
  color?: string
}
export interface SlideBorder {
  color: string
  width: number
  style?: 'solid' | 'dashed'
}

// Inline text run inside a text element.
export interface SlideTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: number
}
export interface SlideTextParagraph {
  runs: SlideTextRun[]
  align?: 'left' | 'center' | 'right'
  bulletLevel?: number
  listStyle?: 'bullet' | 'number' | 'none'
}

interface SlideElementBase {
  id: string
  // Position + size in 1280x720 logical units.
  x: number
  y: number
  w: number
  h: number
  z: number
  rotation?: number
  // Marks elements that a theme is allowed to restyle (title/body/accent).
  styleRole?: 'title' | 'body' | 'accent'
}
export interface SlideTextElement extends SlideElementBase {
  type: 'text'
  paragraphs: SlideTextParagraph[]
  fontFamily?: string
  fill?: SlideFill
  border?: SlideBorder
  vAlign?: 'top' | 'middle' | 'bottom'
}
export interface SlideImageElement extends SlideElementBase {
  type: 'image'
  src: string // data: URI or file path
  fit?: 'contain' | 'cover' | 'fill'
  // When true, dragging a resize handle preserves the frame's aspect ratio.
  lockAspect?: boolean
  // The image's natural width/height, captured on insert, so aspect-lock and
  // "fit to image" can use the true ratio rather than the current frame.
  naturalW?: number
  naturalH?: number
}
export interface SlideShapeElement extends SlideElementBase {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'roundRect' | 'triangle'
  fill?: SlideFill
  border?: SlideBorder
}
export interface SlideLineElement extends SlideElementBase {
  type: 'line'
  // x/y is the start; x2/y2 the end. w/h are ignored.
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  arrowEnd?: boolean
}
export type SlideElement =
  | SlideTextElement
  | SlideImageElement
  | SlideShapeElement
  | SlideLineElement

export interface DeckTheme {
  id: string
  name: string
  background: string
  fontHeading: string
  fontBody: string
  accent: string
  textColor: string
  titleStyle: { fontSize: number; bold?: boolean; color?: string }
  bodyStyle: { fontSize: number; color?: string }
}

// One slide. v1 fields (title/bullets/layout) are optional and retained for
// backward-compatible reads; v2 rendering uses `elements`.
export interface Slide {
  id: string
  notes: string
  title?: string
  bullets?: string[]
  layout?: SlideLayout
  elements?: SlideElement[]
  transition?: SlideTransition
  background?: SlideFill
  schemaVersion?: 2
}

export interface SlidesBody {
  slides: Slide[]
  theme?: DeckTheme | string
  schemaVersion?: 2
  size?: { w: number; h: number }
}

// A 'doc' body is a Tiptap document JSON (the same shape PageWidget stores);
// it is opaque to everything except the editor, so it is typed loosely here.
export type DocBody = { type: 'doc'; content?: unknown[] } | Record<string, unknown>

// ── PlexiMaps (the 'map' document type) ─────────────────────────────────────
// A node-and-edge diagram / workflow map (flowcharts, process maps, org charts,
// mind maps). The body is a clean, tool-agnostic graph: nodes carry their own
// position + shape + colour, edges carry an optional label and line style. The
// editor (MapEditor) renders this on React Flow; the shape stays independent of
// React Flow so it can sync to the cloud and later export cleanly.
export type MapShape =
  | 'process' // rectangle — a step / action
  | 'decision' // diamond — a branch / yes-no
  | 'terminator' // pill — start / end
  | 'data' // parallelogram — input / output
  | 'database' // cylinder — a store
  | 'circle' // connector / state
  | 'note' // free text label

export interface MapNode {
  id: string
  x: number
  y: number
  label: string
  shape: MapShape
  color: string
  width?: number
  height?: number
}

export interface MapEdge {
  id: string
  source: string
  target: string
  label?: string
  sourceHandle?: string | null
  targetHandle?: string | null
  style?: 'solid' | 'dashed'
  animated?: boolean
}

export interface MapBody {
  version: 1
  nodes: MapNode[]
  edges: MapEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

// The full document, body included.
export interface FbDocument {
  id: string
  docType: DocType
  title: string
  body: DocBody | SheetBody | SlidesBody | MapBody
  archived: boolean
  createdAt: number
  updatedAt: number
}

// List row — everything except the (potentially large) body.
export interface DocumentMeta {
  id: string
  docType: DocType
  title: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface DocumentDraft {
  docType: DocType
  title: string
  body?: DocBody | SheetBody | SlidesBody | MapBody
}

export interface DocumentPatch {
  title?: string
  body?: DocBody | SheetBody | SlidesBody | MapBody
  archived?: boolean
}
