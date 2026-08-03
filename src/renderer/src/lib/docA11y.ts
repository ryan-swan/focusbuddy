// Accessibility checker for a PlexiDocs (Tiptap) document. Pure — it walks the
// document JSON and reports real, actionable issues (images with no alt text,
// heading levels that skip, bare-URL link text), so the result is honest: a clean
// document returns an empty list, never a fabricated score. Kept dependency-free
// so it is unit-tested directly and can be reused by other surfaces later.

export interface A11yIssue {
  severity: 'error' | 'warning'
  message: string
}

interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>
  content?: JsonNode[]
}

export function checkDocA11y(doc: unknown): A11yIssue[] {
  const issues: A11yIssue[] = []
  let imagesMissingAlt = 0
  let bareUrlLinks = 0
  let prevHeading = 0
  let firstHeadingSeen = false

  const walk = (n: JsonNode | undefined): void => {
    if (!n || typeof n !== 'object') return

    if (n.type === 'image') {
      const alt = typeof n.attrs?.alt === 'string' ? (n.attrs.alt as string).trim() : ''
      if (!alt) imagesMissingAlt++
    }

    if (n.type === 'heading') {
      const level = Number(n.attrs?.level) || 1
      if (!firstHeadingSeen) {
        firstHeadingSeen = true
        if (level !== 1) issues.push({ severity: 'warning', message: `The first heading is H${level}; a document should start with Heading 1.` })
      } else if (level > prevHeading + 1) {
        issues.push({ severity: 'warning', message: `Heading level skips from H${prevHeading} to H${level}; don't jump levels (screen readers rely on the outline).` })
      }
      prevHeading = level
    }

    if (n.type === 'text' && n.text && Array.isArray(n.marks)) {
      const link = n.marks.find((m) => m.type === 'link')
      if (link) {
        const href = typeof link.attrs?.href === 'string' ? (link.attrs.href as string) : ''
        const txt = n.text.trim()
        if (!txt || txt === href || /^https?:\/\//i.test(txt)) bareUrlLinks++
      }
    }

    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc as JsonNode)

  if (imagesMissingAlt > 0) {
    issues.unshift({
      severity: 'error',
      message: `${imagesMissingAlt} image${imagesMissingAlt === 1 ? '' : 's'} missing alt text — add a description so screen readers can convey it.`
    })
  }
  if (bareUrlLinks > 0) {
    issues.push({
      severity: 'warning',
      message: `${bareUrlLinks} link${bareUrlLinks === 1 ? '' : 's'} use a bare URL as their text — use words that describe the destination.`
    })
  }
  return issues
}
