// Stream Deck data model. Both main and renderer import this file so the
// wire types between button click → IPC → action executor stay aligned.
//
// A deck is a tree:
//   - Root page (always present, 30 button slots = 10 cols × 3 rows)
//   - Buttons are either ACTIONS (do something) or FOLDERS (navigate to
//     another page, which itself has 30 buttons, recursively).
// There is no depth limit — folders can be nested arbitrarily.
//
// Configuration lives in widget.content as JSON (versioned via _version
// for forward-compat). 30-button pages × small per-button payloads stay
// well under any practical size limit; if a user ever uploads dozens of
// large custom images we'd want to migrate images to fb-file:// refs,
// but for v1 we just store the base64 data URL (or a remote URL).

export const STREAMDECK_VERSION = 1 as const
export const STREAMDECK_COLUMNS = 10
export const STREAMDECK_ROWS = 3
export const STREAMDECK_SLOTS = STREAMDECK_COLUMNS * STREAMDECK_ROWS

// ─── Action payloads ────────────────────────────────────────────────────

export type ActionKind =
  | 'open-app'
  | 'open-url'
  | 'key-combo'
  | 'type-text'
  | 'media-key'
  | 'set-volume'
  | 'run-shell'
  | 'delay'
  | 'multi-step'

// Modifier keys (subset that AppleScript + Windows shortcuts understand).
// Stored as an array so order is preserved for display, and so a button
// like "Cmd+Shift+T" round-trips reliably.
export type Modifier = 'cmd' | 'shift' | 'option' | 'control' | 'fn'

export interface KeyComboAction {
  type: 'key-combo'
  // The non-modifier key. Single character ("t") or special key name
  // ("enter", "escape", "tab", "space", "delete", "arrow-left", etc.).
  key: string
  modifiers: Modifier[]
}

export interface OpenAppAction {
  type: 'open-app'
  // macOS: path to .app bundle, or app name resolvable by `open -a`.
  // Windows/Linux: executable path or name in PATH.
  target: string
}

export interface OpenUrlAction {
  type: 'open-url'
  url: string
}

export interface TypeTextAction {
  type: 'type-text'
  text: string
}

export interface MediaKeyAction {
  type: 'media-key'
  key: 'play-pause' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'mute'
}

export interface SetVolumeAction {
  type: 'set-volume'
  // 0–100
  level: number
}

export interface RunShellAction {
  type: 'run-shell'
  command: string
  // Optional: kill after this many ms. Defaults to 10s in the executor.
  timeoutMs?: number
}

export interface DelayAction {
  type: 'delay'
  ms: number
}

export interface MultiStepAction {
  type: 'multi-step'
  // Sequence runs left-to-right. Each step awaits the previous.
  // Multi-step inside multi-step is allowed but discouraged.
  steps: SingleStepAction[]
}

// Anything except multi-step (so we can't nest indefinitely).
export type SingleStepAction =
  | KeyComboAction
  | OpenAppAction
  | OpenUrlAction
  | TypeTextAction
  | MediaKeyAction
  | SetVolumeAction
  | RunShellAction
  | DelayAction

export type StreamDeckAction = SingleStepAction | MultiStepAction

// ─── Buttons + pages ────────────────────────────────────────────────────

export interface ButtonStyle {
  // Material symbol icon name (existing icon system). Falls back to a
  // generic icon if the name doesn't resolve.
  icon?: string
  // Solid color used for the button's tint. Defaults to violet accent.
  color?: string
  // Optional user-provided image — data URL or fb-file:// ref. Renders
  // as the button face; label still shows underneath.
  image?: string
}

export interface ActionButton {
  id: string
  kind: 'action'
  // Display label below the icon. Empty = no label.
  label: string
  style: ButtonStyle
  action: StreamDeckAction
  // Optional sound + haptic override. When absent, the deck-wide
  // defaults from DeckSettings are used.
  sound?: 'click' | 'tick' | 'thunk' | 'silent'
  haptic?: 'soft' | 'medium' | 'strong' | 'none'
}

export interface FolderButton {
  id: string
  kind: 'folder'
  label: string
  style: ButtonStyle
  // ID of the page this folder opens. The page exists in deck.pages.
  pageId: string
}

export type DeckButton = ActionButton | FolderButton

export interface DeckPage {
  id: string
  name: string
  // Sparse map of position (0..29) → button. Empty positions are gaps.
  buttons: Partial<Record<number, DeckButton>>
}

export interface DeckSettings {
  // Default sound on click for action buttons that don't override.
  defaultSound: 'click' | 'tick' | 'thunk' | 'silent'
  defaultHaptic: 'soft' | 'medium' | 'strong' | 'none'
  // Master backlight glow intensity (0–1). Adjusts the violet halo
  // strength around every button so the user can dial it to taste.
  glow: number
}

