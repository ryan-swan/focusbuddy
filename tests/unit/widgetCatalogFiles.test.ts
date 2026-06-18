import { describe, it, expect } from 'vitest'
import { WIDGET_CATALOG, entriesByCategory, catalogFor } from '../../src/renderer/src/lib/widgetCatalog'

// The canvas widget-add menus (right-click "Add object" and the + Widget palette)
// should offer the NATIVE office documents (Document/Spreadsheet/Slides) under
// "Files", and never the legacy Google gdoc/gsheet/gslide/pdf entries, which are
// superseded and flagged hideFromPicker.

describe('widget catalog — office docs in the add menus', () => {
  it('groups native Document/Spreadsheet/Slides under Files', () => {
    const files = entriesByCategory().Files
    const labels = files.map((e) => e.label)
    expect(labels).toContain('Document')
    expect(labels).toContain('Spreadsheet')
    expect(labels).toContain('Slides')
    // Native office types are real kinds, not Google web embeds.
    expect(files.find((e) => e.label === 'Document')?.kind).toBe('doc')
    expect(files.find((e) => e.label === 'Spreadsheet')?.kind).toBe('sheet')
    expect(files.find((e) => e.label === 'Slides')?.kind).toBe('slides')
  })

  it('never surfaces the legacy Google doc/sheet/slides or pdf in any picker category', () => {
    const grouped = entriesByCategory()
    const allShown = Object.values(grouped).flat()
    for (const kind of ['gdoc', 'gsheet', 'gslide', 'pdf'] as const) {
      expect(allShown.some((e) => e.kind === kind)).toBe(false)
    }
    // And no entry that survives the picker filter is hideFromPicker.
    expect(allShown.every((e) => !e.hideFromPicker)).toBe(true)
  })

  it('keeps the legacy Google kinds in the catalog (for rendering + URL paste) but hidden', () => {
    for (const kind of ['gdoc', 'gsheet', 'gslide'] as const) {
      const entry = catalogFor(kind)
      expect(entry, `${kind} kind still exists`).toBeTruthy()
      expect(entry?.hideFromPicker).toBe(true)
    }
  })

  it('every visible Files entry is a real addable kind', () => {
    const files = entriesByCategory().Files
    expect(files.length).toBeGreaterThan(0)
    for (const e of files) expect(WIDGET_CATALOG.some((c) => c.kind === e.kind)).toBe(true)
  })
})
