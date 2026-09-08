// Pagination configuration must be PER EDITOR.
//
// It used to live in a module-level `cfg` plus a single `repaginate`, shared by
// every editor alive in the window. One editor made that accidentally correct.
// Two did not: a document open on a desk alongside another doc surface
// paginated against the OTHER editor's page geometry, or against the
// `enabled: false` a sibling left behind on unmount. Sheets are drawn from the
// page count this config reports, so the count stopped growing while content
// kept flowing, and text ran past the last sheet onto the canvas — which is
// exactly why it looked fine in the expanded view and broke on a desk.
import { describe, it, expect } from 'vitest'
import {
  setPaginationConfig,
  _paginationConfigFor
} from '../../src/renderer/src/components/documents/editor/pagination'

// Stand-ins for two editor instances; the store is keyed by identity.
const deskEditor = {}
const expandedEditor = {}

describe('pagination config is scoped to its editor', () => {
  it('keeps two editors\' page geometry apart', () => {
    const desk = {}
    const expanded = {}
    setPaginationConfig(desk, { enabled: true, pageContentPx: 500, gapPx: 28, mTop: 96, mBottom: 96 })
    setPaginationConfig(expanded, { enabled: true, pageContentPx: 864, gapPx: 28, mTop: 96, mBottom: 96 })
    // With one shared module cfg the second call overwrote the first, and the
    // desk document then paginated against 864px of page it did not have.
    expect(_paginationConfigFor(desk).pageContentPx).toBe(500)
    expect(_paginationConfigFor(expanded).pageContentPx).toBe(864)
  })

  it('one editor unmounting does not disable the other', () => {
    const a = {}
    const b = {}
    setPaginationConfig(a, { enabled: true, pageContentPx: 864 })
    setPaginationConfig(b, { enabled: true, pageContentPx: 864 })
    // b unmounts — the cleanup DocEditor runs on leaving page view.
    setPaginationConfig(b, { enabled: false, onPages: null })
    // Shared state switched a off too: its sheets stopped being counted and its
    // content spilled onto the canvas.
    expect(_paginationConfigFor(a).enabled).toBe(true)
    expect(_paginationConfigFor(b).enabled).toBe(false)
  })

  it('each editor keeps its own page-count callback', () => {
    const a = {}
    const b = {}
    const seen: string[] = []
    setPaginationConfig(a, { enabled: true, onPages: () => seen.push('a') })
    setPaginationConfig(b, { enabled: true, onPages: () => seen.push('b') })
    _paginationConfigFor(a).onPages?.(3)
    _paginationConfigFor(b).onPages?.(7)
    // Shared state meant the last editor to mount owned the callback, so the
    // other one's sheet count never updated again.
    expect(seen).toEqual(['a', 'b'])
  })
})
