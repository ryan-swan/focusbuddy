import type {
  DeckConfig,
  KeyComboAction,
  Modifier,
  StreamDeckAction
} from './streamdeck'

// Macro conflict detection.
//
// Three tiers of conflict the editor surfaces:
//   1. RESERVED      — macOS system shortcuts that almost every user
//                      relies on (⌘Q quit, ⌘Tab app switcher, etc).
//                      We strongly warn but don't block — power users
//                      sometimes intentionally remap these.
//   2. STANDARD      — common app/system shortcuts that are widely
//                      memorised (⌘C copy, ⌘V paste, ⌘⇧4 screenshot).
//                      We INFORM with a green check, since these are
//                      exactly the kind of shortcuts users want on
//                      their deck.
//   3. DUPLICATE     — the same combo is ALREADY assigned to another
//                      button on this deck. We warn so the user
//                      doesn't accidentally fork their muscle memory.
//
// Conflict checking runs across the action being edited PLUS every
// step of multi-step macros. For non-key-combo actions (open-app,
// type-text, etc.) we only check the duplicate dimension.

export type ConflictTier = 'reserved' | 'standard' | 'duplicate' | 'ok'

export interface ConflictDetail {
  tier: ConflictTier
  // Human-readable explanation shown next to the warning.
  message: string
  // For duplicate: which button collides. The renderer can surface a
  // jump-to-button affordance.
  collidesWithButtonId?: string
  collidesWithLabel?: string
}

interface ReservedEntry {
  modifiers: Modifier[]
  key: string
  name: string
  tier: 'reserved' | 'standard'
}

// Canonicalise a key (lowercase, trimmed). Modifier order shouldn't
// matter, so we sort the array.
function canonKey(key: string): string {
  return (key || '').trim().toLowerCase()
}
function canonMods(mods: Modifier[]): string {
  return [...(mods || [])].sort().join('+')
}

// The reserved + standard shortcut table. Curated for macOS; we'll add
// platform variants when Windows / Linux executor lands. Each entry
// names the shortcut so we can surface "this is the macOS Spotlight
// shortcut" instead of just "this is reserved".
const SHORTCUTS: ReservedEntry[] = [
  // ── RESERVED (system-critical) ─────────────────────────────────────
  { modifiers: ['cmd'], key: 'q', name: 'Quit application', tier: 'reserved' },
  { modifiers: ['cmd'], key: 'w', name: 'Close window', tier: 'reserved' },
  { modifiers: ['cmd'], key: 'm', name: 'Minimize window', tier: 'reserved' },
  { modifiers: ['cmd'], key: 'h', name: 'Hide application', tier: 'reserved' },
  { modifiers: ['cmd'], key: 'tab', name: 'App switcher', tier: 'reserved' },
  { modifiers: ['cmd'], key: 'space', name: 'Spotlight search', tier: 'reserved' },
  { modifiers: ['cmd', 'option'], key: 'esc', name: 'Force Quit', tier: 'reserved' },
  { modifiers: ['cmd', 'control'], key: 'q', name: 'Lock screen', tier: 'reserved' },
  { modifiers: ['cmd', 'control'], key: 'f', name: 'Toggle fullscreen', tier: 'reserved' },
  { modifiers: ['cmd', 'shift'], key: 'q', name: 'Log out', tier: 'reserved' },

  // ── STANDARD (common, OK to put on deck) ──────────────────────────
  { modifiers: ['cmd'], key: 'c', name: 'Copy', tier: 'standard' },
  { modifiers: ['cmd'], key: 'v', name: 'Paste', tier: 'standard' },
  { modifiers: ['cmd'], key: 'x', name: 'Cut', tier: 'standard' },
  { modifiers: ['cmd'], key: 'z', name: 'Undo', tier: 'standard' },
  { modifiers: ['cmd', 'shift'], key: 'z', name: 'Redo', tier: 'standard' },
  { modifiers: ['cmd'], key: 'a', name: 'Select all', tier: 'standard' },
  { modifiers: ['cmd'], key: 's', name: 'Save', tier: 'standard' },
  { modifiers: ['cmd'], key: 'f', name: 'Find', tier: 'standard' },
  { modifiers: ['cmd'], key: 'p', name: 'Print', tier: 'standard' },
  { modifiers: ['cmd'], key: 'n', name: 'New window', tier: 'standard' },
  { modifiers: ['cmd'], key: 't', name: 'New tab', tier: 'standard' },
  { modifiers: ['cmd', 'shift'], key: 't', name: 'Reopen closed tab', tier: 'standard' },
  // Screenshots
  { modifiers: ['cmd', 'shift'], key: '3', name: 'Screenshot full screen', tier: 'standard' },
  { modifiers: ['cmd', 'shift'], key: '4', name: 'Screenshot region', tier: 'standard' },
  { modifiers: ['cmd', 'shift'], key: '5', name: 'Screenshot toolbar', tier: 'standard' },
  // Mission control / spaces
  { modifiers: ['control'], key: 'arrow-up', name: 'Mission Control', tier: 'standard' },
  { modifiers: ['control'], key: 'arrow-down', name: 'App windows', tier: 'standard' },
  { modifiers: ['control'], key: 'arrow-left', name: 'Previous space', tier: 'standard' },
  { modifiers: ['control'], key: 'arrow-right', name: 'Next space', tier: 'standard' },
  // Browser navigation
  { modifiers: ['cmd'], key: 'r', name: 'Reload page', tier: 'standard' },
  { modifiers: ['cmd'], key: 'l', name: 'Focus address bar', tier: 'standard' },
  { modifiers: ['cmd', 'shift'], key: 'r', name: 'Hard reload', tier: 'standard' }
]

