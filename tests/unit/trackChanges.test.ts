import { describe, it, expect } from 'vitest'
import {
  acceptTrackedChanges,
  rejectTrackedChanges,
  hasTrackedChanges,
  countTrackedChanges,
  type PmNode
} from '../../src/renderer/src/lib/trackChanges'

// A paragraph: "Hello " + inserted "brave " + "world" + deleted " forever".
function doc(): PmNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'brave ', marks: [{ type: 'insertion', attrs: { author: 'ana' } }] },
          { type: 'text', text: 'world' },
          { type: 'text', text: ' forever', marks: [{ type: 'deletion', attrs: { author: 'bob' } }] }
        ]
      }
    ]
  }
}

function textOf(node: PmNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textOf).join('')
}

describe('accept/reject tracked changes', () => {
  it('accept keeps insertions (unmarked) and removes deletions', () => {
    const out = acceptTrackedChanges(doc())
    expect(textOf(out)).toBe('Hello brave world')
    // The kept insertion no longer carries the insertion mark.
    const para = out.content![0]
    expect(para.content!.some((n) => n.marks?.some((m) => m.type === 'insertion'))).toBe(false)
    expect(para.content!.some((n) => n.marks?.some((m) => m.type === 'deletion'))).toBe(false)
  })

  it('reject removes insertions and keeps deletions (unmarked)', () => {
    const out = rejectTrackedChanges(doc())
    expect(textOf(out)).toBe('Hello world forever')
    const para = out.content![0]
    expect(para.content!.some((n) => n.marks?.some((m) => m.type === 'insertion'))).toBe(false)
    expect(para.content!.some((n) => n.marks?.some((m) => m.type === 'deletion'))).toBe(false)
  })

  it('does not mutate the input document', () => {
    const d = doc()
    const before = JSON.stringify(d)
    acceptTrackedChanges(d)
    rejectTrackedChanges(d)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('detects and counts tracked changes', () => {
    expect(hasTrackedChanges(doc())).toBe(true)
    expect(countTrackedChanges(doc())).toBe(2) // one insertion run, one deletion run
  })

  it('a clean document has no changes and round-trips unchanged', () => {
    const clean: PmNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }] }
    expect(hasTrackedChanges(clean)).toBe(false)
    expect(countTrackedChanges(clean)).toBe(0)
    expect(textOf(acceptTrackedChanges(clean))).toBe('plain')
    expect(textOf(rejectTrackedChanges(clean))).toBe('plain')
  })

  it('preserves other marks (e.g. bold) while stripping only the tracked mark', () => {
    const d: PmNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hi', marks: [{ type: 'bold' }, { type: 'insertion', attrs: { author: 'ana' } }] }
          ]
        }
      ]
    }
    const out = acceptTrackedChanges(d)
    const run = out.content![0].content![0]
    expect(run.marks).toEqual([{ type: 'bold' }])
  })

  it('drops a block that becomes empty after removing deleted text', () => {
    const d: PmNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'keep' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'gone', marks: [{ type: 'deletion' }] }] }
      ]
    }
    const out = acceptTrackedChanges(d)
    // The second paragraph survives as an (empty) block; its text is gone.
    expect(textOf(out)).toBe('keep')
  })
})
