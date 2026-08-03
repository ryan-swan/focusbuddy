import { describe, it, expect } from 'vitest'
import { checkDesignA11y } from '../../src/renderer/src/lib/designA11y'
import type { DesignBody } from '../../src/shared/design'

function design(elements: DesignBody['elements']): DesignBody {
  return { schemaVersion: 1, width: 800, height: 600, elements }
}
const img = (alt?: string) => ({ id: 'i', type: 'image', x: 0, y: 0, w: 100, h: 80, z: 1, src: 'x.png', ...(alt !== undefined ? { alt } : {}) }) as DesignBody['elements'][number]

describe('checkDesignA11y', () => {
  it('flags images without alt text', () => {
    const issues = checkDesignA11y(design([img(), img('described')]))
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/1 image missing alt text/)
  })
  it('is clean when every image has alt text', () => {
    expect(checkDesignA11y(design([img('a'), img('b')]))).toEqual([])
  })
  it('is clean with no images', () => {
    expect(checkDesignA11y(design([]))).toEqual([])
  })
})
