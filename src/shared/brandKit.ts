// The organization Brand Kit: one company brand (logo, colors, fonts) defined
// once and applied to standardize Docs, Sheets, Slides and Projects. This module
// is the pure brand engine. It holds the data shape, the contrast guardrails, and
// the per-surface derivations (a Slides DeckTheme, document heading styles, a
// sheet header format) so every surface reads the brand the same way.
//
// Design rule from the design-system owner: the brand is a DOCUMENT-CONTENT
// register. It never writes the app's --accent chrome token. Brand colors style
// content (headings, slide titles, sheet headers, project bands); the user's
// theme still owns the chrome. The six status tones stay frozen and are never
// overridden by a brand color.

import type { DeckTheme, SheetCellFormat } from './types'

export interface BrandHeadingStyle {
  fontSize: number
  color?: string
  bold: boolean
}

export interface OrgBrandKit {
  // Identity. A logo URL (uploaded asset or data URI); the dark variant is used on
  // dark surfaces when present.
  logoUrl?: string
  logoDarkUrl?: string

  // Color roles, all hex. primary is the brand color; the rest are optional.
  colorPrimary: string
  colorSecondary?: string
  colorNeutral?: string

  // Font roles, CSS font-family values (the same format the font picker emits).
  fontHeading: string
  fontBody: string

  // Optional explicit document heading styles (levels 1..3). When absent they are
  // derived from the brand color and a sensible size ramp.
  headingStyles?: Record<number, BrandHeadingStyle>

  // Sheet header defaults. When absent they derive from primary + a readable text.
  sheetHeaderBg?: string
  sheetHeaderColor?: string

  // Slide defaults.
  slideBackground?: string
  slideTextColor?: string
}

export const DEFAULT_BRAND_KIT: OrgBrandKit = {
  colorPrimary: '#2563eb',
  fontHeading: 'Inter, system-ui, sans-serif',
  fontBody: 'Inter, system-ui, sans-serif'
}

// ── Contrast guardrails (WCAG relative luminance) ────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) {
    const short = /^#?([0-9a-f]{3})$/i.exec(hex.trim())
    if (!short) return null
    const s = short[1]
    return { r: parseInt(s[0] + s[0], 16), g: parseInt(s[1] + s[1], 16), b: parseInt(s[2] + s[2], 16) }
  }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

// WCAG contrast ratio between two colors, 1 (none) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// Pick readable text (near-black or near-white) for a given background, so a brand
// color used as a fill never carries unreadable text.
export function readableTextOn(bgHex: string): string {
  return contrastRatio(bgHex, '#1c1917') >= contrastRatio(bgHex, '#ffffff') ? '#1c1917' : '#ffffff'
}

// Warnings for the brand editor: pairings the brand would produce that fall below
// WCAG AA. Returned as human sentences; an empty array means the brand is clean.
export function brandContrastWarnings(kit: OrgBrandKit): string[] {
  const out: string[] = []
  // Heading color on a white document page (normal-to-large text -> 3:1).
  if (contrastRatio(kit.colorPrimary, '#ffffff') < 3) {
    out.push('The brand color may be hard to read as a heading on a white page.')
  }
  // Sheet header text on the header fill (small text -> 4.5:1).
  const bg = kit.sheetHeaderBg ?? kit.colorPrimary
  const fg = kit.sheetHeaderColor ?? readableTextOn(bg)
  if (contrastRatio(bg, fg) < 4.5) {
    out.push('The sheet header text may be hard to read on the header fill.')
  }
  // Slide body text on the slide background.
  const sbg = kit.slideBackground ?? '#ffffff'
  const stext = kit.slideTextColor ?? '#1c1917'
  if (contrastRatio(sbg, stext) < 4.5) {
    out.push('Slide text may be hard to read on the chosen slide background.')
  }
  return out
}

// ── Per-surface derivations ──────────────────────────────────────────────────

// Document heading styles (levels 1..3). Uses explicit kit.headingStyles when
// present, otherwise a size ramp with the brand color on the top level.
export function brandHeadingStyles(kit: OrgBrandKit): Record<number, BrandHeadingStyle> {
  if (kit.headingStyles && Object.keys(kit.headingStyles).length) return kit.headingStyles
  return {
    1: { fontSize: 30, bold: true, color: kit.colorPrimary },
    2: { fontSize: 22, bold: true, color: kit.colorSecondary ?? kit.colorPrimary },
    3: { fontSize: 18, bold: true, color: kit.colorNeutral ?? '#44403c' }
  }
}

// A Slides DeckTheme generated from the brand. Slots into resolveTheme() as a
// named theme the same way the builtins do.
export function brandDeckTheme(kit: OrgBrandKit, orgName: string): DeckTheme {
  const background = kit.slideBackground ?? '#ffffff'
  const textColor = kit.slideTextColor ?? readableTextOn(background)
  return {
    id: 'org-brand',
    name: orgName ? `${orgName} brand` : 'Brand',
    background,
    fontHeading: kit.fontHeading,
    fontBody: kit.fontBody,
    accent: kit.colorPrimary,
    textColor,
    titleStyle: { fontSize: 54, bold: true, color: kit.colorPrimary },
    bodyStyle: { fontSize: 26, color: textColor }
  }
}

// A sheet header-row cell format from the brand: brand fill, readable text, bold,
// brand heading font.
export function brandSheetHeader(kit: OrgBrandKit): SheetCellFormat {
  const bg = kit.sheetHeaderBg ?? kit.colorPrimary
  return {
    bold: true,
    bg,
    color: kit.sheetHeaderColor ?? readableTextOn(bg),
    fontFamily: kit.fontHeading
  }
}
