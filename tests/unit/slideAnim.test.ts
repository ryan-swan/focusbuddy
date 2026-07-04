import { describe, it, expect } from 'vitest'
import { entranceAnimationCss, slideTransitionCss, morphPairs, geomOf, ANIM_KEYFRAMES_CSS } from '../../src/shared/slideAnim'
import type { Slide, SlideElement } from '../../src/shared/types'

function el(id: string, patch: Partial<SlideElement> = {}): SlideElement {
  return { id, type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, z: 1, ...patch } as SlideElement
}
function slide(id: string, els: SlideElement[]): Slide {
  return { id, notes: '', elements: els }
}

describe('entranceAnimationCss', () => {
  it('returns undefined for no animation', () => {
    expect(entranceAnimationCss(undefined, 0)).toBeUndefined()
  })
  it('builds a keyframe shorthand with a staggered delay from the index', () => {
    const css = entranceAnimationCss({ type: 'fadeIn' }, 2)
    expect(css).toContain('plexiFadeIn')
    expect(css).toContain('240ms both') // index 2 * 120ms stagger
  })
  it('an explicit order overrides the index for the delay', () => {
    const css = entranceAnimationCss({ type: 'zoomIn', order: 1 }, 5)
    expect(css).toContain('plexiZoomIn')
    expect(css).toContain('120ms both') // order 1 * 120ms
  })
  it('honours a custom duration', () => {
    expect(entranceAnimationCss({ type: 'slideUp', durationMs: 800 }, 0)).toContain('plexiSlideUp 800ms')
  })
})

describe('slideTransitionCss', () => {
  it('maps fade/slide/zoom to keyframes', () => {
    expect(slideTransitionCss('fade')).toContain('plexiFadeIn')
    expect(slideTransitionCss('slide')).toContain('plexiSlideLeft')
    expect(slideTransitionCss('zoom')).toContain('plexiZoomIn')
  })
  it('returns undefined for none and morph (morph is a component, not a keyframe)', () => {
    expect(slideTransitionCss('none')).toBeUndefined()
    expect(slideTransitionCss('morph')).toBeUndefined()
    expect(slideTransitionCss(undefined)).toBeUndefined()
  })
})

describe('morphPairs', () => {
  it('returns ids present on both slides', () => {
    const prev = slide('s1', [el('a'), el('b')])
    const cur = slide('s2', [el('b'), el('c')])
    expect([...morphPairs(prev, cur)]).toEqual(['b'])
  })
  it('is empty with no previous slide', () => {
    expect(morphPairs(undefined, slide('s', [el('a')])).size).toBe(0)
  })
})

describe('geomOf', () => {
  it('extracts the tweenable geometry', () => {
    expect(geomOf(el('a', { x: 10, y: 20, w: 30, h: 40, opacity: 0.5, rotation: 15 }))).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      opacity: 0.5,
      rotation: 15
    })
  })
})

describe('ANIM_KEYFRAMES_CSS', () => {
  it('defines every keyframe the helpers reference', () => {
    for (const name of ['plexiFadeIn', 'plexiSlideUp', 'plexiSlideLeft', 'plexiZoomIn']) {
      expect(ANIM_KEYFRAMES_CSS).toContain(`@keyframes ${name}`)
    }
  })
})
