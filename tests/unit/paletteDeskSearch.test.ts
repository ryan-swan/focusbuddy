import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Two reported search defects, one cause each.
//
// "New desks are not immediately searchable." Desk results came only from the
// in-memory store when the query was EMPTY; the moment you typed, node results
// were owned by the main process deep search, which reads an index written
// after the fact. So a desk created seconds ago could not be found by its own
// exact title -- which is exactly when someone searches for it. The store is
// updated synchronously on create and rename, so the palette now matches it
// directly and there is no index to keep transactional.
//
// "Duplicate desk names are ambiguous." Two desks called "Plexii Marketing",
// one with five objects and one with ten, were two identical rows. Rows for an
// ambiguous name now carry the room, the status and the object count -- and
// only those rows, so the common case stays a clean single-line hint.

const ROOT = join(__dirname, '..', '..', 'src')
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('command palette — finding desks', () => {
  const src = read('renderer/src/components/CommandCenter.tsx')

  it('matches the live node store on a non-empty query', () => {
    expect(src).toContain('Desks and rooms straight from the in-memory store')
    // The guard that used to exclude nodes from a typed query.
    const block = src.slice(src.indexOf('Desks and rooms straight from the in-memory store'))
    expect(block.slice(0, 900)).toContain("if (q !== '')")
    expect(block.slice(0, 1600)).toContain('matchScore(n.title')
  })

  it('deduplicates against deep search rather than double-listing', () => {
    const block = src.slice(src.indexOf('Desks and rooms straight from the in-memory store'))
    expect(block.slice(0, 1200)).toContain('const seen = new Set(deepHits.map')
    expect(block.slice(0, 1600)).toMatch(/if \(seen\.has\(/)
  })

  it('disambiguates only the rows that are actually ambiguous', () => {
    const block = src.slice(src.indexOf('Desks and rooms straight from the in-memory store'))
    const window = block.slice(0, 2600)
    expect(window).toContain('const duplicate =')
    expect(window).toContain('if (duplicate) {')
    // Room, status and object count — the three the report asked for.
    expect(window).toContain('parts.push(room)')
    expect(window).toMatch(/parts\.push\(String\(n\.status\)/)
    expect(window).toMatch(/object\$\{count === 1/)
  })

  it('counts objects only for ambiguous desks', () => {
    // Counting every desk on every keystroke would be the wrong fix.
    expect(src).toContain('const ambiguous = [...byTitle.values()].filter((ids) => ids.length > 1)')
    expect(src).toContain('if (ambiguous.length === 0)')
  })
})

describe('object counts are one grouped query', () => {
  it('exists end to end: db, ipc handler, preload bridge', () => {
    expect(read('main/db/widgets.ts')).toContain('export function widgetCountsByTask')
    expect(read('main/db/widgets.ts')).toContain('GROUP BY task_id')
    expect(read('main/ipc/index.ts')).toContain("ipcMain.handle('widgets:countsByTask'")
    expect(read('preload/index.ts')).toContain("ipcRenderer.invoke('widgets:countsByTask', taskIds)")
  })

  it('excludes trashed widgets, so a count matches what the desk shows', () => {
    const fn = read('main/db/widgets.ts')
    const body = fn.slice(fn.indexOf('export function widgetCountsByTask'))
    expect(body.slice(0, 900)).toContain('trashed_at IS NULL')
  })
})
