// PlexiDesign: the on-platform design studio. A design is a single arbitrary-size
// canvas built from the same positioned elements as a slide (text, image, shape,
// line), so it reuses the proven slide element engine and renderer. This module
// is the pure core: the document body shape, the size presets across every design
// family, and the brand-aware starter templates that turn a blank canvas (and the
// org brand kit) into a finished, on-brand layout.

import type { SlideElement, SlideFill, SlideTextElement, SlideShapeElement } from './types'
import { type OrgBrandKit, DEFAULT_BRAND_KIT, readableTextOn, contrastRatio } from './brandKit'

export interface DesignBody {
  schemaVersion: 1
  // The canvas size in logical px. Any size is allowed; presets are a convenience.
  width: number
  height: number
  background?: SlideFill
  elements: SlideElement[]
  // The size/template family this design started from, for the picker UI.
  category?: DesignCategory
  // True once the brand kit has been applied, so the UI can show the state.
  brandApplied?: boolean
}

export type DesignCategory = 'social' | 'marketing' | 'presentation' | 'logo' | 'custom'

export interface DesignSize {
  id: string
  category: DesignCategory
  label: string
  w: number
  h: number
}

// Size presets across the four families the studio ships with. Logical px chosen
// to match each medium's real aspect ratio at a comfortable on-canvas resolution.
export const DESIGN_SIZES: DesignSize[] = [
  // Social
  { id: 'ig-post', category: 'social', label: 'Instagram post', w: 1080, h: 1080 },
  { id: 'ig-story', category: 'social', label: 'Instagram story / Reel', w: 1080, h: 1920 },
  { id: 'fb-post', category: 'social', label: 'Facebook post', w: 1200, h: 630 },
  { id: 'li-post', category: 'social', label: 'LinkedIn post', w: 1200, h: 627 },
  { id: 'x-post', category: 'social', label: 'X / Twitter post', w: 1600, h: 900 },
  { id: 'yt-thumb', category: 'social', label: 'YouTube thumbnail', w: 1280, h: 720 },
  // Marketing
  { id: 'poster-a4', category: 'marketing', label: 'Poster (A4)', w: 794, h: 1123 },
  { id: 'flyer-letter', category: 'marketing', label: 'Flyer (US Letter)', w: 816, h: 1056 },
  { id: 'business-card', category: 'marketing', label: 'Business card', w: 1050, h: 600 },
  { id: 'ad-rectangle', category: 'marketing', label: 'Ad (medium rectangle)', w: 300, h: 250 },
  { id: 'ad-leaderboard', category: 'marketing', label: 'Ad (leaderboard)', w: 728, h: 90 },
  // Presentation & docs
  { id: 'slide-169', category: 'presentation', label: 'Presentation (16:9)', w: 1280, h: 720 },
  { id: 'slide-43', category: 'presentation', label: 'Presentation (4:3)', w: 1024, h: 768 },
  { id: 'doc-cover', category: 'presentation', label: 'Document cover', w: 816, h: 1056 },
  // Logo & brand assets
  { id: 'logo', category: 'logo', label: 'Logo', w: 800, h: 800 },
  { id: 'avatar', category: 'logo', label: 'Social avatar', w: 512, h: 512 },
  { id: 'li-banner', category: 'logo', label: 'LinkedIn banner', w: 1584, h: 396 },
  { id: 'email-sig', category: 'logo', label: 'Email signature', w: 600, h: 200 }
]

export function findDesignSize(id: string): DesignSize | undefined {
  return DESIGN_SIZES.find((s) => s.id === id)
}

// Normalise a stored or partial body into a valid DesignBody. Bad sizes clamp to
// a sane default; missing elements become an empty canvas.
export function normalizeDesignBody(raw: unknown): DesignBody {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const width = clampDim(r.width, 1080)
  const height = clampDim(r.height, 1080)
  const elements = Array.isArray(r.elements) ? (r.elements as SlideElement[]) : []
  const background: SlideFill = isFill(r.background) ? (r.background as SlideFill) : { type: 'solid', color: '#ffffff' }
  return {
    schemaVersion: 1,
    width,
    height,
    background,
    elements,
    category: typeof r.category === 'string' ? (r.category as DesignCategory) : 'custom',
    brandApplied: r.brandApplied === true
  }
}

