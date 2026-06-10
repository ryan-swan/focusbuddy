// Pure string transforms for the sticky note's markdown-lite body. A sticky
// stores plain text in widget.content; these classify and rewrite lines so
// checkboxes and bullets persist naturally in that same string with nothing new
// in the schema. Kept pure and separate from the component so the tick-and-
// reload behaviour is unit-testable.

export const STICKY_CHECK_RE = /^\[( |x|X)\]\s?(.*)$/
export const STICKY_BULLET_RE = /^[-*]\s+(.*)$/

export function hasChecklist(text: string): boolean {
  return text.split('\n').some((l) => STICKY_CHECK_RE.test(l.trim()))
}

// Flip one checklist line between done and not, addressed by line index. Lines
// that are not checklist lines are returned unchanged. Indentation is kept.
export function toggleCheckLine(text: string, lineIndex: number): string {
  return text
    .split('\n')
    .map((line, i) => {
      if (i !== lineIndex) return line
      const m = STICKY_CHECK_RE.exec(line.trim())
      if (!m) return line
      const done = m[1].toLowerCase() === 'x'
      const indent = line.slice(0, line.length - line.trimStart().length)
      return `${indent}[${done ? ' ' : 'x'}] ${m[2]}`
    })
    .join('\n')
}

// Turn the whole body into a checklist (prefix each non-empty line with an
// empty checkbox, replacing any leading bullet), or strip the checkboxes if it
// already is one.
export function toggleChecklist(text: string): string {
  const lines = text.split('\n')
  return hasChecklist(text)
    ? lines.map((l) => l.replace(/^(\s*)\[( |x|X)\]\s?/, '$1')).join('\n')
    : lines
        .map((l) => (l.trim() === '' ? l : l.replace(/^(\s*)(?:[-*]\s+)?/, '$1[ ] ')))
        .join('\n')
}
