import { describe, it, expect } from 'vitest'
import { cropStyle } from '@renderer/components/documents/slides/slideOps'

// cropStyle maps crop inset fractions to the CSS background-size + position that
// makes the kept window fill the element frame. The maths must be exact, since a
// wrong factor would shift or stretch the visible image.

describe('cropStyle', () => {
  it('no crop fills the frame 1:1', () => {
    expect(cropStyle({ l: 0, t: 0, r: 0, b: 0 })).toEqual({ size: '100% 100%', position: '0% 0%' })
  })

  it('cropping the left half doubles the width and pins to the right', () => {
    // visible width = 0.5 -> size 200%; the kept window starts at the midpoint.
    expect(cropStyle({ l: 0.5, t: 0, r: 0, b: 0 })).toEqual({ size: '200% 100%', position: '100% 0%' })
  })

  it('a centred 50% crop scales 2x and centres', () => {
    expect(cropStyle({ l: 0.25, t: 0.25, r: 0.25, b: 0.25 })).toEqual({ size: '200% 200%', position: '50% 50%' })
  })

  it('an asymmetric crop keeps the window edges where they belong', () => {
    // keep x in [0.2, 0.9] -> width 0.7 -> 1/0.7 = 142.86%; pos 0.2/0.3 = 66.67%
    expect(cropStyle({ l: 0.2, t: 0, r: 0.1, b: 0 })).toEqual({ size: '142.86% 100%', position: '66.67% 0%' })
  })
})
