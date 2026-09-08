import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// One responsive contract for action rows, panels and headers.
//
// The reported symptom was the live-sharing Share button rendering outside its
// modal as a narrow purple sliver. The cause is a CSS flexbox rule that is easy
// to miss: a flex child with `flex-1` still has `min-width: auto`, so it cannot
// shrink below the intrinsic width of its content. Put a `truncate` label or a
// text input inside one and the child refuses to shrink, the row overflows, and
// whatever sits at the end is pushed past the container edge and clipped.
//
// `min-w-0` is what lets the child actually shrink, and it is the whole fix.
// This test enforces it repository-wide so the class of defect cannot return in
// a component nobody thought to re-test.

const ROOT = join(__dirname, '..', '..', 'src', 'renderer', 'src', 'components')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p))
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('responsive shell contract', () => {
  it('a flex-1 child that holds unshrinkable content also sets min-w-0', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(ROOT)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/className="([^"]*\bflex-1\b[^"]*)"/g)) {
        const cls = m[1]
        if (/\bmin-w-/.test(cls)) continue
        // Column layouts constrain height, not width, so they are exempt.
        if (/\bflex-col\b/.test(cls)) continue
        const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 200)
        const sameElement = after.slice(0, after.indexOf('>') + 1)
        const holdsNoWrapText = /\btruncate\b|\bwhitespace-nowrap\b/.test(cls)
        const isTextInput = /^\s*(value|placeholder|onChange)=/m.test(sameElement)
        if (holdsNoWrapText || isTextInput) {
          offenders.push(`${file.slice(file.indexOf('components'))}: ${cls.slice(0, 70)}`)
        }
      }
    }
    expect(offenders, 'flex-1 without min-w-0 cannot shrink and will overflow its row').toEqual([])
  })

  it('the share action row wraps before it clips', () => {
    const src = readFileSync(join(ROOT, 'SharePeoplePicker.tsx'), 'utf8')
    const row = src.slice(src.indexOf('flex flex-wrap items-center gap-1.5'))
    expect(row, 'the action row must wrap rather than push the button out of the modal').toContain(
      'flex-wrap'
    )
    const button = row.slice(row.indexOf('data-testid="share-picker-submit"'))
    expect(button).toContain('min-w-[8rem]')
    // The label truncates instead of forcing the row wider than the modal.
    expect(button.slice(0, 700)).toContain('truncate')
  })
})
