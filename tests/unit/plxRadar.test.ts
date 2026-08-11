import { describe, it, expect } from 'vitest'
import { detectTaskRadar, detectMailRadar, detectCalendarRadar } from '../../src/renderer/src/lib/radar'
import type { FbNode, MailListItem, TimeBlock } from '../../src/shared/types'

// Pure tests for the workspace radar detectors over tasks, mail and calendar.

const DAY = 86_400_000
const MIN = 60_000
const NOW = 1_800_000_000_000

function task(over: Partial<FbNode> & { id: string }): FbNode {
  return { kind: 'task', title: 'A task', status: 'open', archived: false, dueDate: null, startedAt: null, ...over } as unknown as FbNode
}
function mail(over: Partial<MailListItem> & { uid: number }): MailListItem {
  return { fromName: 'Ana', fromAddress: 'ana@x.com', subject: 'Hi', date: NOW - MIN, seen: false, flagged: false, hasAttachments: false, messageId: null, inReplyTo: null, references: [], ...over } as MailListItem
}
function block(over: Partial<TimeBlock> & { id: string }): TimeBlock {
  return { title: 'Meeting', startMs: NOW + 10 * MIN, durationMin: 30, ...over } as unknown as TimeBlock
}

describe('detectTaskRadar', () => {
  it('flags overdue with a task nav target', () => {
    const r = detectTaskRadar([task({ id: '1', title: 'Draft', dueDate: NOW - 2 * DAY })], NOW)
    expect(r[0]).toMatchObject({ kind: 'overdue', nav: { view: 'task', taskId: '1' }, severity: 'warn' })
    expect(r[0].detail).toContain('2 days ago')
  })
  it('due-soon and stalled, overdue wins over stalled', () => {
    expect(detectTaskRadar([task({ id: '2', dueDate: NOW + DAY })], NOW)[0].kind).toBe('due_soon')
    expect(detectTaskRadar([task({ id: '3', status: 'in_progress', startedAt: NOW - 6 * DAY })], NOW)[0].kind).toBe('stalled')
    expect(detectTaskRadar([task({ id: '4', status: 'in_progress', startedAt: NOW - 9 * DAY, dueDate: NOW - DAY })], NOW)[0].kind).toBe('overdue')
  })
  it('skips done/parked/archived/folder/far-future', () => {
    const tasks = [
      task({ id: 'a', status: 'done', dueDate: NOW - DAY }),
      task({ id: 'b', archived: true, dueDate: NOW - DAY }),
      task({ id: 'c', kind: 'folder', dueDate: NOW - DAY } as Partial<FbNode> & { id: string }),
      task({ id: 'd', dueDate: NOW + 30 * DAY })
    ]
    expect(detectTaskRadar(tasks, NOW)).toEqual([])
  })
})

describe('detectMailRadar', () => {
  it('flags recent unread mail as reply-needed, with a mail nav target', () => {
    const r = detectMailRadar([mail({ uid: 7, fromName: 'Ben', subject: 'Q3 budget' })], NOW)
    expect(r[0]).toMatchObject({ kind: 'reply_needed', nav: { view: 'mail', uid: 7 } })
    expect(r[0].title).toContain('Ben')
    expect(r[0].detail).toContain('Q3 budget')
  })
  it('ignores read mail and mail older than a few days', () => {
    const r = detectMailRadar(
      [mail({ uid: 1, seen: true }), mail({ uid: 2, date: NOW - 10 * DAY }), mail({ uid: 3 })],
      NOW
    )
    expect(r.map((s) => (s.nav.view === 'mail' ? s.nav.uid : 0))).toEqual([3])
  })
})

describe('detectCalendarRadar', () => {
  it('flags a meeting starting within the hour', () => {
    const r = detectCalendarRadar([block({ id: 'm1', title: 'Standup', startMs: NOW + 20 * MIN })], NOW)
    expect(r[0]).toMatchObject({ kind: 'meeting_soon', nav: { view: 'calendar' }, severity: 'warn' })
    expect(r[0].title).toContain('Standup')
  })
  it('ignores meetings far out or long past', () => {
    const r = detectCalendarRadar(
      [block({ id: 'far', startMs: NOW + 5 * 3600_000 }), block({ id: 'past', startMs: NOW - 60 * MIN })],
      NOW
    )
    expect(r).toEqual([])
  })
})
