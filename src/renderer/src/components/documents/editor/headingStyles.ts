// Named heading styles for the document editor.
//
// Word-style behaviour: a document defines what each heading level looks like
// once, and every heading of that level follows. We store the per-level style on
// the document body (wrapped alongside the Tiptap JSON) and render it by
// injecting CSS scoped to the editor, so changing "Heading 1" updates every H1
// in the document at once without touching individual nodes.

export interface HeadingStyle {
  fontSize?: number // px
  color?: string // hex
  bold?: boolean
  italic?: boolean
}

// Keyed by heading level 1..6.
export type HeadingStyles = Record<number, HeadingStyle>

export type PaperSize = 'letter' | 'a4'
export type PageOrientation = 'portrait' | 'landscape'

// Per-side margins in inches. Inches are the unit users think in for page setup
// and what Word/Pages expose, so we store them directly and convert to px (×96)
// for the screen and to twips (×1440) for .docx.
export interface PageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

// A document's page setup. Persisted on the body so it travels with the document
// (rather than a global app preference) and so every reader sees the same pages.
export interface PageSetup {
  size: PaperSize
  orientation: PageOrientation
  margin: PageMargins
}

export const DEFAULT_MARGINS: PageMargins = { top: 1, right: 1, bottom: 1, left: 1 }
export const DEFAULT_PAGE_SETUP: PageSetup = { size: 'letter', orientation: 'portrait', margin: { ...DEFAULT_MARGINS } }

// Named margin presets, the same set Word offers, plus the current custom value.
export const MARGIN_PRESETS: { id: string; label: string; margin: PageMargins }[] = [
  { id: 'normal', label: 'Normal (1")', margin: { top: 1, right: 1, bottom: 1, left: 1 } },
  { id: 'narrow', label: 'Narrow (0.5")', margin: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } },
  { id: 'moderate', label: 'Moderate (1" / 0.75")', margin: { top: 1, right: 0.75, bottom: 1, left: 0.75 } },
  { id: 'wide', label: 'Wide (1" / 2")', margin: { top: 1, right: 2, bottom: 1, left: 2 } }
]

function clampMargin(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 1
  // Keep margins sane: never negative, never so large the page has no body.
  return Math.max(0, Math.min(4, v))
}

function parsePageSetup(raw: unknown): PageSetup {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PAGE_SETUP, margin: { ...DEFAULT_MARGINS } }
  const r = raw as Record<string, unknown>
  const m = (r.margin ?? {}) as Record<string, unknown>
  return {
    size: r.size === 'a4' ? 'a4' : 'letter',
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: {
      top: clampMargin(m.top),
      right: clampMargin(m.right),
      bottom: clampMargin(m.bottom),
      left: clampMargin(m.left)
    }
  }
}

export interface WrappedDocBody {
  doc: unknown // Tiptap JSON
  headingStyles: HeadingStyles
  page?: PageSetup
}

function emptyDoc(): unknown {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

// A doc body is either the legacy raw Tiptap JSON ({type:'doc',...}) or the v2+
// wrapper { doc, headingStyles, page }. Normalise all of them.
export function parseDocBody(content: unknown): { doc: unknown; headingStyles: HeadingStyles; page: PageSetup } {
  if (
    content &&
    typeof content === 'object' &&
    'doc' in (content as Record<string, unknown>) &&
    'headingStyles' in (content as Record<string, unknown>)
  ) {
    const c = content as WrappedDocBody
    return { doc: c.doc ?? emptyDoc(), headingStyles: c.headingStyles ?? {}, page: parsePageSetup(c.page) }
  }
  return { doc: content ?? emptyDoc(), headingStyles: {}, page: { ...DEFAULT_PAGE_SETUP, margin: { ...DEFAULT_MARGINS } } }
}

// Build the wrapped body to persist. Page setup is omitted when it is the plain
// default so legacy documents are not rewritten with redundant fields.
export function wrapDocBody(doc: unknown, headingStyles: HeadingStyles, page?: PageSetup): WrappedDocBody {
  return page ? { doc, headingStyles, page } : { doc, headingStyles }
}

// CSS for the configured heading levels, scoped under `scopeClass` so it only
// affects this editor instance. Targets the rendered <h1>..<h6> elements.
export function headingCss(scopeClass: string, styles: HeadingStyles): string {
  let css = ''
  for (let lvl = 1; lvl <= 6; lvl++) {
    const s = styles[lvl]
    if (!s) continue
    const decls: string[] = []
    if (s.fontSize) decls.push(`font-size:${s.fontSize}px !important`)
    if (s.color) decls.push(`color:${s.color} !important`)
    if (s.bold !== undefined) decls.push(`font-weight:${s.bold ? 700 : 400} !important`)
    if (s.italic !== undefined) decls.push(`font-style:${s.italic ? 'italic' : 'normal'} !important`)
    if (!decls.length) continue
    // Target the heading AND its inline descendants (spans), so the named style
    // is authoritative even when individual heading text carries inline marks
    // from the size / colour controls — otherwise those headings would not
    // follow the level's style.
    css += `.${scopeClass} h${lvl}, .${scopeClass} h${lvl} *{${decls.join(';')}}\n`
  }
  return css
}
