// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { nestRows } from '../../src/renderer/src/lib/attentionGrouping'

// DEC-070 — the reset. The subtree renders as ONE group with ONE dashed
// connector, so the renderer needs the flat depth-annotated list back as a
// tree. These pin the conversion; the no-seams property follows from there
// being a single element per group, which needs no test because there is no
// second element to disagree with it.
const t = (...depths: number[]): { depth: number; i: number }[] =>
  depths.map((depth, i) => ({ depth, i }))
const shape = (n: ReturnType<typeof nestRows<{ depth: number; i: number }>>): unknown =>
  n.map((x) => [x.row.i, shape(x.children)])

describe('dec_070 — flat depth list to tree', () => {
  it('dec_070_parent_and_two_children', () => {
    expect(shape(nestRows(t(0, 1, 1)))).toEqual([[0, [[1, []], [2, []]]]])
  })

  it('dec_070_three_levels_nest_all_the_way_down', () => {
    // The operator's own screenshot: parent → child → grandchild.
    expect(shape(nestRows(t(0, 1, 2)))).toEqual([[0, [[1, [[2, []]]]]]])
  })

  it('dec_070_a_sibling_after_a_subtree_returns_to_its_own_level', () => {
    expect(shape(nestRows(t(0, 1, 2, 1)))).toEqual([[0, [[1, [[2, []]]], [3, []]]]])
  })

  it('dec_070_order_is_preserved_exactly', () => {
    const flat: number[] = []
    const walk = (n: ReturnType<typeof nestRows<{ depth: number; i: number }>>): void =>
      n.forEach((x) => {
        flat.push(x.row.i)
        walk(x.children)
      })
    walk(nestRows(t(0, 1, 1, 0, 1, 2, 0)))
    expect(flat).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('dec_070_a_malformed_depth_jump_attaches_to_the_nearest_ancestor', () => {
    // depth 0 straight to depth 2: no depth-1 parent exists. It must land
    // under the depth-0 row rather than throw — a bad row must not take the
    // queue down.
    expect(shape(nestRows(t(0, 2)))).toEqual([[0, [[1, []]]]])
  })

  it('dec_070_a_leading_orphan_child_becomes_a_root', () => {
    expect(shape(nestRows(t(1, 0)))).toEqual([[0, []], [1, []]])
  })

  it('dec_070_empty_in_empty_out', () => {
    expect(nestRows([])).toEqual([])
  })
})
