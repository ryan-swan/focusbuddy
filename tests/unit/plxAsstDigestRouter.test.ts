import { describe, it, expect } from 'vitest'
import {
  buildDigestMarkdown,
  buildDigestDocBody,
  defaultDigestTitle,
  type DigestInput
} from '../../src/renderer/src/lib/digestRouter'

// The digest router turns a standup into real workspace objects. These lock the
// PURE builders (markdown + Tiptap body): they carry the narrative and the real
// completed titles faithfully, stay honest when the window is empty, and never
// fabricate a title. The impure routeDigest (window.api writes) is covered by the
// live/tester pass, not here.

function base(over: Partial<DigestInput> = {}): DigestInput {
  return {
    narrative: 'You closed out two desks and opened one.',
    completed: [
      { objectId: 'd1', title: 'Ship the release', at: '2026-08-04' },
      { objectId: 'd2', title: 'Fix the drag bug', at: '2026-08-04' }
    ],
    counts: { completed: 2, created: 1, updated: 0, deleted: 0 },
    scope: 'personal',
    dateLabel: '4 Aug 2026',
    ...over
  }
}

describe('defaultDigestTitle', () => {
  it('names the scope and the date', () => {
    expect(defaultDigestTitle(base())).toBe('Standup — 4 Aug 2026')
    expect(defaultDigestTitle(base({ scope: 'team' }))).toBe('Team standup — 4 Aug 2026')
  })
})

describe('buildDigestMarkdown', () => {
  it('carries the narrative and the real completed titles', () => {
    const md = buildDigestMarkdown(base())
    expect(md).toContain('# Standup — 4 Aug 2026')
    expect(md).toContain('You closed out two desks')
    expect(md).toContain('## Completed since last time')
    expect(md).toContain('- Ship the release')
    expect(md).toContain('- Fix the drag bug')
    expect(md).toContain('2 completed, 1 created')
  })

  it('is honest when nothing happened — no fabricated section', () => {
    const md = buildDigestMarkdown(
      base({ narrative: 'Nothing new since the last digest.', completed: [], counts: { completed: 0, created: 0, updated: 0, deleted: 0 } })
    )
    expect(md).toContain('Nothing new since the last digest.')
    expect(md).not.toContain('## Completed since last time')
  })

  it('never invents a title for a titleless completion', () => {
    const md = buildDigestMarkdown(base({ completed: [{ objectId: 'x', title: null, at: '2026-08-04' }], counts: { completed: 1, created: 0, updated: 0, deleted: 0 } }))
    // The one completion had no resolvable title, so it is counted, not listed.
    expect(md).not.toContain('## Completed since last time')
    expect(md).toContain('1 completed')
  })
})

describe('buildDigestDocBody', () => {
  it('produces a valid Tiptap doc with heading, prose, and a real bullet list', () => {
    const body = buildDigestDocBody(base({ narrative: 'First line.\n\nSecond paragraph.' })) as {
      type: string
      content: Array<{ type: string; content?: unknown[]; attrs?: { level?: number } }>
    }
    expect(body.type).toBe('doc')
    const heading = body.content[0]
    expect(heading.type).toBe('heading')
    expect(heading.attrs?.level).toBe(1)
    // Two narrative paragraphs (split on the blank line).
    const paras = body.content.filter((n) => n.type === 'paragraph')
    expect(paras.length).toBeGreaterThanOrEqual(2)
    const bullet = body.content.find((n) => n.type === 'bulletList') as { content: unknown[] } | undefined
    expect(bullet?.content).toHaveLength(2)
  })

  it('omits the bullet list entirely when there is nothing to list', () => {
    const body = buildDigestDocBody(
      base({ completed: [], counts: { completed: 0, created: 0, updated: 0, deleted: 0 } })
    ) as { content: Array<{ type: string }> }
    expect(body.content.some((n) => n.type === 'bulletList')).toBe(false)
  })
})
