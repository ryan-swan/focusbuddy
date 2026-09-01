// DEC-056 — time-block vertical fit.
//
// A block's height comes from its duration, so a 15-minute event is only a few
// pixels tall. Padding it like a full-size block crops the title: the caption
// line needs ~15px on its own, and py-1 spends 8 of the 16px a floored block
// has. Below TIGHT_PX a block therefore sheds its vertical padding and centres
// a single line, and no block is ever shorter than one line needs.
//
// The invariant this exists to hold: for EVERY height, the space left for text
// after padding is at least one caption line. blockFit() is the one place that
// decides it so a test can check every height rather than trusting the JSX.
export const CAPTION_LINE_PX = 15
export const BLOCK_MIN_PX = 18
export const TIGHT_PX = 28
export function blockFit(height: number): { tight: boolean; boxHeight: number; contentPx: number } {
  const tight = height < TIGHT_PX
  const boxHeight = Math.max(BLOCK_MIN_PX, height)
  return { tight, boxHeight, contentPx: boxHeight - (tight ? 0 : 8) }
}
