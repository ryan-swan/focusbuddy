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

export interface WrappedDocBody {
  doc: unknown // Tiptap JSON
  headingStyles: HeadingStyles
}

function emptyDoc(): unknown {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

// A doc body is either the legacy raw Tiptap JSON ({type:'doc',...}) or the v2
// wrapper { doc, headingStyles }. Normalise both to { doc, headingStyles }.
export function parseDocBody(content: unknown): { doc: unknown; headingStyles: HeadingStyles } {
  if (
    content &&
    typeof content === 'object' &&
    'doc' in (content as Record<string, unknown>) &&
    'headingStyles' in (content as Record<string, unknown>)
  ) {
    const c = content as WrappedDocBody
    return { doc: c.doc ?? emptyDoc(), headingStyles: c.headingStyles ?? {} }
  }
  return { doc: content ?? emptyDoc(), headingStyles: {} }
}

// Build the wrapped body to persist.
export function wrapDocBody(doc: unknown, headingStyles: HeadingStyles): WrappedDocBody {
  return { doc, headingStyles }
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
