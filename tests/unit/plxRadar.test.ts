import { describe, it, expect } from 'vitest'
import { detectTaskRadar } from '../../src/renderer/src/lib/radar'
import type { FbNode } from '../../src/shared/types'

// Pure tests for the workspace radar detectors.

const DAY = 86_400_000
const NOW = 1_800_000_000_000

function task(over: Partial<FbNode> & { id: string }): FbNode {
  return {
    kind: 'task',
    title: 'A task',
    status: 'open',
    archived: false,
    dueDate: null,
    startedAt: null,
    ...over
  } as unknown as FbNode
}

describe('detectTaskRadar', () => {
  it('flags an overdue task with how long ago it was due', () => {
    const r = detectTaskRadar([task({ id: '1', title: 'Draft brief', dueDate: NOW - 2 * DAY })], NOW)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'overdue:1', kind: 'overdue', taskId: '1', severity: 'warn' })
    expect(r[0].title).toContain('Draft brief')
    expect(r[0].detail).toContain('2 days ago')
  })

  it('flags a due-soon task (within 2 days) as info', () => {
    const r = detectTaskRadar([task({ id: '2', dueDate: NOW + DAY })], NOW)
    expect(r[0]).toMatchObject({ id: 'due_soon:2', kind: 'due_soon', severity: 'info' })
    expect(r[0].title).toContain('tomorrow')
  })

  it('flags a stalled in-progress task with no due date', () => {
    const r = detectTaskRadar([task({ id: '3', status: 'in_progress', startedAt: NOW - 6 * DAY })], NOW)
    expect(r[0]).toMatchObject({ id: 'stalled:3', kind: 'stalled' })
  })

  it('overdue wins over stalled for a task that is both', () => {
    const r = detectTaskRadar([task({ id: '4', status: 'in_progress', startedAt: NOW - 9 * DAY, dueDate: NOW - DAY })], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('overdue')
  })

  it('skips done, parked, archived, far-future, and non-task nodes', () => {
    const tasks = [
      task({ id: 'a', status: 'done', dueDate: NOW - DAY }),
      task({ id: 'b', status: 'parked', dueDate: NOW - DAY }),
      task({ id: 'c', archived: true, dueDate: NOW - DAY }),
      task({ id: 'd', dueDate: NOW + 30 * DAY }), // far future, not due-soon
      task({ id: 'e', kind: 'folder', dueDate: NOW - DAY } as Partial<FbNode> & { id: string }),
      task({ id: 'f', status: 'in_progress', startedAt: NOW - 2 * DAY }) // in progress but not stalled yet
    ]
    expect(detectTaskRadar(tasks, NOW)).toEqual([])
  })

  it('sorts overdue first and caps the list at 8', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task({ id: `s${i}`, dueDate: NOW + DAY })), // due-soon
      ...Array.from({ length: 6 }, (_, i) => task({ id: `o${i}`, dueDate: NOW - DAY })) // overdue
    ]
    const r = detectTaskRadar(tasks, NOW)
    expect(r).toHaveLength(8)
    expect(r.slice(0, 6).every((s) => s.kind === 'overdue')).toBe(true) // overdue leads
  })
})
