// Headless conversion between HTML and the document editor's Tiptap JSON.
//
// AI replies arrive as constrained HTML and imported .docx is converted to HTML
// by mammoth; both must become editor JSON. Export goes the other way. Crucially
// these conversions use the SAME extension list as the live editor
// (buildDocExtensions), so a round trip can never produce a node the editor
// cannot represent. All inbound HTML passes through the sanitizer first.

import { generateJSON, generateHTML } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'
import { buildDocExtensions } from '../components/documents/editor/extensions'
import { sanitizeHtml } from './htmlSanitize'

// Build the schema once; it is pure and stateless for conversion purposes.
// 'interactive: false' drops the placeholder/slash plugins (irrelevant to schema)
// while keeping every node and mark the editor uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schemaExtensions = buildDocExtensions({ interactive: false }) as any[]

// Convert (untrusted) HTML into editor JSON. Sanitizes first, then parses
// against the shared schema. Never throws: on failure it falls back to a single
// paragraph carrying the stripped text so content is not lost.
export function htmlToDoc(html: string): JSONContent {
  const clean = sanitizeHtml(html)
  try {
    return generateJSON(clean || '<p></p>', schemaExtensions) as JSONContent
  } catch {
    const text = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] }
  }
}

// The array of top-level nodes from an HTML fragment, suitable for
// editor.insertContent(...) at the cursor. Returns [] when there is nothing.
export function htmlToDocContent(html: string): JSONContent[] {
  const doc = htmlToDoc(html)
  return Array.isArray(doc.content) ? doc.content : []
}

// Convert editor JSON back to HTML (for .docx/PDF export and AI rewrite context).
export function docToHtml(json: JSONContent): string {
  try {
    return generateHTML(json, schemaExtensions)
  } catch {
    return ''
  }
}
