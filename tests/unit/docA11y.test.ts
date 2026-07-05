import { describe, it, expect } from 'vitest'
import { checkDocA11y } from '../../src/renderer/src/lib/docA11y'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const doc = (content: unknown[]) => ({ type: 'doc', content })

describe('checkDocA11y', () => {
  it('a well-formed document has no issues', () => {
    const issues = checkDocA11y(doc([h(1, 'Title'), p('Intro'), h(2, 'Section'), p('Body')]))
    expect(issues).toEqual([])
  })

  it('flags an image with no alt text as an error', () => {
    const issues = checkDocA11y(doc([{ type: 'image', attrs: { src: 'x.png', alt: '' } }, p('after')]))
    expect(issues.some((i) => i.severity === 'error' && /alt text/.test(i.message))).toBe(true)
  })

  it('accepts an image that has alt text', () => {
    const issues = checkDocA11y(doc([{ type: 'image', attrs: { src: 'x.png', alt: 'A chart of sales' } }]))
    expect(issues.some((i) => /alt text/.test(i.message))).toBe(false)
  })

  it('warns when the first heading is not H1', () => {
    const issues = checkDocA11y(doc([h(2, 'Starts at 2')]))
    expect(issues.some((i) => /first heading is H2/.test(i.message))).toBe(true)
  })

  it('warns when heading levels skip', () => {
    const issues = checkDocA11y(doc([h(1, 'Title'), h(3, 'Skipped to 3')]))
    expect(issues.some((i) => /skips from H1 to H3/.test(i.message))).toBe(true)
  })

  it('does not warn when heading levels step down by one', () => {
    const issues = checkDocA11y(doc([h(1, 'Title'), h(2, 'Sub'), h(3, 'Subsub')]))
    expect(issues.length).toBe(0)
  })

  it('flags a bare-URL link as non-descriptive', () => {
    const issues = checkDocA11y(
      doc([
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'https://example.com', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }]
        }
      ])
    )
    expect(issues.some((i) => /bare URL/.test(i.message))).toBe(true)
  })

  it('counts multiple missing-alt images in one error', () => {
    const issues = checkDocA11y(
      doc([
        { type: 'image', attrs: { src: 'a.png' } },
        { type: 'image', attrs: { src: 'b.png', alt: '' } }
      ])
    )
    const err = issues.find((i) => i.severity === 'error')
    expect(err?.message).toMatch(/2 images missing alt text/)
  })
})
