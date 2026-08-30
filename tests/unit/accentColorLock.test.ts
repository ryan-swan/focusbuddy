import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

// GAP-018 closed (DEC-086): rgba(var(--accent),X) substitutes the
// space-separated triplet into comma syntax — INVALID CSS, so every such
// wash, ring, glow and shadow silently painted NOTHING from the day it
// shipped (the futuristic/gemstone theme glows included). The sanctioned
// forms are the configured slash utilities (bg-accent/14, ring-accent/35)
// and rgb(var(--accent)/X) inside arbitrary values and stylesheets. This
// lock keeps the broken form out of the entire tree, forever.

describe('the accent color always paints', () => {
  it('no rgba(var(--accent…)) anywhere in src — ts, tsx, or css', () => {
    let out = ''
    try {
      out = execSync(
        String.raw`grep -rn "rgba(var(--accent" src --include='*.ts' --include='*.tsx' --include='*.css'`,
        { encoding: 'utf8' }
      )
    } catch {
      out = '' // grep exits 1 on zero matches — the pass case
    }
    expect(out.trim()).toBe('')
  })

  it('no bare non-multiple-of-5 opacity modifiers — they silently never generate', () => {
    // Tailwind's opacity scale is multiples of 5; accent/14 produces NO
    // utility and paints nothing (measured). Off-scale values take the
    // arbitrary form: accent/[0.14].
    let out = ''
    try {
      out = execSync(
        String.raw`grep -rnoE "accent(-hover)?/[0-9]+" src --include='*.tsx' --include='*.ts'`,
        { encoding: 'utf8' }
      )
    } catch {
      out = ''
    }
    const offenders = out
      .split('\n')
      .filter(Boolean)
      .filter((l) => Number(l.split('/').pop()) % 5 !== 0)
    expect(offenders).toEqual([])
  })
})
