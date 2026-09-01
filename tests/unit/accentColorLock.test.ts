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

// ── DEC-096 — undefined ink tokens (GAP-020, CLOSED) ───────────────────────
// A `var(--ink-N)` the sheet never defines is INVALID: the declaration is
// dropped and the element silently inherits its parent's colour. DEC-095
// found six such steps (~68 sites) and froze them; DEC-096 DEFINED the five
// real ones in all three themes (midpoints of their neighbours) and rewrote
// the --ink-300 typo to --ink-60. The lock is strict now: every ink step
// referenced anywhere must exist in tokens.css.
describe('DEC-096 — every ink token referenced is defined (GAP-020 closed)', () => {
  it('no component references an ink step the sheet does not define', () => {
    const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const root = join(__dirname, '../..', 'src/renderer/src')
    const tokens = readFileSync(join(root, 'styles/tokens.css'), 'utf-8')
    const defined = new Set([...tokens.matchAll(/--ink-(\d+):/g)].map((m) => m[1]))
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx|ts)$/.test(name)) {
          const body = readFileSync(p, 'utf-8')
          for (const m of body.matchAll(/--ink-(\d+)/g))
            if (!defined.has(m[1])) offenders.push(`${name}: --ink-${m[1]}`)
        }
      }
    }
    walk(root)
    expect([...new Set(offenders)]).toEqual([])
  })
  it('each theme block defines the full scale — a new theme cannot ship a partial one', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const tokens = readFileSync(join(__dirname, '../..', 'src/renderer/src/styles/tokens.css'), 'utf-8')
    const STEPS = ['100', '90', '80', '70', '60', '55', '50', '45', '40', '35', '30', '25', '10']
    for (const step of STEPS) {
      const n = [...tokens.matchAll(new RegExp(`--ink-${step}:`, 'g'))].length
      expect(`--ink-${step} x${n}`).toBe(`--ink-${step} x3`)
    }
  })
})

// ── DEC-097 — var()+opacity-modifier utilities (GAP-019, CLOSED) ────────────
// `bg-[var(--surface-sunken)]/60` emits `rgb(var(--surface-sunken) / 0.6)`,
// and since the token is a COMPLETE color the declaration is invalid — the
// element paints NOTHING, both themes, silently (117 sites, measured by
// paint-probe under DEC-089/095). The working form is a color-mix arbitrary
// value: `bg-[color-mix(in_oklab,var(--x)_60%,transparent)]` — same token,
// same opacity, valid CSS. This lock keeps the broken form out of the app
// source for every property prefix (bg/border/divide/via/…). The codemod
// test fixture in tests/ is sample input, deliberately out of scope.
describe('DEC-097 — no var()+modifier utilities anywhere (GAP-019 closed)', () => {
  it('app source never alpha-modifies a var() token with the slash form', () => {
    const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const root = join(__dirname, '../..', 'src/renderer/src')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx|ts)$/.test(name)) {
          const body = readFileSync(p, 'utf-8')
          for (const m of body.matchAll(/\[var\((--[a-z-]+)\)\]\/(\d+)/g))
            offenders.push(`${name}: [var(${m[1]})]/${m[2]}`)
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
