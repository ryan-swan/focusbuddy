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
  return { id: `w_${kind}`, taskId: DESK, kind, title: '', content, x: 0, y: 0, width: 10, height: 10 } as unknown as Widget
}

const DESK = 'desk_1'

const api = {
  tables: {
    get: vi.fn(),
    listRows: vi.fn()
  },
  documents: { get: vi.fn() },
  // Asset-bearing kinds upload through this; unrelated to the cases here,
  // but it must exist or the resolver throws before reaching them.
  liveDesk: { uploadAsset: vi.fn().mockResolvedValue({ ok: true }) },
  files: { read: vi.fn().mockResolvedValue(null), get: vi.fn().mockResolvedValue(null) }
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
    const learned = await warmCache(DESK, [widget('table', 'tbl_1')], cache)
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
    await warmCache(DESK, [widget('table', 'tbl_2')], cache)
    expect(JSON.stringify(cache.get('t:tbl_2'))).not.toContain('secret')
    expect((cache.get('t:tbl_2') as { rows: { cells: unknown[] }[] }).rows[0].cells).toEqual([null])
  })

  it('leaves a missing table uncached, so it publishes as a placeholder', async () => {
    api.tables.get.mockResolvedValue(null)
    api.tables.listRows.mockResolvedValue([])
    const cache = new Map<string, unknown>()
    expect(await warmCache(DESK, [widget('table', 'gone')], cache)).toBe(false)
    expect(cache.has('t:gone')).toBe(false)
  })

  it('survives a rejected fetch without failing the publish', async () => {
    api.tables.get.mockRejectedValue(new Error('db closed'))
    api.tables.listRows.mockRejectedValue(new Error('db closed'))
    const cache = new Map<string, unknown>()
    await expect(warmCache(DESK, [widget('table', 'boom')], cache)).resolves.toBe(false)
  })
})

describe('warmCache — documents', () => {
  it('skips archived documents', async () => {
    api.documents.get.mockResolvedValue({ archived: true, body: { type: 'doc', content: [] } })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('doc', 'doc_1')], cache)
    expect(cache.has('d:doc_1')).toBe(false)
  })

  it('maps a sheet body into the table shape', async () => {
    api.documents.get.mockResolvedValue({
      archived: false,
      body: { columns: ['A', 'B'], rows: [['1', '2']] }
    })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('sheet', 'sheet_1')], cache)
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
    await warmCache(DESK, [widget('sheet', 'sheet_2')], cache)
    expect(api.documents.get).not.toHaveBeenCalled()
  })
})


// The desk rendered as empty frames saying "image not published" and "mind map
// not published", because these two families never resolved: assets were never
// uploaded and graphs were never read. Both fall back to a placeholder when
// they genuinely cannot be published, which is right -- but they must not fall
// back when the content is perfectly publishable.

describe('warmCache — assets', () => {
  it('uploads a local image and remembers the asset', async () => {
    const png = new Uint8Array([137, 80, 78, 71])
    api.files.read.mockResolvedValue({ mimeType: 'image/png', buffer: png.buffer })
    api.liveDesk.uploadAsset.mockResolvedValue({ ok: true })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('image', 'fb-file://abc123')], cache)
    expect(api.liveDesk.uploadAsset).toHaveBeenCalledOnce()
    const entry = cache.get('a:fb-file://abc123') as { assetId: string; mime: string }
    expect(entry.mime).toBe('image/png')
    expect(entry.assetId).toMatch(/^a/)
  })

  it('refuses a type the public viewer cannot render', async () => {
    // The server would reject it anyway; better a placeholder than a failed
    // upload and a broken image.
    api.files.read.mockResolvedValue({ mimeType: 'application/x-msdownload', buffer: new Uint8Array([1]).buffer })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('image', 'fb-file://bad')], cache)
    expect(api.liveDesk.uploadAsset).not.toHaveBeenCalled()
    expect(cache.has('a:fb-file://bad')).toBe(false)
  })

  it('refuses a file past the size ceiling', async () => {
    api.files.read.mockResolvedValue({
      mimeType: 'video/mp4',
      buffer: new Uint8Array(26 * 1024 * 1024).buffer
    })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('video', 'fb-file://huge')], cache)
    expect(api.liveDesk.uploadAsset).not.toHaveBeenCalled()
  })

  it('does not re-upload bytes it has already published', async () => {
    const cache = new Map<string, unknown>([['a:fb-file://seen', { assetId: 'a1' }]])
    await warmCache(DESK, [widget('image', 'fb-file://seen')], cache)
    expect(api.liveDesk.uploadAsset).not.toHaveBeenCalled()
  })

  it('leaves the widget a placeholder when the upload is rejected', async () => {
    api.files.read.mockResolvedValue({ mimeType: 'image/png', buffer: new Uint8Array([1]).buffer })
    api.liveDesk.uploadAsset.mockResolvedValue({ ok: false, error: 'too many assets' })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('image', 'fb-file://rejected')], cache)
    expect(cache.has('a:fb-file://rejected')).toBe(false)
  })
})

describe('warmCache — graphs', () => {
  it('flattens a mind map tree into nodes and edges', async () => {
    const content = JSON.stringify({
      root: { id: 'r', label: 'Root', children: [{ id: 'a', label: 'A', children: [] }, { id: 'b', label: 'B' }] }
    })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('mindmap', content)], cache)
    const g = cache.get(`g:${content}`) as { nodes: unknown[]; edges: { from: string; to: string }[] }
    expect(g.nodes).toHaveLength(3)
    expect(g.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['r->a', 'r->b'])
  })

  it('keeps a diagram\'s own positions', async () => {
    const content = JSON.stringify({
      nodes: [{ id: 'n1', position: { x: 40, y: 90 }, data: { label: 'Start' } }],
      edges: []
    })
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('diagram', content)], cache)
    const g = cache.get(`g:${content}`) as { nodes: { x: number; y: number; label: string }[] }
    expect(g.nodes[0]).toEqual({ id: 'n1', label: 'Start', x: 40, y: 90 })
  })

  it('leaves an unparseable graph as a placeholder', async () => {
    const cache = new Map<string, unknown>()
    await warmCache(DESK, [widget('mindmap', 'not json')], cache)
    expect(cache.get('g:not json') ?? null).toBeNull()
  })
})
