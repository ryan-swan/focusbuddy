import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// DEC-052 Track A — the calendar tells the truth. These pins hold the
// rewiring facts that made the old surface unused (GAP-007/A-006): a calendar
// that could not see Attention work, ranked by a second scorer, with a drop
// receiver nothing could reach.

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8')

describe('CalendarView — rewired to the Attention layer', () => {
  const view = read('src/renderer/src/components/views/CalendarView.tsx')

  it('reads work items and ranks with the SAME ranker as the queues', () => {
    expect(view).toContain('useWorkItemStore')
    expect(view).toContain('rankScore')
    // The second-ranker drift risk named in Analysis 24 §4, closed — no
    // import and no call (the word may appear in prose comments):
    expect(view).not.toContain('priorityScore(')
    expect(view).not.toContain("from '../../lib/dashboardScope'")
  })

  it('offers day / 3-day / week / month, persisted', () => {
    expect(view).toContain("{ day: 1, '3day': 3, week: 7 }")
    expect(view).toContain("localStorage.getItem('calendar.mode')")
  })

  it('the queue rail drags with the shared payload; scheduled items sink, never hide', () => {
    expect(view).toContain("e.dataTransfer.setData('text/fb-workitem', i.id)")
    // A future-planned block marks the item placed…
    expect(view).toContain("b.status === 'planned' && b.startMs + b.durationMin * 60000 > nowMs")
    // …which SORTS it down rather than filtering it out.
    expect(view).toContain('if (as !== bs) return as - bs')
  })

  it('a month-cell drop sets the DUE date (month is the deadlines lens)', () => {
    expect(view).toContain('void updateFields(id, { dueAt: iso })')
  })
})

describe('WeekTimeGrid — one grid, parameterised', () => {
  const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')

  it('renders 1/3/7 days and a compact rail mode from the same component', () => {
    expect(grid).toContain('days = 7')
    expect(grid).toContain('compact = false')
    expect(grid).toContain('repeat(${days}, minmax(0, 1fr))')
    expect(grid).toContain("const hourPx = compact ? 30 : HOUR_PX")
  })

  it('resolves a block to a WORK ITEM through its own store, not listNodes', () => {
    // listNodes filters work items out by design (S1 pin) — the grid must not
    // route around that by widening it.
    expect(grid).toContain('useWorkItemStore')
    expect(grid).toContain('nodesById.get(block.taskId) ?? itemsById.get(block.taskId)')
  })

  it('dropping an Attention item books it immediately — no composer stop', () => {
    expect(grid).toContain("e.dataTransfer.getData('text/fb-workitem')")
    expect(grid).toContain("void createBlock({ taskId: itemId, title: '', startMs, durationMin: 30 })")
  })

  it('deadlines render as a band ABOVE the grid, distinct from blocks', () => {
    expect(grid).toContain('data-testid="deadline-band"')
    // Active items only — a closed item leaves the band.
    expect(grid).toContain('isTerminalState(i.workItemState)')
  })
})

describe('the surfaces share the one grid (DEC-052 §0)', () => {
  it('the Attention rail embeds the SAME component narrow', () => {
    const blocks = read('src/renderer/src/components/attention/attentionBlocks.tsx')
    expect(blocks).toContain("import WeekTimeGrid from '../views/WeekTimeGrid'")
    expect(blocks).toContain('days={1}')
    expect(blocks).toContain('data-testid="rail-day-grid"')
  })

  it('queue rows publish the payload the grids accept', () => {
    const att = read('src/renderer/src/components/views/AttentionView.tsx')
    expect(att).toContain("e.dataTransfer.setData('text/fb-workitem', i.id)")
  })

  it('Calendar returned to the rail — both states, capability-gated', () => {
    const sidebar = read('src/renderer/src/components/Sidebar.tsx')
    const rows = sidebar.match(/label="Calendar"/g) ?? []
    expect(rows.length).toBe(2)
    expect(sidebar.match(/viewEnabled\('calendar'\)/g)?.length).toBe(2)
  })
})

describe('DEC-052 foundation — the columns the planner and connector need', () => {
  const db = read('src/main/db/database.ts')
  const tb = read('src/main/db/timeBlocks.ts')

  it('time_blocks carries origin/locked/push_policy and the external round-trip set', () => {
    for (const col of [
      "'origin', \"TEXT NOT NULL DEFAULT 'manual'\"",
      "'locked', 'INTEGER NOT NULL DEFAULT 0'",
      "'push_policy', \"TEXT NOT NULL DEFAULT 'local'\"",
      "'external_event_id', 'TEXT'",
      "'external_etag', 'TEXT'",
      "'sync_state', 'TEXT'"
    ])
      expect(db).toContain(col)
  })

  it('the status CHECK is dropped by a DYNAMIC rebuild that keeps live columns + the FK', () => {
    expect(db).toContain('function migrateTimeBlocksStatusCheck')
    expect(db).toContain("PRAGMA table_info(time_blocks)")
    expect(db).toContain("if (c.name === 'task_id') return 'task_id TEXT REFERENCES nodes(id) ON DELETE CASCADE'")
  })

  it('origin is a birth fact; locked and pushPolicy are patchable', () => {
    expect(tb).toContain("origin: draft.origin === 'auto' ? 'auto' : 'manual'")
    expect(tb).toContain("['locked', 'locked'")
    expect(tb).toContain("['pushPolicy', 'push_policy'")
    // origin is deliberately absent from the patch column table.
    expect(tb).not.toContain("['origin'")
  })
})
