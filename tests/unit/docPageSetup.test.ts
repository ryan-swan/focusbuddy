import { describe, it, expect } from 'vitest'
import {
  parseDocBody,
  wrapDocBody,
  DEFAULT_PAGE_SETUP,
  MARGIN_PRESETS,
  type PageSetup
} from '../../src/renderer/src/components/documents/editor/headingStyles'

// Page setup travels on the document body. These cover that a legacy body still
// opens with sane defaults, that an explicit setup round-trips, and that bad
// values are clamped rather than trusted.

describe('doc page setup', () => {
  it('legacy raw-Tiptap body gets the default page setup', () => {
    const legacy = { type: 'doc', content: [{ type: 'paragraph' }] }
    const parsed = parseDocBody(legacy)
    expect(parsed.page).toEqual(DEFAULT_PAGE_SETUP)
    expect(parsed.doc).toEqual(legacy)
    expect(parsed.headingStyles).toEqual({})
  })

  it('round-trips an explicit page setup through wrap + parse', () => {
    const page: PageSetup = { size: 'a4', orientation: 'landscape', margin: { top: 0.5, right: 0.75, bottom: 0.5, left: 0.75 } }
    const body = wrapDocBody({ type: 'doc' }, { 1: { fontSize: 32 } }, page)
    const parsed = parseDocBody(body)
    expect(parsed.page).toEqual(page)
    expect(parsed.headingStyles).toEqual({ 1: { fontSize: 32 } })
  })

  it('omits page when none is supplied so legacy docs are not rewritten', () => {
    const body = wrapDocBody({ type: 'doc' }, {})
    expect('page' in body).toBe(false)
  })

  it('clamps out-of-range and non-numeric margins', () => {
    const body = { doc: { type: 'doc' }, headingStyles: {}, page: { size: 'a4', orientation: 'portrait', margin: { top: -3, right: 99, bottom: 'x', left: 1 } } }
    const parsed = parseDocBody(body)
    expect(parsed.page.margin.top).toBe(0) // clamped up from -3
    expect(parsed.page.margin.right).toBe(4) // clamped down from 99
    expect(parsed.page.margin.bottom).toBe(1) // non-numeric -> default 1
    expect(parsed.page.margin.left).toBe(1)
  })

  it('defaults an unknown paper size to letter and bad orientation to portrait', () => {
    const body = { doc: { type: 'doc' }, headingStyles: {}, page: { size: 'tabloid', orientation: 'sideways', margin: {} } }
    const parsed = parseDocBody(body)
    expect(parsed.page.size).toBe('letter')
    expect(parsed.page.orientation).toBe('portrait')
  })

  it('ships the Word-style margin presets', () => {
    const ids = MARGIN_PRESETS.map((p) => p.id)
    expect(ids).toContain('normal')
    expect(ids).toContain('narrow')
    expect(MARGIN_PRESETS.find((p) => p.id === 'normal')!.margin).toEqual({ top: 1, right: 1, bottom: 1, left: 1 })
  })
})
