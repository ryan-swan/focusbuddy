import { describe, it, expect } from 'vitest'
import {
  splitCitations,
  transformCitations,
  citedNumbers
} from '../../src/renderer/src/lib/remarkCitations'

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

  it('a citeRef carries its number as a text child, never an empty span (A1)', () => {
    // hProperties keys reach hast verbatim; the renderer override used to look
    // up a camelized key, miss, and fall through to a bare span — with no
    // child, every inline citation rendered as an INVISIBLE gap. The child
    // guarantees a visible number even when no override matches.
    const parts = splitCitations('grounded [3].')
    const cite = parts!.find((p) => p.type === 'citeRef')
    expect(cite?.children).toEqual([{ type: 'text', value: '3' }])
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

// citedNumbers answers the question that decides whether a chip appears at all:
// did the answer actually USE this source? It must agree with what the plugin
// above turns into a visible marker — a number counted here but skipped there
// would put a chip under a claim that never cites it.
describe('citedNumbers', () => {
  it('is empty for an answer that cites nothing', () => {
    // The exact bug this work exists to fix: retrieval returned six documents,
    // the answer used none of them, and six chips appeared anyway.
    expect(citedNumbers("I don't have Ryan's email address in your canvas or context.").size).toBe(0)
  })

  it('collects each number the prose cites, once', () => {
    const out = citedNumbers('The cert is unsigned [2] and the checklist is stale [2][5].')
    expect([...out].sort((a, b) => a - b)).toEqual([2, 5])
  })

  it('ignores a bracketed number inside a fenced code block', () => {
    const md = ['Here is the fix:', '', '```ts', 'const first = rows[1]', '```', '', 'Done.'].join('\n')
    expect(citedNumbers(md).size).toBe(0)
  })

  it('ignores an unterminated fence — the model gets cut off mid-block', () => {
    const md = ['Try this:', '', '```ts', 'const first = rows[1]'].join('\n')
    expect(citedNumbers(md).size).toBe(0)
  })

  it('ignores a bracketed number inside an inline code span', () => {
    expect(citedNumbers('Read `matrix[2]` carefully.').size).toBe(0)
  })

  it('ignores a bracketed number inside a four-space indented code block', () => {
    expect(citedNumbers(['Example:', '', '    const x = list[1]', ''].join('\n')).size).toBe(0)
  })

  it('ignores markdown link and image labels', () => {
    expect(citedNumbers('See [1](https://example.com) for more.').size).toBe(0)
    expect(citedNumbers('![1](img.png)').size).toBe(0)
  })

  it('ignores a link definition line, which the renderer also skips', () => {
    expect(citedNumbers('[1]: https://example.com').size).toBe(0)
  })

  it('counts a bare [n] beside a reference label, matching what the renderer chips', () => {
    // remark only builds a linkReference when a matching definition exists, so
    // `[label][1]` with none stays plain text and DOES render a chip. Counting
    // it here is what keeps the chip row and the inline markers in agreement.
    expect([...citedNumbers('A [label][1] reference.')]).toEqual([1])
  })

  it('still finds a real citation sitting beside a link', () => {
    const out = citedNumbers('See [the docs](https://example.com) — the cert is unsigned [3].')
    expect([...out]).toEqual([3])
  })

  it('still finds a real citation in a paragraph after a code block', () => {
    const md = ['```ts', 'rows[1]', '```', '', 'The checklist is stale [4].'].join('\n')
    expect([...citedNumbers(md)]).toEqual([4])
  })

  it('applies the same 1-3 digit bound the renderer does', () => {
    expect(citedNumbers('the year [2026] was fine').size).toBe(0)
  })

  it('handles empty and whitespace input without throwing', () => {
    expect(citedNumbers('').size).toBe(0)
    expect(citedNumbers('   ').size).toBe(0)
  })

  it('is not corrupted by a previous call (regex lastIndex is reset)', () => {
    expect([...citedNumbers('first [1]')]).toEqual([1])
    expect([...citedNumbers('second [1]')]).toEqual([1])
  })
})
