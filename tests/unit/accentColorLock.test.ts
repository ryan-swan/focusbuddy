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

// ── DEC-095 — undefined ink tokens (GAP-020) ───────────────────────────────
// A `var(--ink-80)` the sheet never defines is INVALID: the declaration is
// dropped and the element silently inherits its parent's colour, so text
// meant to be secondary renders at full ink. Measured live — --ink-80,
// --ink-45, --ink-55, --ink-35, --ink-25 and --ink-300 all resolve to nothing.
//
// Defining them app-wide changes text colour in ~68 places at once, so the
// cleanup is its own round (GAP-020). This lock does the one thing that is
// safe today: the offender set may SHRINK, never grow.
describe('DEC-095 — no NEW undefined ink tokens (GAP-020 baseline)', () => {
  it('every ink step referenced is defined, or is a known GAP-020 offender', () => {
    const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    // Frozen at the moment GAP-020 was found. Shrinking this list is the fix;
    // adding to it is the regression this lock exists to catch.
    const KNOWN_OFFENDERS = new Set(['80', '45', '55', '35', '25', '300'])
    const root = join(__dirname, '../..', 'src/renderer/src')
    const tokens = readFileSync(join(root, 'styles/tokens.css'), 'utf-8')
    const defined = new Set([...tokens.matchAll(/--ink-(\d+):/g)].map((m) => m[1]))
    const found = new Set<string>()
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx|ts)$/.test(name)) {
          const body = readFileSync(p, 'utf-8')
          for (const m of body.matchAll(/--ink-(\d+)/g))
            if (!defined.has(m[1])) found.add(m[1])
        }
      }
    }
    walk(root)
    const novel = [...found].filter((step) => !KNOWN_OFFENDERS.has(step))
    expect(novel).toEqual([])
  })
})
