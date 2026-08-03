// Capability gating — the pure decision layer.
//
// Everything here operates on a *resolved* capability map (the per-user
// values the signal server returns from /account/capabilities, which
// already fold in the user's tier, trial, AND any admin overrides). These
// functions contain zero React and zero I/O so they can be unit-tested
// exhaustively — they are the single source of truth for "is this allowed?"
//
// The UI (widget palette, desk creation, etc.) calls these; it must never
// re-implement the boolean/number/limit semantics inline, or the matrix and
// the app drift apart.

import { CAPABILITY_DEFAULTS, type CapabilityValue, type TierId } from './capabilityDefaults'

export type CapabilityMap = Record<string, CapabilityValue>

// Widget catalog `kind` → capability key. Kinds absent from this map are
// ungated (always creatable). A kind present here is creatable only when
// its capability resolves truthy for the user. This is what lets an admin
// gate a widget purely from the matrix — no app change required.
export const WIDGET_KIND_CAPABILITY: Record<string, string> = {
  table: 'widget_table',
  timer: 'widget_timer',
  sticky: 'widget_sticky',
  note: 'widget_notes',
  markdown: 'widget_notes',
  file: 'widget_files',
  webview: 'widget_browser',
  'task-link': 'widget_task_list',
  diagram: 'widget_diagram',
  scratchpad: 'widget_scratchpad'
}

export function capabilityForWidgetKind(kind: string): string | null {
  return WIDGET_KIND_CAPABILITY[kind] ?? null
}

// Truthiness of a capability value:
//   boolean → itself
//   number  → > 0  (a 0 limit is "off")
//   string  → non-empty and not literally "off" (covers "Unlimited", "$5/mo", etc.)
export function isEnabledValue(v: CapabilityValue | undefined): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v > 0
  if (typeof v === 'string') return v.length > 0 && v.toLowerCase() !== 'off'
  return false
}

export function isCapabilityEnabled(caps: CapabilityMap, key: string): boolean {
  return isEnabledValue(caps[key])
}

// Numeric limit for a capability value:
//   finite number   → that count is the cap (e.g. 3 desks)
//   null            → unlimited (boolean true, or a non-numeric truthy string like "Unlimited")
//   0               → feature off (boolean false, "off", or empty)
export function limitForValue(v: CapabilityValue | undefined): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? null : 0
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n) && v.trim() !== '') return n
    return isEnabledValue(v) ? null : 0
  }
  return 0
}

export function limitFor(caps: CapabilityMap, key: string): number | null {
  return limitForValue(caps[key])
}

// Can the user create one more of a limited resource, given how many they
// already have? `null` limit (unlimited) is always allowed; a numeric limit
// allows creation while currentCount < limit.
export function canCreateMore(caps: CapabilityMap, key: string, currentCount: number): boolean {
  const limit = limitFor(caps, key)
  if (limit === null) return true
  return currentCount < limit
}

// Can the user create a widget of this catalog kind?
export function canCreateWidget(caps: CapabilityMap, kind: string): boolean {
  const key = capabilityForWidgetKind(kind)
  if (!key) return true // ungated kind
  return isCapabilityEnabled(caps, key)
}

// Human-readable limit for UI copy ("3" / "Unlimited").
export function limitLabel(caps: CapabilityMap, key: string): string {
  const limit = limitFor(caps, key)
  return limit === null ? 'Unlimited' : String(limit)
}

// Build a resolved capability map for a tier straight from the bundled
// defaults. Used only as an offline/test fallback — the live app uses the
// server-resolved map (which includes admin overrides).
export function defaultsForTier(tier: TierId): CapabilityMap {
  const out: CapabilityMap = {}
  for (const [key, perTier] of Object.entries(CAPABILITY_DEFAULTS)) {
    out[key] = perTier[tier]
  }
  return out
}
