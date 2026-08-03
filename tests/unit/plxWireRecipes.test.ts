import { describe, it, expect } from 'vitest'
import { recipesForSource, WIRE_RECIPES } from '../../src/renderer/src/lib/wireRecipes'

// Preset transform recipes (Lever 2): the one-click library that fills a good verb
// so a transform wire never opens to a blank instruction box.

describe('recipesForSource', () => {
  it('offers the text recipes for a text-bearing source', () => {
    const r = recipesForSource('note')
    expect(r.length).toBeGreaterThan(0)
    expect(r.map((x) => x.id)).toContain('action-items')
    expect(r.map((x) => x.id)).toContain('summarize')
  })

  it('offers nothing for a non-text source (user can still type a custom verb)', () => {
    expect(recipesForSource('timer')).toEqual([])
    expect(recipesForSource('color')).toEqual([])
  })

  it('offers the full set when the source kind is unknown', () => {
    expect(recipesForSource(undefined).length).toBe(WIRE_RECIPES.length)
  })

  it('every recipe carries a non-empty instruction verb', () => {
    for (const r of WIRE_RECIPES) {
      expect(r.verb.trim().length).toBeGreaterThan(0)
      expect(r.label.trim().length).toBeGreaterThan(0)
    }
  })
})