function clampDim(n: unknown, dflt: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : dflt
  return Math.max(16, Math.min(10000, v))
}
function isFill(v: unknown): boolean {
  return !!v && typeof v === 'object' && 'type' in (v as Record<string, unknown>)
}

// ── Brand-aware starter templates ────────────────────────────────────────────

export interface DesignTemplate {
  id: string
  category: DesignCategory
  label: string
  // The size this template is composed for; the editor can still resize after.
  sizeId: string
  build: (w: number, h: number, brand: OrgBrandKit) => { background: SlideFill; elements: SlideElement[] }
}

// Small element builders, brand-driven.
function text(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  content: string,
  opts: { size: number; color: string; bold?: boolean; align?: 'left' | 'center' | 'right'; font?: string; vAlign?: 'top' | 'middle' | 'bottom' }
): SlideTextElement {
  return {
    id,
    type: 'text',
    x,
    y,
    w,
    h,
    z,
    fontFamily: opts.font,
    vAlign: opts.vAlign ?? 'top',
    paragraphs: [{ runs: [{ text: content, bold: opts.bold, color: opts.color, fontSize: opts.size }], align: opts.align ?? 'left' }]
  }
}
function band(id: string, x: number, y: number, w: number, h: number, z: number, color: string): SlideShapeElement {
  return { id, type: 'shape', shape: 'rect', x, y, w, h, z, fill: { type: 'solid', color } }
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'social-quote',
    category: 'social',
    label: 'Quote post',
    sizeId: 'ig-post',
    build: (w, h, brand) => {
      const text2 = readableTextOn(brand.colorPrimary)
      return {
        background: { type: 'solid', color: brand.colorPrimary },
        elements: [
          band('accent', w * 0.08, h * 0.28, w * 0.12, 8, 1, brand.colorSecondary ?? text2),
          text('quote', w * 0.08, h * 0.32, w * 0.84, h * 0.36, 2, 'Your bold statement goes here.', {
            size: Math.round(w * 0.07),
            color: text2,
            bold: true,
            font: brand.fontHeading
          }),
          text('author', w * 0.08, h * 0.74, w * 0.84, h * 0.08, 3, 'Attribution or handle', {
            size: Math.round(w * 0.03),
            color: text2,
            font: brand.fontBody
          })
        ]
      }
    }
  },
  {
    id: 'social-announcement',
    category: 'social',
    label: 'Announcement',
    sizeId: 'ig-post',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        band('topband', 0, 0, w, h * 0.16, 1, brand.colorPrimary),
        text('eyebrow', w * 0.08, h * 0.05, w * 0.84, h * 0.06, 2, 'ANNOUNCING', {
          size: Math.round(w * 0.028),
          color: readableTextOn(brand.colorPrimary),
          bold: true,
          font: brand.fontHeading
        }),
        text('headline', w * 0.08, h * 0.3, w * 0.84, h * 0.3, 3, 'Something worth sharing', {
          size: Math.round(w * 0.075),
          color: brand.colorPrimary,
          bold: true,
          font: brand.fontHeading
        }),
        text('body', w * 0.08, h * 0.62, w * 0.84, h * 0.22, 4, 'A sentence or two of supporting detail that explains the news.', {
          size: Math.round(w * 0.034),
          color: '#44403c',
          font: brand.fontBody
        })
      ]
    })
  },
  {
    id: 'marketing-flyer',
    category: 'marketing',
    label: 'Event flyer',
    sizeId: 'flyer-letter',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        band('hero', 0, 0, w, h * 0.42, 1, brand.colorPrimary),
        text('title', w * 0.08, h * 0.12, w * 0.84, h * 0.2, 2, 'Event Title', {
          size: Math.round(w * 0.1),
          color: readableTextOn(brand.colorPrimary),
          bold: true,
          align: 'center',
          font: brand.fontHeading
        }),
        text('subtitle', w * 0.08, h * 0.3, w * 0.84, h * 0.08, 3, 'A short, punchy subtitle', {
          size: Math.round(w * 0.04),
          color: readableTextOn(brand.colorPrimary),
          align: 'center',
          font: brand.fontBody
        }),
        text('details', w * 0.1, h * 0.52, w * 0.8, h * 0.3, 4, 'Date and time\nVenue and address\nWhat to expect', {
          size: Math.round(w * 0.045),
          color: '#292524',
          font: brand.fontBody
        }),
        text('cta', w * 0.1, h * 0.86, w * 0.8, h * 0.08, 5, 'Register at yourbrand.com', {
          size: Math.round(w * 0.038),
          color: brand.colorPrimary,
          bold: true,
          align: 'center',
          font: brand.fontHeading
        })
      ]
    })
  },
  {
    id: 'presentation-cover',
    category: 'presentation',
    label: 'Title cover',
    sizeId: 'slide-169',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        band('sidebar', 0, 0, w * 0.04, h, 1, brand.colorPrimary),
        band('accent', w * 0.1, h * 0.4, w * 0.08, 10, 2, brand.colorPrimary),
        text('title', w * 0.1, h * 0.44, w * 0.8, h * 0.2, 3, 'Presentation title', {
          size: Math.round(h * 0.09),
          color: brand.colorPrimary,
          bold: true,
          font: brand.fontHeading
        }),
        text('subtitle', w * 0.1, h * 0.66, w * 0.8, h * 0.08, 4, 'Presenter name and date', {
          size: Math.round(h * 0.035),
          color: '#44403c',
          font: brand.fontBody
        })
      ]
    })
  },
  {
    id: 'logo-wordmark',
    category: 'logo',
    label: 'Wordmark',
    sizeId: 'logo',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        band('mark', w * 0.32, h * 0.3, w * 0.36, w * 0.36, 1, brand.colorPrimary),
        text('initial', w * 0.32, h * 0.3, w * 0.36, w * 0.36, 2, 'A', {
          size: Math.round(w * 0.22),
          color: readableTextOn(brand.colorPrimary),
          bold: true,
          align: 'center',
          vAlign: 'middle',
          font: brand.fontHeading
        }),
        text('name', w * 0.1, h * 0.72, w * 0.8, h * 0.1, 3, 'BRAND', {
          size: Math.round(w * 0.08),
          color: '#1c1917',
          bold: true,
          align: 'center',
          font: brand.fontHeading
        })
      ]
    })
  },
  {
    id: 'social-stat',
    category: 'social',
    label: 'Big stat',
    sizeId: 'ig-post',
    build: (w, h, brand) => {
      const onP = readableTextOn(brand.colorPrimary)
      return {
        background: { type: 'solid', color: brand.colorPrimary },
        elements: [
          text('stat', w * 0.08, h * 0.26, w * 0.84, h * 0.3, 2, '92%', { size: Math.round(w * 0.22), color: onP, bold: true, align: 'center', font: brand.fontHeading }),
          text('label', w * 0.1, h * 0.58, w * 0.8, h * 0.12, 3, 'of customers would recommend us', { size: Math.round(w * 0.04), color: onP, align: 'center', font: brand.fontBody })
        ]
      }
    }
  },
  {
    id: 'social-cover',
    category: 'social',
    label: 'Story cover',
    sizeId: 'ig-story',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#0f172a' },
      elements: [
        band('bar', w * 0.1, h * 0.34, w * 0.16, 10, 1, brand.colorPrimary),
        text('title', w * 0.1, h * 0.37, w * 0.8, h * 0.22, 2, 'Swipe up for the full story', { size: Math.round(w * 0.085), color: '#ffffff', bold: true, font: brand.fontHeading }),
        text('sub', w * 0.1, h * 0.6, w * 0.8, h * 0.1, 3, 'A short supporting line goes here.', { size: Math.round(w * 0.04), color: '#cbd5e1', font: brand.fontBody })
      ]
    })
  },
  {
    id: 'marketing-promo',
    category: 'marketing',
    label: 'Sale promo',
    sizeId: 'poster-a4',
    build: (w, h, brand) => {
      const onP = readableTextOn(brand.colorPrimary)
      return {
        background: { type: 'solid', color: brand.colorPrimary },
        elements: [
          text('kicker', w * 0.1, h * 0.16, w * 0.8, h * 0.06, 1, 'LIMITED TIME', { size: Math.round(w * 0.04), color: onP, bold: true, align: 'center', font: brand.fontHeading }),
          text('big', w * 0.06, h * 0.3, w * 0.88, h * 0.2, 2, '25% OFF', { size: Math.round(w * 0.2), color: onP, bold: true, align: 'center', font: brand.fontHeading }),
          text('detail', w * 0.1, h * 0.56, w * 0.8, h * 0.2, 3, 'Everything in store, this week only. Use code SAVE25 at checkout.', { size: Math.round(w * 0.05), color: onP, align: 'center', font: brand.fontBody })
        ]
      }
    }
  },
  {
    id: 'marketing-card',
    category: 'marketing',
    label: 'Business card',
    sizeId: 'business-card',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        band('side', 0, 0, w * 0.06, h, 1, brand.colorPrimary),
        text('name', w * 0.12, h * 0.22, w * 0.8, h * 0.18, 2, 'Your Name', { size: Math.round(h * 0.16), color: '#1c1917', bold: true, font: brand.fontHeading }),
        text('role', w * 0.12, h * 0.44, w * 0.8, h * 0.12, 3, 'Title, Company', { size: Math.round(h * 0.09), color: brand.colorPrimary, font: brand.fontBody }),
        text('contact', w * 0.12, h * 0.66, w * 0.8, h * 0.24, 4, 'you@company.com\n+1 555 0123\ncompany.com', { size: Math.round(h * 0.07), color: '#44403c', font: brand.fontBody })
      ]
    })
  },
  {
    id: 'presentation-section',
    category: 'presentation',
    label: 'Section divider',
    sizeId: 'slide-169',
    build: (w, h, brand) => {
      const onP = readableTextOn(brand.colorPrimary)
      return {
        background: { type: 'solid', color: brand.colorPrimary },
        elements: [
          text('num', w * 0.1, h * 0.3, w * 0.3, h * 0.2, 1, '01', { size: Math.round(h * 0.16), color: onP, bold: true, font: brand.fontHeading }),
          text('section', w * 0.1, h * 0.52, w * 0.8, h * 0.18, 2, 'Section title', { size: Math.round(h * 0.1), color: onP, bold: true, font: brand.fontHeading })
        ]
      }
    }
  },
  {
    id: 'presentation-quote',
    category: 'presentation',
    label: 'Pull quote',
    sizeId: 'slide-169',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        text('mark', w * 0.08, h * 0.14, w * 0.2, h * 0.2, 1, '“', { size: Math.round(h * 0.28), color: brand.colorPrimary, bold: true, font: brand.fontHeading }),
        text('quote', w * 0.1, h * 0.32, w * 0.8, h * 0.32, 2, 'A short, memorable quote that carries the slide.', { size: Math.round(h * 0.06), color: '#1c1917', font: brand.fontHeading }),
        text('attr', w * 0.1, h * 0.72, w * 0.8, h * 0.08, 3, 'Name, Title', { size: Math.round(h * 0.035), color: brand.colorPrimary, font: brand.fontBody })
      ]
    })
  },
  {
    id: 'logo-badge',
    category: 'logo',
    label: 'Badge mark',
    sizeId: 'logo',
    build: (w, h, brand) => ({
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        { id: 'ring', type: 'shape', shape: 'ellipse', x: w * 0.18, y: h * 0.18, w: w * 0.64, h: h * 0.64, z: 1, fill: { type: 'solid', color: brand.colorPrimary } },
        text('mono', w * 0.18, h * 0.18, w * 0.64, h * 0.64, 2, 'AB', { size: Math.round(w * 0.2), color: readableTextOn(brand.colorPrimary), bold: true, align: 'center', vAlign: 'middle', font: brand.fontHeading })
      ]
    })
  },
  {
    id: 'logo-banner',
    category: 'logo',
    label: 'LinkedIn banner',
    sizeId: 'li-banner',
    build: (w, h, brand) => {
      const onP = readableTextOn(brand.colorPrimary)
      return {
        background: { type: 'solid', color: brand.colorPrimary },
        elements: [
          text('tag', w * 0.05, h * 0.3, w * 0.6, h * 0.24, 1, 'We build better workdays', { size: Math.round(h * 0.16), color: onP, bold: true, font: brand.fontHeading }),
          text('url', w * 0.05, h * 0.6, w * 0.6, h * 0.12, 2, 'company.com', { size: Math.round(h * 0.08), color: onP, font: brand.fontBody })
        ]
      }
    }
  }
]

