// Every ThemeMode the picker offers must survive a relaunch. Gemstone did
// not from the day it shipped (b230ad6): loadTheme() validated the saved
// mode against a hand-written list that never included it, so picking
// Gemstone silently fell back to 'auto' on the next launch.

import { describe, it, expect, beforeEach } from 'vitest'
import { loadTheme, saveTheme, THEME_OPTIONS } from '../../src/renderer/src/lib/theme'

describe('theme persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips every mode the picker offers, gemstone included', () => {
    expect(THEME_OPTIONS.map((m) => m.value)).toContain('gemstone')
    for (const { value } of THEME_OPTIONS) {
      saveTheme(value, 'violet', 'system')
      expect(loadTheme().mode).toBe(value)
    }
  })

  it('falls back to auto for a mode that does not exist', () => {
    localStorage.setItem('fb.theme.mode', 'material-desk')
    expect(loadTheme().mode).toBe('auto')
  })
})
