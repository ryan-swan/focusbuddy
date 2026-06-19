// Unit tests for the widget quick-add shortcut maps (lib/widgetCatalog.ts).
// These guard the invariants the canvas + command palette rely on: the two maps
// stay in sync, no two widgets claim the same key, every shortcut points at a
// real picker-visible widget, and none collide with the canvas's reserved keys.

import { describe, it, expect } from 'vitest'
import {
  WIDGET_SHORTCUTS,
  SHORTCUT_TO_KIND,
  WIDGET_CATALOG
} from '../../src/renderer/src/lib/widgetCatalog'

describe('widget quick-add shortcuts', () => {
  it('SHORTCUT_TO_KIND is the exact inverse of WIDGET_SHORTCUTS', () => {
    const entries = Object.entries(WIDGET_SHORTCUTS) as Array<[string, string]>
    expect(Object.keys(SHORTCUT_TO_KIND)).toHaveLength(entries.length)
    for (const [kind, key] of entries) {
      expect(SHORTCUT_TO_KIND[key]).toBe(kind)
    }
  })

  it('assigns no key to two widgets', () => {
    const keys = Object.values(WIDGET_SHORTCUTS)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses only single uppercase letters', () => {
    for (const key of Object.values(WIDGET_SHORTCUTS)) {
      expect(key).toMatch(/^[A-Z]$/)
    }
  })

  it('every shortcut targets a real, picker-visible widget', () => {
    for (const kind of Object.keys(WIDGET_SHORTCUTS)) {
      const entry = WIDGET_CATALOG.find((e) => e.kind === kind)
      expect(entry, `catalog entry for ${kind}`).toBeTruthy()
      expect(entry!.hideFromPicker).toBeFalsy()
    }
  })

  it('avoids the canvas reserved keys (A select-all, H home)', () => {
    const reserved = new Set(['A', 'H'])
    for (const key of Object.values(WIDGET_SHORTCUTS)) {
      expect(reserved.has(key)).toBe(false)
    }
  })
})