export interface DeckConfig {
  _version: typeof STREAMDECK_VERSION
  rootPageId: string
  // All pages keyed by id. Root + every folder page.
  pages: Record<string, DeckPage>
  settings: DeckSettings
}

// ─── Defaults / helpers ────────────────────────────────────────────────

export function emptyDeckConfig(): DeckConfig {
  const rootId = `pg-${Math.random().toString(36).slice(2, 10)}`
  return {
    _version: STREAMDECK_VERSION,
    rootPageId: rootId,
    pages: {
      [rootId]: { id: rootId, name: 'Home', buttons: {} }
    },
    settings: {
      defaultSound: 'click',
      defaultHaptic: 'soft',
      glow: 0.6
    }
  }
}

export function makeButtonId(): string {
  return `btn-${Math.random().toString(36).slice(2, 10)}`
}

export function makePageId(): string {
  return `pg-${Math.random().toString(36).slice(2, 10)}`
}

// Parse the widget.content JSON, returning the empty deck on any failure.
// Used by both the widget renderer and any future serialisers (export,
// snapshot, etc.).
export function parseDeckConfig(raw: string | null | undefined): DeckConfig {
  if (!raw) return emptyDeckConfig()
  try {
    const parsed = JSON.parse(raw) as Partial<DeckConfig>
    if (parsed._version !== STREAMDECK_VERSION) return emptyDeckConfig()
    if (!parsed.rootPageId || !parsed.pages || !parsed.pages[parsed.rootPageId]) {
      return emptyDeckConfig()
    }
    return parsed as DeckConfig
  } catch {
    return emptyDeckConfig()
  }
}

export function serializeDeckConfig(config: DeckConfig): string {
  return JSON.stringify(config)
}

// Default button colors users can pick from. Stored as CSS colors;
// rendering composites them with the backlit glow effect.
export const BUTTON_PALETTE = [
  '#8b5cf6', // violet (default)
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#94a3b8', // slate
  '#1f2937' // ink
] as const

// Security: neutralise run-shell actions in a deck that arrived from an
// untrusted source (an accepted share, an import). A shared SpeedDeck widget
// could otherwise carry an arbitrary shell command that runs when the
// recipient clicks the button. The main-process executor also confirms every
// run-shell at click time, so this is defense in depth: strip the delivery so
// the button never even offers to run. A stripped button keeps its label/icon
// but its action becomes a no-op that explains why. Returns a new config; the
// input is not mutated. Recurses into multi-step steps and folder pages
// (pages are flat in DeckConfig, so every page is visited).
function sanitizeAction(action: StreamDeckAction): { action: StreamDeckAction; stripped: boolean } {
  if (action.type === 'run-shell') {
    return { action: { type: 'open-url', url: '' }, stripped: true }
  }
  if (action.type === 'multi-step') {
    let stripped = false
    const steps = action.steps.map((s) => {
      if (s.type === 'run-shell') {
        stripped = true
        return { type: 'open-url', url: '' } as SingleStepAction
      }
      return s
    })
    return { action: { ...action, steps }, stripped }
  }
  return { action, stripped: false }
}

export function stripRunShellFromDeck(config: DeckConfig): { config: DeckConfig; strippedCount: number } {
  let strippedCount = 0
  const pages: Record<string, DeckPage> = {}
  for (const [pageId, page] of Object.entries(config.pages)) {
    const buttons: Partial<Record<number, DeckButton>> = {}
    for (const [pos, button] of Object.entries(page.buttons)) {
      if (button && button.kind === 'action') {
        const { action, stripped } = sanitizeAction(button.action)
        if (stripped) {
          strippedCount++
          buttons[Number(pos)] = { ...button, action, label: button.label || 'Removed for safety' }
          continue
        }
      }
      if (button) buttons[Number(pos)] = button
    }
    pages[pageId] = { ...page, buttons }
  }
  return { config: { ...config, pages }, strippedCount }
}

// Convenience for the accept-share / import path: takes the raw widget content
// JSON of a streamdeck widget, strips run-shell, and returns the cleaned JSON.
// Handles both the bare DeckConfig and the { scope, taskDeck } wrapper the
// widget persists. On any parse failure it returns the input unchanged, since
// the executor gate is the authoritative backstop.
export function stripRunShellFromDeckContent(content: string): string {
  if (!content) return content
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && 'taskDeck' in parsed) {
      const deck = parsed.taskDeck as DeckConfig
      const { config } = stripRunShellFromDeck(deck)
      return JSON.stringify({ ...parsed, taskDeck: config })
    }
    if (parsed && typeof parsed === 'object' && 'pages' in parsed) {
      const { config } = stripRunShellFromDeck(parsed as unknown as DeckConfig)
      return JSON.stringify(config)
    }
    return content
  } catch {
    return content
  }
}
