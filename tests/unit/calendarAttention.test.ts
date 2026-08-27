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

describe('DEC-052 B3/B4 — the planner is preview-first, always', () => {
  const view = read('src/renderer/src/components/views/CalendarView.tsx')
  const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')

  it('proposals render as dashed GHOSTS; nothing books without Accept', () => {
    expect(grid).toContain('data-testid="plan-ghost"')
    expect(grid).toContain('border-dashed')
    expect(view).toContain('Nothing is booked until you accept')
    // The write happens only in acceptPlan, with the auto origin.
    expect(view).toContain("origin: 'auto'")
  })

  it('an accepted plan reverses as ONE undo unit', () => {
    expect(view).toContain('beginBatch()')
    expect(view).toContain('endBatch(`Planned ${proposals.length} blocks`)')
  })

  it('replan-undone marks missed (the record stays) and re-proposes — never moves', () => {
    expect(view).toContain("await updateBlock(b.id, { status: 'missed' })")
    // No startMs patch anywhere in the replan path: blocks are never moved.
    expect(view).not.toContain('updateBlock(b.id, { startMs')
  })

  it('the intent mode selects via IPC with a keyword floor; empty selection is honest', () => {
    expect(view).toContain('window.api.workItems.planSelect(intent, candidates)')
    const sel = read('src/main/ai/planSelect.ts')
    expect(sel).toContain('return fallback()')
    expect(sel).toContain('an empty selection is a valid answer')
  })
})

describe('DEC-053 — the calendar QA round (operator live QA)', () => {
  const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')
  const view = read('src/renderer/src/components/views/CalendarView.tsx')

  it('the clock is a 12-hour cycle, never military', () => {
    expect(grid).toContain("const mer = h < 12 ? 'AM' : 'PM'")
    expect(grid).not.toContain('`${START_HOUR + i}:00`')
  })

  it('drag-to-create selects a span at the 15-minute snap; a still press stays a click', () => {
    expect(grid).toContain('data-testid="drag-select"')
    expect(grid).toContain("if (!cur.moved || at === cur.anchorMs) {")
    expect(grid).toContain('initialDurationMin: durationMin')
    // The composer opens at exactly the dragged length.
    expect(grid).toContain('useState(initialDurationMin ?? 60)')
  })

  it("today is a raised column with a ring — not a purple wash", () => {
    expect(grid).toContain("'border-transparent bg-[var(--surface-raised)] ring-2 ring-[rgba(var(--accent),0.45)]'")
  })

  it('a block dragged onto the rail unschedules — locked blocks refuse', () => {
    expect(grid).toContain('onBlockDragOut(block, d.lastClientX, d.lastClientY)')
    expect(view).toContain('if (block.locked) return false')
    expect(view).toContain('Drop here to unschedule')
  })

  it('the class dropdown filters rail + deadlines + month; New opens capture', () => {
    expect(view).toContain('data-testid="calendar-class-filter"')
    expect(view).toContain("classFilter === 'all' || queueOf(i) === classFilter")
    expect(view).toContain("filterQueue={classFilter === 'all' ? undefined : classFilter}")
    expect(view).toContain('openConsole()')
  })

  it('the planner settings editor writes what the engine reads', () => {
    expect(view).toContain('data-testid="planner-settings"')
    expect(view).toContain('savePlannerSettings(next)')
    // runPlan re-reads persisted settings each run, so edits apply next plan.
    expect(view).toContain('const settings = loadPlannerSettings()')
  })
})
