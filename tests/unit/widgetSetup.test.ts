import { describe, it, expect } from 'vitest'
import { formatSetupItems, applyMindmapNodes } from '../../src/renderer/src/lib/widgetSetup'

describe('formatSetupItems — applies AI setup items in each widget format', () => {
  it('formats a sticky as tickable checklist lines', () => {
    expect(formatSetupItems('sticky-checklist', ['Email Sam', 'Book venue'])).toBe(
      '[ ] Email Sam\n[ ] Book venue'
    )
  })

  it('does not double-prefix an item that already has a checkbox or bullet', () => {
    expect(formatSetupItems('sticky-checklist', ['[ ] already', '- bullet'])).toBe(
      '[ ] already\n[ ] bullet'
    )
  })

  it('formats notes, markdown and a card as bullet lines', () => {
    expect(formatSetupItems('note-lines', ['one', 'two'])).toBe('- one\n- two')
    expect(formatSetupItems('markdown-bullets', ['a', 'b'])).toBe('- a\n- b')
    expect(formatSetupItems('card-bullets', ['x'])).toBe('- x')
  })

  it('drops blank items and trims', () => {
    expect(formatSetupItems('note-lines', ['  keep  ', '', '   '])).toBe('- keep')
  })

  it('returns an empty string when there is nothing to add', () => {
    expect(formatSetupItems('sticky-checklist', [])).toBe('')
  })
})

describe('applyMindmapNodes — appends AI branches as root children in native JSON', () => {
  function rootChildren(json: string): Array<{ label: string; kind: string; children: unknown[] }> {
    return JSON.parse(json).root.children
  }

  it('appends new branches to an existing mind map, preserving prior children', () => {
    const existing = JSON.stringify({
      root: {
        id: 'root',
        label: 'Launch',
        kind: 'idea',
        children: [{ id: 'a', label: 'Existing', kind: 'idea', children: [] }]
      },
      selectedId: 'root',
      viewRootId: 'root'
    })
    const next = applyMindmapNodes(existing, ['Marketing', 'Pricing'])
    const kids = rootChildren(next)
    expect(kids.map((k) => k.label)).toEqual(['Existing', 'Marketing', 'Pricing'])
    // The original structure and selection are preserved.
    expect(JSON.parse(next).selectedId).toBe('root')
    expect(JSON.parse(next).root.label).toBe('Launch')
    // New nodes are well-formed mind-map nodes.
    expect(kids[1].kind).toBe('idea')
    expect(Array.isArray(kids[1].children)).toBe(true)
  })

  it('builds a valid tree from empty or malformed content', () => {
    for (const bad of ['', '   ', 'not json', '{}']) {
      const next = applyMindmapNodes(bad, ['One', 'Two'])
      const parsed = JSON.parse(next)
      expect(parsed.root).toBeTruthy()
      expect(rootChildren(next).map((k) => k.label)).toEqual(['One', 'Two'])
    }
  })

  it('gives every appended node a unique id', () => {
    const next = applyMindmapNodes('{}', ['a', 'b', 'c'])
    const ids = JSON.parse(next).root.children.map((k: { id: string }) => k.id)
    expect(new Set(ids).size).toBe(3)
  })
})
