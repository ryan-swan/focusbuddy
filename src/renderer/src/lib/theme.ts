import { useEffect, useState } from 'react'
import { futuristicPowerOn, futuristicPowerOff } from './audioBeep'

export type ThemeMode = 'light' | 'dark' | 'auto' | 'futuristic' | 'atelier'
export type AccentColor = 'violet' | 'blue' | 'emerald' | 'rose' | 'heritage'

interface AccentPalette {
  base: string
  hover: string
}

const ACCENT_PALETTES: Record<AccentColor, { light: AccentPalette; dark: AccentPalette }> = {
  violet: {
    light: { base: '124 58 237', hover: '109 40 217' },
    dark: { base: '167 139 250', hover: '196 181 253' }
  },
  blue: {
    light: { base: '37 99 235', hover: '29 78 216' },
    dark: { base: '96 165 250', hover: '147 197 253' }
  },
  emerald: {
    light: { base: '5 150 105', hover: '4 120 87' },
    dark: { base: '52 211 153', hover: '110 231 183' }
  },
  rose: {
    light: { base: '225 29 72', hover: '190 18 60' },
    dark: { base: '251 113 133', hover: '253 164 175' }
  },
  // Heritage gold — the Atelier theme's signature accent. Restrained, warm,
  // reads as luxury hardware rather than tech. Subtly different in light vs
  // atelier so the gold sits properly on cream surfaces in light, on deep
  // navy in atelier.
  heritage: {
    light: { base: '180 138 70', hover: '156 113 53' },
    dark: { base: '201 169 97', hover: '224 196 137' }
  }
}

const KEY_MODE = 'fb.theme.mode'
const KEY_ACCENT = 'fb.theme.accent'

export const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; preview: string }> = [
  { value: 'violet', label: 'Violet', preview: '#7c3aed' },
  { value: 'blue', label: 'Blue', preview: '#2563eb' },
  { value: 'emerald', label: 'Emerald', preview: '#059669' },
  { value: 'rose', label: 'Rose', preview: '#e11d48' },
  { value: 'heritage', label: 'Heritage', preview: '#b48a46' }
]

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'auto', label: 'Auto', icon: 'brightness_auto' },
  { value: 'futuristic', label: 'Futuristic', icon: 'auto_awesome' },
  // Atelier — the premium flagship theme. Deep navy ground, warm cream
  // content surfaces, heritage-gold accent locked in. Hairline borders,
  // restrained typography, no bright colors anywhere. The "I'm in the
  // exclusive club" theme.
  { value: 'atelier', label: 'Atelier', icon: 'workspace_premium' }
]

export function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'futuristic' || mode === 'atelier') return 'dark'
  if (mode === 'auto') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  if (mode === 'light' || mode === 'dark') return mode
  return 'light'
}

export function applyTheme(mode: ThemeMode, accent: AccentColor): void {
  if (typeof document === 'undefined') return
  const effective = getEffectiveTheme(mode)
  const root = document.documentElement
  root.classList.toggle('dark', effective === 'dark')
  root.classList.toggle('futuristic', mode === 'futuristic')
  root.classList.toggle('atelier', mode === 'atelier')
  // Atelier locks the accent to heritage gold — overriding the user's pick.
  // We don't persist this back; if they switch off atelier, their preferred
  // accent returns. (atelier IS the look — the whole point is the cohesion.)
  const effectiveAccent: AccentColor = mode === 'atelier' ? 'heritage' : accent
  root.setAttribute('data-accent', effectiveAccent)
  const palette = ACCENT_PALETTES[effectiveAccent][effective]
  root.style.setProperty('--accent', palette.base)
  root.style.setProperty('--accent-hover', palette.hover)
}

export function loadTheme(): { mode: ThemeMode; accent: AccentColor } {
  if (typeof localStorage === 'undefined') return { mode: 'auto', accent: 'violet' }
  const mode = localStorage.getItem(KEY_MODE) as ThemeMode | null
  const accent = localStorage.getItem(KEY_ACCENT) as AccentColor | null
  return {
    mode:
      mode && ['light', 'dark', 'auto', 'futuristic', 'atelier'].includes(mode)
        ? mode
        : 'auto',
    accent:
      accent && ['violet', 'blue', 'emerald', 'rose', 'heritage'].includes(accent)
        ? accent
        : 'violet'
  }
}

export function saveTheme(mode: ThemeMode, accent: AccentColor): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_MODE, mode)
  localStorage.setItem(KEY_ACCENT, accent)
}

export interface ThemeApi {
  mode: ThemeMode
  accent: AccentColor
  setMode: (m: ThemeMode) => void
  setAccent: (a: AccentColor) => void
}

export function useTheme(): ThemeApi {
  const [mode, setModeState] = useState<ThemeMode>(() => loadTheme().mode)
  const [accent, setAccentState] = useState<AccentColor>(() => loadTheme().accent)

  useEffect(() => {
    applyTheme(mode, accent)
    saveTheme(mode, accent)
  }, [mode, accent])

  useEffect(() => {
    if (mode !== 'auto') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => applyTheme(mode, accent)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mode, accent])

  // Audio cue when entering/leaving futuristic — a "powering on" sweep
  const setMode = (next: ThemeMode): void => {
    if (next === 'futuristic' && mode !== 'futuristic') futuristicPowerOn()
    else if (mode === 'futuristic' && next !== 'futuristic') futuristicPowerOff()
    setModeState(next)
  }

  return {
    mode,
    accent,
    setMode,
    setAccent: setAccentState
  }
}
