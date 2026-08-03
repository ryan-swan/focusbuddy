import { describe, it, expect } from 'vitest'
import type { Widget, WidgetLink } from '../../src/shared/types'
import { computeDeskSuggestion } from '../../src/renderer/src/lib/deskSuggestions'

function w(id: string, kind: Widget['kind']): Widget {
  return { id, kind, content: '', title: '', taskId: 't1' } as unknown as Widget
}
function link(source: string, target: string): WidgetLink {
  return { id: `${source}-${target}`, sourceWidgetId: source, targetWidgetId: target, enabled: true } as unknown as WidgetLink
}

describe('computeDeskSuggestion - deterministic proactive nudges', () => {
  it('suggests nothing on an empty desk', () => {
    expect(computeDeskSuggestion([], [])).toBeNull()
  })

  it('suggests an agent when there is a table but no agent', () => {
    const s = computeDeskSuggestion([w('a', 'table')], [])
    expect(s?.id).toBe('table-no-agent')
  })

  it('flags an agent with no inputs wired in (highest priority)', () => {
    const s = computeDeskSuggestion([w('t', 'table'), w('ag', 'agent')], [])
    expect(s?.id).toBe('agent-no-input:ag')
  })

  it('stays quiet once the agent has a wired input', () => {
    const s = computeDeskSuggestion([w('t', 'table'), w('ag', 'agent')], [link('t', 'ag')])
    // Table has an agent, agent has an input -> no nudge.
    expect(s).toBeNull()
  })

  it('offers to summarise a content-rich desk with no agent', () => {
    const s = computeDeskSuggestion([w('n1', 'note'), w('d1', 'doc')], [])
    expect(s?.id).toBe('content-no-agent')
  })

  it('does not nudge a single note (too little to automate)', () => {
    expect(computeDeskSuggestion([w('n1', 'note')], [])).toBeNull()
  })

  it('ignores chrome + pinned widgets when deciding', () => {
    const minimap = w('m', 'minimap')
    expect(computeDeskSuggestion([minimap], [])).toBeNull()
  })
})
