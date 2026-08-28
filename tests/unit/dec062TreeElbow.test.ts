// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { hasFollowingSibling } from '../../src/renderer/src/lib/attentionGrouping'

// DEC-062 — the elbow's trunk. A child draws a corner from its parent's spine;
// when more siblings follow, the trunk must continue past that corner to reach
// them. Getting this wrong is only visible with MULTIPLE sub-items, which is
// exactly the case the operator asked to work.
const t = (...depths: number[]): { depth: number }[] => depths.map((depth) => ({ depth }))

describe('dec_062 — hasFollowingSibling', () => {
  it('dec_062_two_children_first_has_a_sibling_second_does_not', () => {
    const rows = t(0, 1, 1) // parent, child A, child B
    expect(hasFollowingSibling(rows, 1)).toBe(true)
    expect(hasFollowingSibling(rows, 2)).toBe(false)
  })

  it('dec_062_a_grandchild_between_siblings_does_not_end_the_trunk', () => {
    // parent, child A, A's own child, child B — A still has B below it, and the
    // grandchild in between must not be mistaken for "no more siblings".
    const rows = t(0, 1, 2, 1)
    expect(hasFollowingSibling(rows, 1)).toBe(true)
    expect(hasFollowingSibling(rows, 2)).toBe(false) // the grandchild is alone
    expect(hasFollowingSibling(rows, 3)).toBe(false) // child B is last
  })

  it('dec_062_the_next_root_ends_a_childs_trunk', () => {
    const rows = t(0, 1, 0) // parent, its only child, then a new root
    expect(hasFollowingSibling(rows, 1)).toBe(false)
  })

  it('dec_062_three_siblings_only_the_last_ends_it', () => {
    const rows = t(0, 1, 1, 1)
    expect([1, 2, 3].map((i) => hasFollowingSibling(rows, i))).toEqual([true, true, false])
  })

  it('dec_062_roots_are_siblings_of_each_other', () => {
    expect(hasFollowingSibling(t(0, 0), 0)).toBe(true)
    expect(hasFollowingSibling(t(0, 0), 1)).toBe(false)
  })

  it('dec_062_out_of_range_is_false_not_a_throw', () => {
    expect(hasFollowingSibling(t(0), 5)).toBe(false)
    expect(hasFollowingSibling([], 0)).toBe(false)
  })
})
