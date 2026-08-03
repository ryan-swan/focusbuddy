import { describe, it, expect } from 'vitest'
import { formatSetupItems, applyMindmapNodes, applyDiagramNodes } from '../../src/renderer/src/lib/widgetSetup'

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

describe('applyDiagramNodes — appends AI nodes as native React-Flow shape nodes', () => {
  it('appends shape nodes with labels, preserving existing nodes and edges', () => {
    const existing = JSON.stringify({
      nodes: [{ id: 'a', type: 'shape', position: { x: 0, y: 0 }, data: { label: 'Start', shape: 'rounded', color: '#fff' } }],
      edges: [{ id: 'e1', source: 'a', target: 'a' }]
    })
    const next = JSON.parse(applyDiagramNodes(existing, ['Plan', 'Build', 'Ship']))
    expect(next.nodes.map((n: { data: { label: string } }) => n.data.label)).toEqual(['Start', 'Plan', 'Build', 'Ship'])
    expect(next.edges).toHaveLength(1) // edges preserved
    // Appended nodes are well-formed shape nodes with a position and unique ids.
    const appended = next.nodes.slice(1)
    expect(appended.every((n: { type: string; position: { x: number } }) => n.type === 'shape' && typeof n.position.x === 'number')).toBe(true)
    const ids = next.nodes.map((n: { id: string }) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds a valid graph from empty or malformed content', () => {
    for (const bad of ['', 'not json', '{}']) {
      const next = JSON.parse(applyDiagramNodes(bad, ['One', 'Two']))
      expect(next.nodes.map((n: { data: { label: string } }) => n.data.label)).toEqual(['One', 'Two'])
      expect(Array.isArray(next.edges)).toBe(true)
    }
  })
})
