// App-wide text size. Many of the app's surfaces use fixed pixel fonts, so a
// rem-based scale would not reach them; instead this drives Chromium's page zoom
// (the same thing the browser's Ctrl-+ does), which enlarges every menu, list,
// label and button uniformly. The chosen scale is remembered and re-applied on
// launch. Requested by users who found the default text too small to read
// comfortably.

const KEY = 'plexi.ui.scale'

export interface UiScaleOption {
  value: number
  label: string
}

export const UI_SCALES: UiScaleOption[] = [
  { value: 0.9, label: 'Small' },
  { value: 1.0, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
  { value: 1.5, label: 'Largest' }
]

export function loadUiScale(): number {
  const n = Number(localStorage.getItem(KEY))
  return Number.isFinite(n) && n >= 0.8 && n <= 2 ? n : 1
}

export function saveUiScale(scale: number): void {
  localStorage.setItem(KEY, String(scale))
}

// Apply the scale to the whole window via the main process (webContents zoom).
export function applyUiScale(scale: number): void {
  void window.api.app.setZoomFactor(scale)
}
