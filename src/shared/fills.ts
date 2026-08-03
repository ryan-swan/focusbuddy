import type { SlideFill } from './types'

// Resolve a fill to a CSS value usable for `background`. Solid -> the color,
// gradient -> a linear-gradient, none/absent -> undefined. Shared by the canvas
// renderer, the slide editor and the design export so a gradient looks the same
// on screen and in a PNG/PDF.
export function fillToCss(fill?: SlideFill): string | undefined {
  if (!fill || fill.type === 'none') return undefined
  if (fill.type === 'gradient') {
    const from = fill.color ?? '#000000'
    const to = fill.color2 ?? from
    const angle = fill.angle ?? 135
    return `linear-gradient(${angle}deg, ${from}, ${to})`
  }
  return fill.color
}

// A convenience constructor for a gradient fill.
export function gradient(from: string, to: string, angle = 135): SlideFill {
  return { type: 'gradient', color: from, color2: to, angle }
}