export function templatesForCategory(category: DesignCategory): DesignTemplate[] {
  return DESIGN_TEMPLATES.filter((t) => t.category === category)
}

// Build a fresh design body from a template + size, applying the brand kit (or the
// default kit when no brand is set).
export function designFromTemplate(template: DesignTemplate, size: DesignSize, brand: OrgBrandKit = DEFAULT_BRAND_KIT): DesignBody {
  const { background, elements } = template.build(size.w, size.h, brand)
  return {
    schemaVersion: 1,
    width: size.w,
    height: size.h,
    background,
    elements,
    category: size.category,
    brandApplied: brand !== DEFAULT_BRAND_KIT
  }
}

// ── AI design composition ────────────────────────────────────────────────────

// The content fields an AI fills in for a generated design. All optional so a
// sparse response still composes.
export interface DesignContent {
  eyebrow?: string
  headline?: string
  subhead?: string
  body?: string
  cta?: string
  // Background treatment the AI chose for the piece.
  background?: 'brand' | 'light' | 'dark'
}

// Compose a finished, on-brand layout from AI copy at a given size. This is the
// "10 seconds" path: structured copy in, a clean branded design out. Colors are
// chosen for readable contrast against the background treatment; the brand fonts
// and primary color carry the identity.
export function composeDesign(size: DesignSize, brand: OrgBrandKit, content: DesignContent): DesignBody {
  const { w, h } = size
  const mode = content.background ?? 'light'
  const bgColor = mode === 'brand' ? brand.colorPrimary : mode === 'dark' ? '#0f172a' : '#ffffff'
  const onBg = readableTextOn(bgColor)
  // On a brand-colored background, the accent must read against the brand color:
  // prefer the secondary when it contrasts, else fall back to the readable tone.
  const accent =
    mode === 'brand'
      ? brand.colorSecondary && contrastRatio(brand.colorSecondary, bgColor) >= 2
        ? brand.colorSecondary
        : onBg
      : brand.colorPrimary
  const bodyColor = mode === 'light' ? '#44403c' : onBg

  const mx = Math.round(w * 0.08)
  const cw = w - mx * 2
  let y = Math.round(h * 0.16)
  const els: SlideElement[] = []
  let z = 1

  // A short accent band sets the composition off and carries the brand color even
  // on a brand-colored background (where it uses a readable contrast tone).
  els.push(band('accent', mx, y, Math.round(w * 0.1), Math.max(6, Math.round(h * 0.01)), z++, accent))
  y += Math.round(h * 0.03)

  if (content.eyebrow) {
    els.push(
      text('eyebrow', mx, y, cw, Math.round(h * 0.05), z++, content.eyebrow.toUpperCase(), {
        size: Math.round(w * 0.026),
        color: accent,
        bold: true,
        font: brand.fontHeading
      })
    )
    y += Math.round(h * 0.06)
  }
  if (content.headline) {
    const lines = Math.max(1, Math.ceil(content.headline.length / 22))
    const hh = Math.round(h * 0.12 * lines)
    els.push(
      text('headline', mx, y, cw, hh, z++, content.headline, {
        size: Math.round(w * 0.07),
        color: onBg,
        bold: true,
        font: brand.fontHeading
      })
    )
    y += hh + Math.round(h * 0.02)
  }
  if (content.subhead) {
    els.push(
      text('subhead', mx, y, cw, Math.round(h * 0.1), z++, content.subhead, {
        size: Math.round(w * 0.038),
        color: bodyColor,
        font: brand.fontBody
      })
    )
    y += Math.round(h * 0.11)
  }
  if (content.body) {
    els.push(
      text('body', mx, y, cw, Math.round(h * 0.24), z++, content.body, {
        size: Math.round(w * 0.03),
        color: bodyColor,
        font: brand.fontBody
      })
    )
  }
  if (content.cta) {
    const ch = Math.round(h * 0.08)
    const cy = h - Math.round(h * 0.12)
    els.push(band('ctabg', mx, cy, Math.round(w * 0.42), ch, z++, accent === onBg ? brand.colorPrimary : accent))
    els.push(
      text('cta', mx, cy, Math.round(w * 0.42), ch, z++, content.cta, {
        size: Math.round(w * 0.032),
        color: readableTextOn(accent === onBg ? brand.colorPrimary : accent),
        bold: true,
        align: 'center',
        vAlign: 'middle',
        font: brand.fontHeading
      })
    )
  }

  return {
    schemaVersion: 1,
    width: w,
    height: h,
    background: { type: 'solid', color: bgColor },
    elements: els,
    category: size.category,
    brandApplied: true
  }
}

