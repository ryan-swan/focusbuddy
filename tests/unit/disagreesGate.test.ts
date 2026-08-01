import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DISAGREES_SURFACING_ENABLED } from '@shared/spineRerank'

// S-007 SURFACING GATE — the "sources disagree" chip must not reach a user until the
// contradiction resolver earns it.
//
// State on 2026-08-01: the value-position fix (commit 0fc1ed4) cut false contradictions
// on the real corpus from 198 to 96. 96 wrong chips is still worse than none — DEC-016's
// safe-asymmetry rates a FALSE "sources disagree" as worse than a missed one. So the
// EDGES keep being computed (we need them to keep measuring) but the FLAG does not
// surface.
//
// This is a deliberate, reversible gate, not an abandonment. Un-gating requires evidence:
// a labelled ground-truth sample of the real corpus showing the false-positive rate is
// acceptable. Flipping the constant without that evidence should fail review.
//
// Lock shape (per verification-and-quality.md §1a): the source assertion below is an
// OCCURRENCE-COUNT invariant, not a single-spelling grep — every call of nodeDisagrees()
// outside its own definition must be guarded by the flag, so a re-spelled or destructured
// read cannot slip past.

const spineSrc = (): string => readFileSync(resolve(__dirname, '../../src/main/brain/spine.ts'), 'utf8')

// Strip line + block comments so prose about the gate cannot satisfy a source assertion.
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('S-007 — the disagree chip is gated off until the resolver earns it', () => {
  it('the surfacing flag is OFF', () => {
    expect(DISAGREES_SURFACING_ENABLED).toBe(false)
  })

  it('every nodeDisagrees() call site in spine.ts is guarded by the flag', () => {
    const code = stripComments(spineSrc())
    // Call sites = occurrences of "nodeDisagrees(" that are not the function definition.
    const calls = [...code.matchAll(/nodeDisagrees\s*\(/g)]
    const defs = [...code.matchAll(/function\s+nodeDisagrees\s*\(/g)]
    const callSites = calls.length - defs.length
    expect(callSites).toBeGreaterThan(0) // the detector is still wired — we keep measuring

    // Each call site must appear in a guarded expression naming the flag.
    const guarded = [...code.matchAll(/DISAGREES_SURFACING_ENABLED\s*&&\s*nodeDisagrees\s*\(/g)]
    expect(guarded.length).toBe(callSites)
  })

  it('the contradiction detector itself is NOT disabled — edges keep being minted', () => {
    // Gating the CHIP must not silently stop the measurement that will un-gate it.
    const code = stripComments(spineSrc())
    expect(code).toContain('nodeDisagrees')
  })
})
