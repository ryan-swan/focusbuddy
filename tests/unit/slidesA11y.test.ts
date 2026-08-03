import { describe, it, expect } from 'vitest'
import { checkSlidesA11y } from '../../src/renderer/src/lib/slidesA11y'
import type { SlidesBody, SlideElement } from '../../src/shared/types'

function textEl(text: string): SlideElement {
  return { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 40, z: 1, paragraphs: [{ runs: [{ text }] }] } as SlideElement
}
function imageEl(alt?: string): SlideElement {
  return { id: 'i', type: 'image', x: 0, y: 0, w: 100, h: 80, z: 1, src: 'x.png', ...(alt !== undefined ? { alt } : {}) } as SlideElement
}
function deck(slides: SlidesBody['slides']): SlidesBody {
  return { slides, schemaVersion: 2 }
}

describe('checkSlidesA11y', () => {
  it('a deck with titled slides and described images is clean', () => {
    const issues = checkSlidesA11y(deck([{ id: 's1', notes: '', elements: [textEl('Title'), imageEl('A described chart')] }]))
    expect(issues).toEqual([])
  })

  it('flags images with no alt text', () => {
    const issues = checkSlidesA11y(deck([{ id: 's1', notes: '', elements: [textEl('Title'), imageEl('')] }]))
    expect(issues.some((i) => i.severity === 'error' && /alt text/.test(i.message))).toBe(true)
  })

  it('warns about a slide with content but no title', () => {
    const issues = checkSlidesA11y(deck([{ id: 's1', notes: '', elements: [imageEl('desc')] }]))
    expect(issues.some((i) => /no title text/.test(i.message))).toBe(true)
  })

  it('accepts the legacy title field as a title', () => {
    const issues = checkSlidesA11y(deck([{ id: 's1', notes: '', title: 'Legacy', elements: [imageEl('desc')] }]))
    expect(issues.some((i) => /no title/.test(i.message))).toBe(false)
  })

  it('reports the offending slide numbers', () => {
    const issues = checkSlidesA11y(
      deck([
        { id: 's1', notes: '', elements: [textEl('Has title')] },
        { id: 's2', notes: '', elements: [imageEl('desc')] }
      ])
    )
    expect(issues.find((i) => /no title/.test(i.message))?.message).toMatch(/\b2\b/)
  })

  it('an empty deck is clean', () => {
    expect(checkSlidesA11y(deck([]))).toEqual([])
    expect(checkSlidesA11y(undefined)).toEqual([])
  })
})