// Build a lookup for fast key-combo conflict checking.
const SHORTCUT_INDEX = new Map<string, ReservedEntry>()
for (const s of SHORTCUTS) {
  SHORTCUT_INDEX.set(`${canonMods(s.modifiers)}::${canonKey(s.key)}`, s)
}

// Check a single key-combo against the reserved/standard table.
export function checkAgainstReserved(combo: KeyComboAction): ConflictDetail {
  const lookup = `${canonMods(combo.modifiers)}::${canonKey(combo.key)}`
  const hit = SHORTCUT_INDEX.get(lookup)
  if (!hit) return { tier: 'ok', message: '' }
  if (hit.tier === 'reserved') {
    return {
      tier: 'reserved',
      message: `${hit.name} is a critical macOS shortcut. Putting this on your deck will trigger ${hit.name} every time you press it — you usually want that to live on the keyboard.`
    }
  }
  return {
    tier: 'standard',
    message: `${hit.name} — this is a widely-used standard shortcut. Putting it on the deck means one tap fires it; that's exactly what most users want.`
  }
}

// Find duplicate key-combo on the same deck. We walk every page (root
// + folders) and every button's action (including multi-step children).
// Skips the button currently being edited (identified by buttonId).
export function findDuplicateInDeck(
  combo: KeyComboAction,
  deck: DeckConfig,
  skipButtonId?: string
): ConflictDetail {
  const lookup = `${canonMods(combo.modifiers)}::${canonKey(combo.key)}`
  for (const pageId of Object.keys(deck.pages)) {
    const page = deck.pages[pageId]
    for (const slotKey of Object.keys(page.buttons)) {
      const btn = page.buttons[Number(slotKey)]
      if (!btn) continue
      if (btn.id === skipButtonId) continue
      if (btn.kind !== 'action') continue
      const collides = actionContainsKeyCombo(btn.action, lookup)
      if (collides) {
        return {
          tier: 'duplicate',
          message: `"${btn.label || '(unnamed)'}" already uses this shortcut. Two buttons firing the same keys is usually a sign one was a mistake.`,
          collidesWithButtonId: btn.id,
          collidesWithLabel: btn.label || '(unnamed)'
        }
      }
    }
  }
  return { tier: 'ok', message: '' }
}

function actionContainsKeyCombo(action: StreamDeckAction, lookup: string): boolean {
  if (action.type === 'key-combo') {
    return `${canonMods(action.modifiers)}::${canonKey(action.key)}` === lookup
  }
  if (action.type === 'multi-step') {
    for (const step of action.steps) {
      if (step.type === 'key-combo') {
        if (`${canonMods(step.modifiers)}::${canonKey(step.key)}` === lookup) return true
      }
    }
  }
  return false
}

// Combined conflict report — runs both checks and returns the
// strongest. Reserved > duplicate > standard > ok. The renderer
// renders all that apply (duplicate AND reserved are independent
// reasons to worry).
export interface ConflictReport {
  reserved: ConflictDetail | null
  duplicate: ConflictDetail | null
}

export function checkActionConflicts(
  action: StreamDeckAction,
  deck: DeckConfig,
  skipButtonId?: string
): ConflictReport {
  const out: ConflictReport = { reserved: null, duplicate: null }
  const combos = collectKeyCombos(action)
  for (const combo of combos) {
    const r = checkAgainstReserved(combo)
    if (r.tier !== 'ok') {
      // Surface the most-severe one if multiple steps hit different tiers.
      if (!out.reserved || (r.tier === 'reserved' && out.reserved.tier !== 'reserved')) {
        out.reserved = r
      }
    }
    const d = findDuplicateInDeck(combo, deck, skipButtonId)
    if (d.tier === 'duplicate') {
      out.duplicate = d
    }
  }
  return out
}

function collectKeyCombos(action: StreamDeckAction): KeyComboAction[] {
  if (action.type === 'key-combo') return [action]
  if (action.type === 'multi-step') {
    const out: KeyComboAction[] = []
    for (const step of action.steps) {
      if (step.type === 'key-combo') out.push(step)
    }
    return out
  }
  return []
}
