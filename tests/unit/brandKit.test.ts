import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  readableTextOn,
  brandContrastWarnings,
  brandHeadingStyles,
  brandDeckTheme,
  brandSheetHeader,
  DEFAULT_BRAND_KIT,
  type OrgBrandKit
} from '../../src/shared/brandKit'

describe('brand kit contrast', () => {
  it('computes the canonical extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
  it('parses 3-digit and 6-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0)
  })
  it('picks readable text for a fill', () => {
    expect(readableTextOn('#1d4ed8')).toBe('#ffffff') // dark blue -> white text
    expect(readableTextOn('#fde047')).toBe('#1c1917') // bright yellow -> dark text
  })
  it('warns on a low-contrast brand but not a clean one', () => {
    const clean: OrgBrandKit = { ...DEFAULT_BRAND_KIT, colorPrimary: '#1d4ed8' }
    expect(brandContrastWarnings(clean)).toEqual([])
    const pale: OrgBrandKit = { ...DEFAULT_BRAND_KIT, colorPrimary: '#fef08a' }
    expect(brandContrastWarnings(pale).length).toBeGreaterThan(0)
  })
})

describe('brand kit derivations', () => {
  const kit: OrgBrandKit = {
    colorPrimary: '#7c3aed',
    colorSecondary: '#0d9488',
    fontHeading: 'Georgia, serif',
    fontBody: 'Inter, sans-serif'
  }

  it('derives heading styles with the brand color on H1', () => {
    const hs = brandHeadingStyles(kit)
    expect(hs[1].color).toBe('#7c3aed')
    expect(hs[1].bold).toBe(true)
    expect(hs[2].color).toBe('#0d9488')
  })

  it('honours explicit heading styles when provided', () => {
    const hs = brandHeadingStyles({ ...kit, headingStyles: { 1: { fontSize: 40, bold: false, color: '#111111' } } })
    expect(hs[1]).toEqual({ fontSize: 40, bold: false, color: '#111111' })
  })

  it('builds a DeckTheme that uses the brand color + fonts', () => {
    const theme = brandDeckTheme(kit, 'Acme')
    expect(theme.id).toBe('org-brand')
    expect(theme.name).toBe('Acme brand')
    expect(theme.accent).toBe('#7c3aed')
    expect(theme.fontHeading).toBe('Georgia, serif')
    expect(theme.titleStyle.color).toBe('#7c3aed')
  })

  it('builds a readable sheet header format from the brand fill', () => {
    const fmt = brandSheetHeader(kit)
    expect(fmt.bold).toBe(true)
    expect(fmt.bg).toBe('#7c3aed')
    expect(fmt.color).toBe('#ffffff') // readable on dark violet
    expect(fmt.fontFamily).toBe('Georgia, serif')
  })
})
