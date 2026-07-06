import { describe, it, expect } from 'vitest'
import { tableToText, noteWidgetText } from '../../src/main/workspaceExtras'
import type { FbTable, FbRow } from '../../src/shared/fields'

describe('tableToText', () => {
  it('flattens title, headers and row cell values into searchable text', () => {
    const table = {
      id: 't1',
      title: 'Launch Tasks',
      schema: { columns: [
        { id: 'c-task', type: 'text-short', label: 'Task', config: {} },
        { id: 'c-owner', type: 'text-short', label: 'Owner', config: {} }
      ] }
    } as unknown as FbTable
    const rows = [
      { id: 'r1', cells: { 'c-task': 'Ship landing page', 'c-owner': 'Angie' } },
      { id: 'r2', cells: { 'c-task': 'Record demo', 'c-owner': 'Sam' } }
    ] as unknown as FbRow[]
    const text = tableToText(table, rows)
    expect(text).toContain('Launch Tasks')
    expect(text).toContain('Task | Owner')
    expect(text).toContain('Ship landing page | Angie')
    expect(text).toContain('Record demo | Sam')
  })

  it('handles array and object cell values without crashing', () => {
    const table = { id: 't', title: 'T', schema: { columns: [{ id: 'c', type: 'multi-select', label: 'Tags', config: {} }] } } as unknown as FbTable
    const rows = [{ id: 'r', cells: { c: ['a', 'b'] } }] as unknown as FbRow[]
    expect(tableToText(table, rows)).toContain('a b')
  })
})

describe('noteWidgetText', () => {
  it('returns plain content for note/sticky/markdown', () => {
    expect(noteWidgetText('markdown', '# Hello')).toBe('# Hello')
    expect(noteWidgetText('sticky', 'buy milk')).toBe('buy milk')
  })
  it('extracts text from a page widgets Tiptap JSON', () => {
    const doc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meeting notes here' }] }] })
    expect(noteWidgetText('page', doc)).toContain('Meeting notes here')
  })
  it('falls back to raw content when a page body is not valid JSON', () => {
    expect(noteWidgetText('page', 'not json')).toBe('not json')
  })
})
