// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const row = read('src/renderer/src/components/attention/CalendarBlockRow.tsx')
const blocks = read('src/renderer/src/components/attention/attentionBlocks.tsx')
const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')
const edit = read('src/renderer/src/lib/blockEdit.ts')

// DEC-129 — "the same for the meeting and calendar items": the Today tile's
// calendar blocks (meetings, focus time) and its dated work get the DEC-128
// depths — title + time at rest, one click opens the summary and the
// calendar's own doors in place, a double-click opens the block's full dialog
// over the page you are on. No click is a trip to a page.

describe('dec_129 — a calendar block as a widget row', () => {
  it('at rest: the camera or the clock, the title, the start time; live pulses, done / missed / skipped show', () => {
    expect(row).toContain("name={isMeeting ? 'videocam' : 'schedule'}")
    expect(row).toContain("const title = block.title || (isMeeting ? 'Meeting' : 'Focus time')")
    expect(row).toContain('const live = block.startMs <= nowMs && !ended')
    expect(row).toContain('title="Happening now"')
    expect(row).toContain("status === 'done' ? (")
    expect(row).toContain('onClick={() => setOpen((o) => !o)}')
    expect(row).toContain('data-testid={`block-row-toggle-${block.id}`}')
  })

  it('one click: when, the agenda, the chips (status · where · location · invited · linked · repeats · pinned · Record · last time)', () => {
    expect(row).toContain('data-testid={`block-row-open-${block.id}`}')
    // one "when" line — the Meet items' own wording, range included (a
    // separate range beside it read twice on the live tile)
    expect(row).toContain('{formatMeetWhen(block.startMs, block.durationMin, nowMs)}')
    expect(row).not.toContain('fmtTimeRange(')
    expect(row).toContain('{meeting?.agenda && (')
    expect(row).toContain("{meeting.joinUrl ? meetProviderLabel(meeting.joinUrl) : 'Plexii room'}")
    expect(row).toContain('{meeting.invitees.length} invited')
    expect(row).toContain('data-testid="block-row-linked"')
    expect(row).toContain('{block.recurrence && (')
    expect(row).toContain('{block.locked && (')
    expect(row).toContain('data-testid="block-row-record"')
    expect(row).toContain('meetings.find((m) => m.blockId === block.id)')
    expect(row).toContain('data-testid="block-row-last-time"')
    // the meetings list loads the first time a row opens, never on tile mount
    expect(row).toContain('if (open && !meetingsLoaded) void loadMeetings()')
  })

  it("the actions are the calendar's own doors: Join (external wins), Record external, Start, Done, Skip, Open, Delete, the page", () => {
    expect(row).toContain('data-testid={`block-row-actions-${block.id}`}')
    expect(row).toContain('if (ext) void window.api.files.openExternal(ext)')
    expect(row).toContain("void joinMeetingRoom(meeting.roomId, block.title || 'Meeting', {")
    expect(row).toContain('data-testid="block-row-join"')
    expect(row).toContain('void useGuestCaptureStore.getState().start({')
    expect(row).toContain("void startSession(block.taskId, block.durationMin * 60, 'planned')")
    expect(row).toContain('futuristicPowerOn()')
    expect(row).toContain("onClick={() => setStatus('done')}")
    expect(row).toContain("onClick={() => setStatus('skipped')}")
    expect(row).toContain("onClick={() => setStatus('planned')}")
    expect(row).toContain('onClick={() => void removeBlock(block.id)}')
    expect(row).toContain('data-testid={`block-row-page-${block.id}`}')
    expect(row).toContain('onClick={goCalendar}')
    // the grid's rule for what can be started
    expect(row).toContain("const isTaskBlock = !block.taskId || linked?.kind === 'task'")
  })

  it("double-click: the calendar's own BookTimeDialog in edit mode, portalled to <body>, saving through the shared helper", () => {
    expect(row).toContain("if ((e.target as HTMLElement).closest('[data-row-action]')) return\n        setEditing(true)")
    expect(row).toContain('createPortal(\n          <BookTimeDialog')
    expect(row).toContain('editBlock={block}')
    expect(row).toContain('await saveBlockEdit(block, patch)')
    expect(row).toContain('document.body')
  })
})

describe('dec_129 — the Today tile is made of rows; the grid shares the save', () => {
  it('the compact Today tile renders CalendarBlockRow for blocks and WidgetItemRow for dated work; MiniRow is gone', () => {
    expect(blocks).toContain("import { CalendarBlockRow } from './CalendarBlockRow'")
    expect(blocks).toContain("import { WidgetItemRow } from './WidgetItemRow'")
    expect(blocks).toContain('<CalendarBlockRow key={`ev:${e.id}`} block={block} nowMs={nowMs} />')
    expect(blocks).toContain('return <WidgetItemRow key={`it:${e.id}`} i={e.item} dense nowMs={nowMs} />')
    expect(blocks).toContain('data-testid="agenda-rows"')
    expect(blocks).not.toContain('function MiniRow(')
    expect(blocks).not.toContain('onClick={goCalendar}\n                className="w-full flex items-center gap-2 py-1 text-left fb-press min-w-0"')
    // real blocks in state — the row needs every field, not the analytics shape
    expect(blocks).toContain('const [blocks, setBlocks] = useState<TimeBlock[]>([])')
    // the rail's day grid (the full variant) is untouched
    expect(blocks).toContain('data-testid="rail-day-grid"')
  })

  it('the Overdue radar rows are widget rows too', () => {
    expect(blocks).toContain('<WidgetItemRow key={i.id} i={i} dense nowMs={nowMs} />')
  })

  it('saving an edited block is one helper — the grid delegates, the toast, undo and redo are unchanged', () => {
    expect(edit).toContain('export async function saveBlockEdit(prev: TimeBlock, patch: TimeBlockPatch): Promise<void> {')
    expect(edit).toContain('useActionHistory.getState().recordWithToast({')
    expect(edit).toContain('meeting: prev.meeting ?? null')
    expect(grid).toContain("import { saveBlockEdit } from '../../lib/blockEdit'")
    expect(grid).toContain('await saveBlockEdit(prev, patch)')
  })
})
