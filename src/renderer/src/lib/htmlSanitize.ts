// HTML sanitizer for the document editor.
//
// AI replies and imported .docx both arrive as HTML that we convert into the
// editor's Tiptap JSON. That HTML must be constrained to the small tag, class
// and style vocabulary the editor understands before it goes anywhere near the
// schema, otherwise a stray <script>, an onclick handler, or a font-size in an
// exotic unit either does nothing or, worse, executes. This module reduces any
// HTML fragment to an allowlisted subset: known tags, a tiny set of attributes,
// and inline styles limited to colour, background, font and alignment. Anything
// outside the list is dropped while its text content is preserved, so meaning
// survives even when formatting does not.

// Block + inline tags the Tiptap doc schema can represent. Tags outside this
// set are unwrapped (their children are kept, the tag itself is discarded).
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'sub', 'sup', 'a', 'mark', 'span', 'img'
])

// Tags that carry no meaning we keep and whose CONTENTS should be discarded too
// (not just unwrapped). Script/style payloads must never survive.
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed'])

// Per-tag attribute allowlist. Everything else (id, class, on* handlers, data-*)
// is stripped.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  '*': new Set(['style'])
}

// Inline CSS properties we keep. The editor maps these onto marks/attrs; any
// other declaration (position, display, content, etc.) is dropped.
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'background',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration'
])

// A safe href scheme guard: block javascript:, data: (except images handled on
// img), vbscript:, etc. Allow http(s), mailto, tel, and relative/anchor links.
function isSafeHref(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:')) return false
  return true
}

// img src may be an http(s) URL or a base64 data URI (how pasted/exported
// images travel). Block javascript:/vbscript: and non-image data URIs.
function isSafeImageSrc(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return false
  if (v.startsWith('data:')) return v.startsWith('data:image/')
  return true
}

// Keep only the allowlisted declarations from an inline style string.
export function sanitizeStyle(style: string): string {
  const kept: string[] = []
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const value = decl.slice(idx + 1).trim()
    if (!prop || !value) continue
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue
    // Defensive: reject url()/expression() payloads inside otherwise-allowed
    // properties (e.g. background: url(javascript:...)).
    const lv = value.toLowerCase()
    if (lv.includes('url(') || lv.includes('expression(') || lv.includes('javascript:')) continue
    kept.push(`${prop}: ${value}`)
  }
  return kept.join('; ')
}

function sanitizeElement(el: Element, doc: Document): void {
  const tag = el.tagName.toLowerCase()

  // Drop dangerous nodes entirely, content and all, before recursing.
  if (DROP_WITH_CONTENT.has(tag)) {
    el.remove()
    return
  }

  // Sanitize the subtree first (depth-first). This must happen before we unwrap
  // an unknown tag, otherwise its promoted children would skip sanitization.
  for (const child of Array.from(el.children)) {
    sanitizeElement(child, doc)
  }

  // Unwrap unknown tags: replace the element with its now-sanitized children so
  // the text is kept while the tag itself is discarded.
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
    }
    return
  }

  // Strip every attribute not on the allowlist for this tag.
  const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>()
  const star = ALLOWED_ATTRS['*']
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const ok = allowed.has(name) || star.has(name)
    if (!ok) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === 'href' && !isSafeHref(attr.value)) {
      el.removeAttribute(attr.name)
    } else if (name === 'src' && tag === 'img' && !isSafeImageSrc(attr.value)) {
      el.removeAttribute(attr.name)
    } else if (name === 'style') {
      const clean = sanitizeStyle(attr.value)
      if (clean) el.setAttribute('style', clean)
      else el.removeAttribute('style')
    }
  }
}

// Reduce an arbitrary HTML fragment to the editor's safe subset. Returns a
// string of sanitized HTML. Never throws: malformed input yields whatever
// parsed, minus anything disallowed.
export function sanitizeHtml(html: string): string {
  if (!html || !html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const child of Array.from(doc.body.children)) {
    sanitizeElement(child, doc)
  }
  return doc.body.innerHTML
}
