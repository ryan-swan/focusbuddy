// App-wide UI scale and density. Two independent levers work together to keep
// the app usable on small laptops and roomy on large displays.
//
// SCALE is a uniform Chromium page zoom (the same thing the browser's Ctrl-+
// does). Many of the app's surfaces use fixed pixel fonts, so a rem-based scale
// would not reach them; page zoom enlarges or shrinks every menu, list, label,
// pill and icon together, uniformly, which keeps proportions and legibility
// intact. Lowering the scale is how a small screen reclaims desk real estate.
//
// DENSITY is a separate CSS lever (data-density on the document root) that
// tightens the chrome's spacing without shrinking reading text, so compact mode
// frees space by removing padding rather than by making type harder to read.
//
// Both are auto-chosen on first launch from the screen size, then remembered and
// re-applied on every launch. The View menu, the Cmd +/-/0 shortcuts and the
// Settings controls all drive the same stored values.

const SCALE_KEY = 'plexi.ui.scale'
const DENSITY_KEY = 'plexi.ui.density'

export interface UiScaleOption {
  value: number
  label: string
}

// The presets shown in Settings. The main-process zoom IPC clamps to 0.8..2.0,
// so 0.8 is the smallest preset we offer.
export const UI_SCALES: UiScaleOption[] = [
  { value: 0.8, label: 'Compact' },
  { value: 0.9, label: 'Small' },
  { value: 1.0, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
  { value: 1.5, label: 'Largest' }
]

export const SCALE_MIN = 0.8
export const SCALE_MAX = 2.0
const SCALE_STEP = 0.1

export type Density = 'comfortable' | 'compact'

export function clampScale(n: number): number {
  const rounded = Math.round(n * 100) / 100
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded))
}

function screenSize(): { w: number; h: number } {
  if (typeof window !== 'undefined' && window.screen) {
    return { w: window.screen.availWidth || 1440, h: window.screen.availHeight || 900 }
  }
  return { w: 1440, h: 900 }
}

// Pick a sensible scale the first time the app runs, based on the display. A
// 13-inch laptop reports roughly 1440x900 and a 14-inch MacBook about 1512x982
// (minus the menu bar), so small screens start slightly zoomed out to give the
// desk more room. Large and external displays start at 100%.
export function autoDefaultScale(): number {
  const { w, h } = screenSize()
  if (h <= 900 || w <= 1440) return 0.85
  if (h <= 1050 || w <= 1600) return 0.9
  return 1.0
}

// Compact chrome on anything laptop-sized; comfortable on large displays.
export function autoDefaultDensity(): Density {
  const { h } = screenSize()
  return h <= 1050 ? 'compact' : 'comfortable'
}

// Deterministic: a stored value is honoured only when it is a finite number in
// range, and anything else (unset, corrupt, out of range) falls back to 1. The
// first-run screen fit lives in ensureFirstRunDefaults, which persists a chosen
// default once, so this reader stays pure and predictable.
export function loadUiScale(): number {
  const n = Number(localStorage.getItem(SCALE_KEY))
  return Number.isFinite(n) && n >= SCALE_MIN && n <= SCALE_MAX ? n : 1
}

export function saveUiScale(scale: number): void {
  localStorage.setItem(SCALE_KEY, String(clampScale(scale)))
}

export function loadDensity(): Density {
  const raw = localStorage.getItem(DENSITY_KEY)
  return raw === 'compact' ? 'compact' : 'comfortable'
}

export function saveDensity(d: Density): void {
  localStorage.setItem(DENSITY_KEY, d)
}

// On the very first launch there is no saved scale or density. Choose values
// that fit the screen and persist them once, so the app opens sized for the
// display and the choice then behaves like any other saved preference (the
// readers above stay pure). A later explicit choice in Settings or via zoom
// overrides these, and they are never re-applied once something is stored.
export function ensureFirstRunDefaults(): void {
  if (localStorage.getItem(SCALE_KEY) == null) saveUiScale(autoDefaultScale())
  if (localStorage.getItem(DENSITY_KEY) == null) saveDensity(autoDefaultDensity())
}

// Apply the scale to the whole window via the main process (webContents zoom),
// then broadcast so any open Settings UI reflects the new value live (the View
// menu and the keyboard shortcuts change the scale without going through the
// Settings component).
export function applyUiScale(scale: number): void {
  const s = clampScale(scale)
  void window.api.app.setZoomFactor(s)
  window.dispatchEvent(new CustomEvent<number>('plexi:uiscale', { detail: s }))
}

export function applyDensity(d: Density): void {
  document.documentElement.setAttribute('data-density', d)
  window.dispatchEvent(new CustomEvent<Density>('plexi:density', { detail: d }))
}

// Step the scale for the View menu and Cmd +/-/0. Zoom in and out move by a
// fixed increment through the full range; reset returns to 100%. The new value
// is saved and applied, and returned for the caller.
export function stepUiScale(dir: 'in' | 'out' | 'reset'): number {
  const cur = loadUiScale()
  let next: number
  if (dir === 'reset') next = 1.0
  else next = clampScale(cur + (dir === 'in' ? SCALE_STEP : -SCALE_STEP))
  saveUiScale(next)
  applyUiScale(next)
  return next
}
