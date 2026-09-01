// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { blockFit, CAPTION_LINE_PX, BLOCK_MIN_PX, TIGHT_PX } from '../../src/renderer/src/lib/calendarGeometry'

// DEC-056 — a calendar block's height is its duration, so short events are the
// normal case, not the edge case. The title must survive all of them.
describe('dec_056 — a time block always has room for its title', () => {
  it('dec_056_no_height_crops_the_caption_line', () => {
    // The whole invariant, checked exhaustively rather than at sampled points:
    // whatever the duration, what is left after padding still fits one line.
    const cropped: number[] = []
    for (let h = 0; h <= 400; h++) if (blockFit(h).contentPx < CAPTION_LINE_PX) cropped.push(h)
    expect(cropped).toEqual([])
  })

  it('dec_056_short_blocks_shed_padding_rather_than_crop', () => {
    // The 16px-floored, py-1 block that sheared "Meeting" in half.
    const short = blockFit(11) // a 15-minute event at the default zoom
    expect(short.tight).toBe(true)
    expect(short.boxHeight).toBe(BLOCK_MIN_PX)
    expect(short.contentPx).toBeGreaterThanOrEqual(CAPTION_LINE_PX)
  })

  it('dec_056_the_threshold_is_where_padding_becomes_affordable', () => {
    // Just below the threshold: unpadded, full box for the line.
    expect(blockFit(TIGHT_PX - 1).contentPx).toBe(TIGHT_PX - 1)
    // Just at it: padded again, and the remainder still clears a line — this
    // is the assertion that fails if anyone lowers TIGHT_PX to 20.
    expect(blockFit(TIGHT_PX).tight).toBe(false)
    expect(blockFit(TIGHT_PX).contentPx).toBeGreaterThanOrEqual(CAPTION_LINE_PX)
  })

  it('dec_056_tall_blocks_are_unchanged', () => {
    expect(blockFit(120)).toEqual({ tight: false, boxHeight: 120, contentPx: 112 })
  })
})
