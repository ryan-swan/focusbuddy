import { describe, it, expect, vi, beforeEach } from 'vitest'
import { warmCache } from '../../src/renderer/src/lib/liveDeskResolvers'
import type { Widget } from '../../src/shared/types'

// The projection builder is pure and synchronous, which is what makes its
// disclosure rules testable. Anything needing IPC therefore has to be fetched
// first and read from a cache during the build. This is that fetch.
//
// The rule it has to hold to: a body that will not load stays a placeholder.
// Publishing an empty table that looks like a real empty table would be a
// quieter failure than publishing "not available", and a worse one.

function widget(kind: string, content: string): Widget {
  return { id: `w_${kind}`, taskId: 'desk_1', kind, title: '', content, x: 0, y: 0, width: 10, height: 10 } as unknown as Widget
}

const api = {
  tables: {
    get: vi.fn(),
    listRows: vi.fn()
  },
  documents: { get: vi.fn() }
}
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as unknown as { window: unknown }).window = { api }
})

describe('warmCache — table bodies', () => {
  it('maps columns and cells into the public shape', async () => {
    api.tables.get.mockResolvedValue({
      schema: { columns: [{ id: 'c1', label: 'Name', type: 'text' }, { id: 'c2', label: 'Done', type: 'checkbox' }] }
    })
    api.tables.listRows.mockResolvedValue([{ id: 'r1', cells: { c1: 'Ada', c2: true } }])
    const cache = new Map<string, unknown>()
    const learned = await warmCache([widget('table', 'tbl_1')], cache)
    expect(learned).toBe(true)
    expect(cache.get('t:tbl_1')).toEqual({
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Done', kind: 'checkbox' }
      ],
      rows: [{ id: 'r1', cells: ['Ada', true] }],
      truncated: false
    })
  })

  it('drops cell values that are not scalars rather than serialising objects', async () => {
    // An object cell could carry anything, including references the public
    // projection has no policy for.
    api.tables.get.mockResolvedValue({ schema: { columns: [{ id: 'c1', label: 'Ref', type: 'relation' }] } })
    api.tables.listRows.mockResolvedValue([{ id: 'r1', cells: { c1: { secret: 'x' } } }])
    const cache = new Map<string, unknown>()
    await warmCache([widget('table', 'tbl_2')], cache)
    expect(JSON.stringify(cache.get('t:tbl_2'))).not.toContain('secret')
    expect((cache.get('t:tbl_2') as { rows: { cells: unknown[] }[] }).rows[0].cells).toEqual([null])
  })

  it('leaves a missing table uncached, so it publishes as a placeholder', async () => {
    api.tables.get.mockResolvedValue(null)
    api.tables.listRows.mockResolvedValue([])
    const cache = new Map<string, unknown>()
    expect(await warmCache([widget('table', 'gone')], cache)).toBe(false)
    expect(cache.has('t:gone')).toBe(false)
  })

  it('survives a rejected fetch without failing the publish', async () => {
    api.tables.get.mockRejectedValue(new Error('db closed'))
    api.tables.listRows.mockRejectedValue(new Error('db closed'))
    const cache = new Map<string, unknown>()
    await expect(warmCache([widget('table', 'boom')], cache)).resolves.toBe(false)
  })
})

describe('warmCache — documents', () => {
  it('skips archived documents', async () => {
    api.documents.get.mockResolvedValue({ archived: true, body: { type: 'doc', content: [] } })
    const cache = new Map<string, unknown>()
    await warmCache([widget('doc', 'doc_1')], cache)
    expect(cache.has('d:doc_1')).toBe(false)
  })

  it('maps a sheet body into the table shape', async () => {
    api.documents.get.mockResolvedValue({
      archived: false,
      body: { columns: ['A', 'B'], rows: [['1', '2']] }
    })
    const cache = new Map<string, unknown>()
    await warmCache([widget('sheet', 'sheet_1')], cache)
    expect(cache.get('t:sheet_1')).toEqual({
      columns: [
        { id: 'c0', name: 'A', kind: 'text' },
        { id: 'c1', name: 'B', kind: 'text' }
      ],
      rows: [{ id: 'r0', cells: ['1', '2'] }],
      truncated: false
    })
  })

  it('does not refetch a body it already holds', async () => {
    api.documents.get.mockResolvedValue({ archived: false, body: { columns: [], rows: [] } })
    const cache = new Map<string, unknown>([['t:sheet_2', { columns: [], rows: [], truncated: false }]])
    await warmCache([widget('sheet', 'sheet_2')], cache)
    expect(api.documents.get).not.toHaveBeenCalled()
  })
})