// ── Static HTML render (for export) ──────────────────────────────────────────

const SHADOW: Record<string, string> = {
  sm: '0 1px 3px rgba(0,0,0,0.18)',
  md: '0 6px 16px rgba(0,0,0,0.22)',
  lg: '0 14px 38px rgba(0,0,0,0.28)'
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function styleStr(props: Record<string, string | number | undefined>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
    .join(';')
}

// Render one element to absolutely-positioned HTML, mirroring SlideElementView so
// the export matches the on-canvas appearance pixel for pixel.
function elementHtml(el: SlideElement): string {
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;overflow:hidden;${
    el.rotation ? `transform:rotate(${el.rotation}deg);` : ''
  }${el.opacity != null ? `opacity:${el.opacity};` : ''}${el.cornerRadius ? `border-radius:${el.cornerRadius}px;` : ''}${
    el.shadow ? `box-shadow:${SHADOW[el.shadow]};` : ''
  }`
  const border = (b?: { width: number; style?: string; color: string }): string =>
    b ? `border:${b.width}px ${b.style ?? 'solid'} ${b.color};` : ''

  if (el.type === 'text') {
    const justify = el.vAlign === 'middle' ? 'center' : el.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
    const paras = el.paragraphs
      .map((p) => {
        const align = p.align ?? 'left'
        const jc = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
        const runs = p.runs
          .map(
            (r) =>
              `<span style="${styleStr({
                fontWeight: r.bold ? 700 : undefined,
                fontStyle: r.italic ? 'italic' : undefined,
                textDecoration: r.underline ? 'underline' : undefined,
                color: r.color,
                fontSize: r.fontSize ? `${r.fontSize}px` : undefined
              })}">${escHtml(r.text || '​')}</span>`
          )
          .join('')
        return `<div style="text-align:${align};display:flex;gap:8px;justify-content:${jc}"><span>${runs}</span></div>`
      })
      .join('')
    const fill = el.fill?.type === 'solid' ? `background-color:${el.fill.color};` : ''
    return `<div style="${base}${fill}${border(el.border)}"><div style="display:flex;flex-direction:column;justify-content:${justify};height:100%;${
      el.fontFamily ? `font-family:${el.fontFamily};` : ''
    }">${paras}</div></div>`
  }
  if (el.type === 'image') {
    return `<div style="${base}${border(el.border)}"><img src="${el.src}" style="width:100%;height:100%;object-fit:${el.fit ?? 'contain'}"/></div>`
  }
  if (el.type === 'shape') {
    if (el.shape === 'triangle') {
      return `<div style="${base}${el.shadow ? `filter:drop-shadow(${SHADOW[el.shadow]});` : ''}"><div style="width:100%;height:100%;clip-path:polygon(50% 0%,0% 100%,100% 100%);background-color:${
        el.fill?.type === 'solid' ? el.fill.color : 'transparent'
      }"></div></div>`
    }
    const radius = el.shape === 'ellipse' ? '50%' : el.cornerRadius ?? (el.shape === 'roundRect' ? '16px' : '0')
    return `<div style="${base}background-color:${el.fill?.type === 'solid' ? el.fill.color : 'transparent'};border-radius:${
      typeof radius === 'number' ? radius + 'px' : radius
    };${border(el.border)}"></div>`
  }
  // line
  return `<div style="${base}"><svg width="100%" height="100%" viewBox="0 0 ${el.w} ${el.h}" preserveAspectRatio="none">${
    el.arrowEnd
      ? `<defs><marker id="arrow-${el.id}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${el.stroke}"/></marker></defs>`
      : ''
  }<line x1="0" y1="0" x2="${el.w}" y2="${el.h}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" ${
    el.arrowEnd ? `marker-end="url(#arrow-${el.id})"` : ''
  }/></svg></div>`
}

// A full standalone HTML document rendering the design at its exact pixel size,
// for the export pipeline (offscreen capture to PNG / print to PDF).
export function designToHtml(design: DesignBody): string {
  const bg = design.background?.type === 'solid' ? design.background.color : '#ffffff'
  const els = design.elements
    .slice()
    .sort((a, b) => a.z - b.z)
    .map(elementHtml)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${design.width}px;height:${design.height}px}</style></head><body><div style="position:relative;width:${design.width}px;height:${design.height}px;background:${bg};overflow:hidden">${els}</div></body></html>`
}

// A blank design at a given size.
export function blankDesign(size: DesignSize): DesignBody {
  return {
    schemaVersion: 1,
    width: size.w,
    height: size.h,
    background: { type: 'solid', color: '#ffffff' },
    elements: [],
    category: size.category
  }
}
