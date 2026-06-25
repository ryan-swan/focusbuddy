import { describe, it, expect } from 'vitest'
import { rankKnowledge, type KnowledgeEntry } from '../../src/shared/knowledge'

function entry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    title: over.title ?? '',
    body: over.body ?? '',
    tags: over.tags ?? [],
    pinned: over.pinned ?? false,
    createdAt: 0,
    updatedAt: 0
  }
}

const entries: KnowledgeEntry[] = [
  entry({ id: 'a', title: 'Refund policy', body: 'Customers can return within 30 days.', tags: ['support', 'policy'] }),
  entry({ id: 'b', title: 'Onboarding', body: 'New hires get a refund of their setup fee.', tags: ['hr'] }),
  entry({ id: 'c', title: 'Brand colours', body: 'Primary is indigo.', tags: ['design'] }),
  entry({ id: 'd', title: 'Support escalation', body: 'Escalate to the lead.', tags: ['support'], pinned: true })
]

describe('rankKnowledge', () => {
  it('returns the whole list (unchanged order, capped) for an empty query', () => {
    const out = rankKnowledge(entries, '')
    expect(out).toHaveLength(4)
    expect(out[0].id).toBe('a')
  })

  it('ranks a title match above a body-only match', () => {
    const out = rankKnowledge(entries, 'refund')
    // 'a' matches in the title (weight 5), 'b' only in the body (weight 1).
    expect(out[0].id).toBe('a')
    expect(out.map((e) => e.id)).toContain('b')
    expect(out.find((e) => e.id === 'a')).toBeTruthy()
  })

  it('weights tag matches above body matches', () => {
    const out = rankKnowledge(entries, 'support')
    // 'd' is pinned (+1) and tag-matches (+3); 'a' tag-matches (+3). 'd' wins.
    expect(out[0].id).toBe('d')
    expect(out.map((e) => e.id).sort()).toEqual(['a', 'd'])
  })

  it('excludes entries with no match, never invents results', () => {
    const out = rankKnowledge(entries, 'refund')
    expect(out.map((e) => e.id)).not.toContain('c')
  })

  it('returns empty for a query that matches nothing', () => {
    expect(rankKnowledge(entries, 'zxcvbnm')).toEqual([])
  })

  it('respects the limit', () => {
    expect(rankKnowledge(entries, '', 2)).toHaveLength(2)
  })

  it('matches across multiple terms', () => {
    const out = rankKnowledge(entries, 'support policy')
    // 'a' has both tags; should rank highly and be present.
    expect(out[0].id).toBe('a')
  })
})
