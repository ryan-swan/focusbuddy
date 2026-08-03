import { describe, it, expect } from 'vitest'
import {
  hasChecklist,
  toggleCheckLine,
  toggleChecklist,
  splitStickyBlocks
} from '../../src/renderer/src/lib/stickyText'

describe('stickyText', () => {
  it('detects a checklist body', () => {
    expect(hasChecklist('[ ] buy milk\n[x] walk dog')).toBe(true)
    expect(hasChecklist('just a plain note')).toBe(false)
  })

  it('ticks a line and the ticked state survives a content round-trip (the reload acceptance)', () => {
    const body = '[ ] one\n[ ] two\n[ ] three'
    // Tick lines two and three (indices 1 and 2), as a user would.
    let next = toggleCheckLine(body, 1)
    next = toggleCheckLine(next, 2)
    // This string is exactly what gets persisted to widget.content and reloaded.
    expect(next).toBe('[ ] one\n[x] two\n[x] three')
    // Reloading parses the same string, so the two stay ticked.
    expect(hasChecklist(next)).toBe(true)
    expect(next.split('\n').filter((l) => /^\[x\]/i.test(l))).toHaveLength(2)
  })

  it('untoggles a done line back to open', () => {
    expect(toggleCheckLine('[x] done', 0)).toBe('[ ] done')
  })

  it('leaves non-checklist lines untouched when toggling by index', () => {
    expect(toggleCheckLine('plain line', 0)).toBe('plain line')
  })

  it('converts a plain body into a checklist and back', () => {
    const plain = 'buy milk\nwalk dog'
    const checked = toggleChecklist(plain)
    expect(checked).toBe('[ ] buy milk\n[ ] walk dog')
    // Toggling again strips the boxes.
    expect(toggleChecklist(checked)).toBe('buy milk\nwalk dog')
  })

  it('replaces a leading bullet with a checkbox rather than stacking them', () => {
    expect(toggleChecklist('- task a\n- task b')).toBe('[ ] task a\n[ ] task b')
  })

  it('preserves blank lines when converting', () => {
    expect(toggleChecklist('a\n\nb')).toBe('[ ] a\n\n[ ] b')
  })
})

describe('splitStickyBlocks (markdown tables in stickies)', () => {
  it('parses a pasted markdown table into a table block with headers and rows', () => {
    const text = '| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |'
    const blocks = splitStickyBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      type: 'table',
      headers: ['Name', 'Age'],
      rows: [
        ['Alice', '30'],
        ['Bob', '25']
      ]
    })
  })

  it('keeps surrounding lines as line blocks and a table in the middle', () => {
    const text = 'before\n| A | B |\n| --- | --- |\n| 1 | 2 |\nafter'
    const blocks = splitStickyBlocks(text)
    expect(blocks.map((b) => b.type)).toEqual(['line', 'table', 'line'])
    expect(blocks[0]).toEqual({ type: 'line', text: 'before', index: 0 })
    // "after" is line index 4 in the original text — checkbox toggling relies on this.
    expect(blocks[2]).toEqual({ type: 'line', text: 'after', index: 4 })
  })

  it('preserves the original line index for a checkbox after a table', () => {
    const text = '| H |\n|---|\n| x |\n[ ] task'
    const blocks = splitStickyBlocks(text)
    const line = blocks.find((b) => b.type === 'line') as { type: 'line'; text: string; index: number }
    expect(line.text).toBe('[ ] task')
    expect(line.index).toBe(3)
  })

  it('does not treat a lone pipe line or a header without a separator as a table', () => {
    expect(splitStickyBlocks('| just one row |').every((b) => b.type === 'line')).toBe(true)
    expect(splitStickyBlocks('a | b | c').every((b) => b.type === 'line')).toBe(true)
  })

  it('accepts colon-aligned separators', () => {
    const text = '| L | R |\n|:--|--:|\n| 1 | 2 |'
    const blocks = splitStickyBlocks(text)
    expect(blocks[0].type).toBe('table')
  })

  it('parses the real 5-column competitor table (the exact pasted case)', () => {
    const text = [
      '| Competitor | Category | Price | What they own | What they lack vs Haptyx |',
      '|---|---|---|---|---|',
      '| Sunsama | Daily planner ritual | $20/mo ($16 annual) | Calm guided planning | No canvas, no macros, no spatial context, work happens elsewhere |',
      '| Akiflow | Task consolidation + calendar | $19–34/mo | Universal task inbox | Same — it schedules work, doesn’t host it |',
      '| Notion | Docs/database everything | $0–15/seat | Ubiquity, templates | Pages not space; notorious ADHD trap (organising > doing) |'
    ].join('\n')
    const blocks = splitStickyBlocks(text)
    expect(blocks).toHaveLength(1)
    const t = blocks[0]
    expect(t.type).toBe('table')
    if (t.type !== 'table') return
    expect(t.headers).toEqual([
      'Competitor',
      'Category',
      'Price',
      'What they own',
      'What they lack vs Haptyx'
    ])
    expect(t.rows).toHaveLength(3)
    // Every body row keeps all five columns — the prices with their own
    // parentheses and the comma-heavy "what they lack" cell stay intact.
    expect(t.rows.every((r) => r.length === 5)).toBe(true)
    expect(t.rows[0][2]).toBe('$20/mo ($16 annual)')
    expect(t.rows[0][4]).toBe('No canvas, no macros, no spatial context, work happens elsewhere')
    expect(t.rows[1][0]).toBe('Akiflow')
  })
})
