// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isFirstOfSiblings } from '../../src/renderer/src/lib/attentionGrouping'

// DEC-069 — only the FIRST sub-item draws the bend. The horizontal says "the
// list steps in here", which is true once; drawing it per child said it once
// per child and turned a hierarchy into a stack of brackets. Every sub-item
// still carries the vertical down its indented edge, so the line stays
// continuous — that part is geometry, pinned in calendarAttention.
const t = (...depths: number[]): { depth: number }[] => depths.map((depth) => ({ depth }))

describe('dec_069 — which sub-item earns the bend', () => {
  it('dec_069_two_children_only_the_first_bends', () => {
    // The operator's screenshot: two sub-items, two horizontals, one too many.
    const rows = t(0, 1, 1)
    expect(isFirstOfSiblings(rows, 1)).toBe(true)
    expect(isFirstOfSiblings(rows, 2)).toBe(false)
  })

  it('dec_069_three_children_still_only_the_first', () => {
    expect([1, 2, 3].map((i) => isFirstOfSiblings(t(0, 1, 1, 1), i))).toEqual([true, false, false])
  })

  it('dec_069_a_lone_child_bends', () => {
    expect(isFirstOfSiblings(t(0, 1), 1)).toBe(true)
  })

  it('dec_069_a_grandchild_bends_under_its_own_parent', () => {
    // parent, child, grandchild — the grandchild starts a new level, so it
    // earns its own bend at ITS indent, not the child's.
    const rows = t(0, 1, 2)
    expect(isFirstOfSiblings(rows, 2)).toBe(true)
  })

  it('dec_069_a_sibling_after_a_nested_subtree_does_not_bend_again', () => {
    // parent, child A, A's grandchild, child B. B is a later sibling however
    // much sits between it and A — the depth of the row directly above it is
    // what settles it, and that row is the grandchild, not the parent.
    const rows = t(0, 1, 2, 1)
    expect(isFirstOfSiblings(rows, 1)).toBe(true)  // child A
    expect(isFirstOfSiblings(rows, 3)).toBe(false) // child B
  })

  it('dec_069_a_root_never_bends', () => {
    expect(isFirstOfSiblings(t(0, 0), 0)).toBe(false)
    expect(isFirstOfSiblings(t(0, 0), 1)).toBe(false)
  })

  it('dec_069_out_of_range_is_false_not_a_throw', () => {
    expect(isFirstOfSiblings(t(0, 1), 9)).toBe(false)
    expect(isFirstOfSiblings([], 0)).toBe(false)
  })
})
