import { describe, it, expect } from 'vitest'
import { splitCitations, transformCitations } from '../../src/renderer/src/lib/remarkCitations'

// The plugin rewrites inline [n] markers in assistant prose into citeRef nodes
// that render as chips. These tests pin both the happy path and the cases where
// a bracketed number must be left alone — a false positive turns real text
// (a code sample, a markdown link) into a broken-looking citation.

describe('splitCitations', () => {
  it('returns null when there is no marker, so the caller can skip the node', () => {
    expect(splitCitations('no citations here')).toBeNull()
    expect(splitCitations('brackets [] and [abc] are not markers')).toBeNull()
  })

  it('splits a single marker into text + citeRef + text', () => {
    const parts = splitCitations('the cert is unsigned [2] as of Tuesday')
    expect(parts).not.toBeNull()
    expect(parts!.map((p) => p.type)).toEqual(['text', 'citeRef', 'text'])
    expect(parts![0].value).toBe('the cert is unsigned ')
    expect(parts![1].data?.hName).toBe('span')
    expect(parts![1].data?.hProperties).toEqual({ 'data-citation': '2' })
    expect(parts![2].value).toBe(' as of Tuesday')
  })

  it('handles several markers, including adjacent ones', () => {
    const parts = splitCitations('both blockers [1][2] are open')
    expect(parts!.map((p) => p.type)).toEqual(['text', 'citeRef', 'citeRef', 'text'])
    expect(parts!.filter((p) => p.type === 'citeRef').map((p) => p.data?.hProperties)).toEqual([
      { 'data-citation': '1' },
      { 'data-citation': '2' }
    ])
  })

  it('handles a marker at the very start and very end without empty text nodes', () => {
    const start = splitCitations('[1] leads the sentence')
    expect(start!.map((p) => p.type)).toEqual(['citeRef', 'text'])
    const end = splitCitations('trailing marker [3]')
    expect(end!.map((p) => p.type)).toEqual(['text', 'citeRef'])
  })

  it('ignores numbers too long to be a citation index', () => {
    // A 4+ digit bracketed number is far more likely to be data than a citation
    // into a list that is capped at 6 sources.
    expect(splitCitations('the year [2026] was fine')).toBeNull()
  })

  it('is not corrupted by a previous call (regex lastIndex is reset)', () => {
    // The module-level regex carries /g state. Without an explicit reset the
    // second call starts mid-string and silently misses the first marker.
    expect(splitCitations('first [1]')).not.toBeNull()
    const second = splitCitations('second [1]')
    expect(second).not.toBeNull()
    expect(second!.map((p) => p.type)).toEqual(['text', 'citeRef'])
  })
})

describe('transformCitations', () => {
  it('rewrites markers inside a nested paragraph', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'grounded in [1] and [2]' }] }
      ]
    }
    transformCitations(tree)
    const kinds = tree.children[0].children!.map((c) => c.type)
    expect(kinds).toEqual(['text', 'citeRef', 'text', 'citeRef'])
  })

  it('leaves inline code and code blocks alone', () => {
    // `arr[0]` in a code span is not a citation. Rewriting it would corrupt the
    // sample the assistant is showing the user.
    const tree = {
      type: 'root',
      children: [
        { type: 'inlineCode', value: 'matrix[2]' },
        { type: 'code', value: 'const x = list[1]' }
      ]
    }
    transformCitations(tree)
    expect(tree.children[0].value).toBe('matrix[2]')
    expect(tree.children[1].value).toBe('const x = list[1]')
  })

  it('leaves link labels alone', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'link', url: '/x', children: [{ type: 'text', value: 'see [1]' }] }]
    } as unknown as Parameters<typeof transformCitations>[0]
    transformCitations(tree)
    const link = tree.children![0]
    expect(link.children![0].value).toBe('see [1]')
    expect(link.children!.map((c) => c.type)).toEqual(['text'])
  })

  it('is a no-op on a tree with no children', () => {
    const leaf = { type: 'text', value: 'plain [1]' }
    expect(() => transformCitations(leaf)).not.toThrow()
    expect(leaf.value).toBe('plain [1]')
  })
})
