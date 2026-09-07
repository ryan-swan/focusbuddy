import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TimeBlock } from '@shared/types'
import Icon from '../../Icon'
import WeekTimeGrid from '../../views/WeekTimeGrid'
import BookTimeDialog from '../../BookTimeDialog'
import { useTimeBlockStore } from '../../../stores/timeBlocks'
import { useViewStore } from '../../../stores/view'
import { bookBlockWithToast } from '../../../lib/bookBlock'
import { defaultSlotFor, monthCells, sameDay, startOfDay } from '../../../lib/monthGrid'

// DEC-131 — the assistant's Calendar tab. Operator: "default to today's
// calendar, similar to the Today widget on the main Attention page — however,
// this will need to be able to toggle between days and get a quick month
// calendar view, just so you can see days at a glance and click a day to be
// able to schedule something by clicking the day and having the booking page
// pop up."
//
// The DAY is the Attention rail's own column (WeekTimeGrid, one day, compact —
// the same grid the Calendar page renders wide): blocks drag and resize in
// place, deadlines ride above it. ‹ Today › walks the days. The MONTH is the
// glance: six weeks of numbers, a dot on every day that has something booked,
// today ringed, the shown day filled; clicking a day opens the Book-time
// dialog on it (the composer's own, portalled above the panel), books through
// the grid's path (toast, undo, invite hold), and lands you on that day.

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function AssistantCalendarTab(): JSX.Element {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()))
  const [view, setView] = useState<'day' | 'month'>('day')
  const [month, setMonth] = useState<Date>(() => new Date(day.getFullYear(), day.getMonth(), 1))
  const [booking, setBooking] = useState<number | null>(null)
  const goCalendar = useViewStore((s) => s.goCalendar)
  // A change-signal only — never the shared range (the AgendaBlock rule: the
  // store holds ONE range for whatever surface last asked; the month reads
  // its own slice into local state).
  const tick = useTimeBlockStore((s) => s.blocks.length)
  const [monthBlocks, setMonthBlocks] = useState<TimeBlock[]>([])
  useEffect(() => {
    if (view !== 'month') return
    let alive = true
    const cells = monthCells(month)
    const from = cells[0].getTime()
    const to = cells[cells.length - 1].getTime() + DAY_MS - 1
    void window.api.timeBlocks
      .list(from, to)
      .then((rows) => {
        if (alive) setMonthBlocks(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [view, month, tick])
  const bookedDays = useMemo(() => {
    const s = new Set<string>()
    for (const b of monthBlocks) s.add(startOfDay(new Date(b.startMs)).toDateString())
    return s
  }, [monthBlocks])

  const today = startOfDay(new Date())
  const isToday = sameDay(day, today)
  const dayLabel = day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const shiftDay = (n: number): void => {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + n)
    setDay(next)
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }
  const shiftMonth = (n: number): void => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const pickDay = (d: Date): void => {
    setDay(startOfDay(d))
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setBooking(defaultSlotFor(d))
  }

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="assistant-tab-calendar-body">
      <div className="shrink-0 px-3 pt-2.5 pb-2 flex items-center gap-1 border-b border-[var(--edge-soft)]">
        <button
          onClick={() => (view === 'day' ? shiftDay(-1) : shiftMonth(-1))}
          className="icon-btn !h-7 !w-7"
          title={view === 'day' ? 'Previous day' : 'Previous month'}
          aria-label={view === 'day' ? 'Previous day' : 'Previous month'}
          data-testid="assistant-calendar-prev"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <button
          onClick={() => {
            setDay(today)
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
          }}
          className={`fb-btn-surface inline-flex items-center h-7 px-2 text-[12px] ${isToday && view === 'day' ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-90)]'}`}
          title="Back to today"
          data-testid="assistant-calendar-today"
        >
          Today
        </button>
        <button
          onClick={() => (view === 'day' ? shiftDay(1) : shiftMonth(1))}
          className="icon-btn !h-7 !w-7"
          title={view === 'day' ? 'Next day' : 'Next month'}
          aria-label={view === 'day' ? 'Next day' : 'Next month'}
          data-testid="assistant-calendar-next"
        >
          <Icon name="chevron_right" size={16} />
        </button>
        <span className="fb-t-label text-[var(--ink-90)] flex-1 min-w-0 truncate pl-1" data-testid="assistant-calendar-label">
          {view === 'day' ? dayLabel : monthLabel}
        </span>
        <button
          onClick={() => setView((v) => (v === 'day' ? 'month' : 'day'))}
          className={`icon-btn !h-7 !w-7 ${view === 'month' ? 'text-[rgb(var(--accent))]' : ''}`}
          title={view === 'day' ? 'Month at a glance' : 'Back to the day'}
          aria-label={view === 'day' ? 'Month at a glance' : 'Back to the day'}
          aria-pressed={view === 'month'}
          data-testid="assistant-calendar-month-toggle"
        >
          <Icon name={view === 'day' ? 'calendar_view_month' : 'calendar_view_day'} size={16} />
        </button>
        <button
          onClick={() => setBooking(defaultSlotFor(day))}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-[8px] bg-[rgb(var(--accent))] text-white text-[12px] font-medium fb-press"
          title={`Book time on ${dayLabel}`}
          data-testid="assistant-calendar-book"
        >
          <Icon name="add" size={14} /> Book
        </button>
        <button
          onClick={goCalendar}
          className="icon-btn !h-7 !w-7"
          title="Open the Calendar page"
          aria-label="Open the Calendar page"
          data-testid="assistant-calendar-page"
        >
          <Icon name="open_in_new" size={15} />
        </button>
      </div>
      {view === 'day' ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" data-testid="assistant-calendar-day">
          {/* DEC-052's rail column, one day, narrow — the same grid as the page. */}
          <WeekTimeGrid weekStart={day} days={1} compact />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2" data-testid="assistant-calendar-month">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center fb-t-caption text-[var(--ink-40)]">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells(month).map((d) => {
              const inMonth = d.getMonth() === month.getMonth()
              const isSel = sameDay(d, day)
              const isTod = sameDay(d, today)
              const booked = bookedDays.has(d.toDateString())
              return (
                <button
                  key={d.toDateString()}
                  onClick={() => pickDay(d)}
                  title={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} — click to book time`}
                  data-testid={`assistant-calendar-cell-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`}
                  data-booked={booked || undefined}
                  className={`relative h-9 rounded-[8px] text-[12px] fb-press flex flex-col items-center justify-center gap-0.5 ${
                    isSel
                      ? 'bg-[rgb(var(--accent))] text-white'
                      : isTod
                        ? 'ring-1 ring-[rgb(var(--accent))] text-[var(--ink-100)]'
                        : inMonth
                          ? 'text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]'
                          : 'text-[var(--ink-30)] hover:bg-[var(--surface-sunken)]'
                  }`}
                >
                  <span className="fb-tabular leading-none">{d.getDate()}</span>
                  <span
                    className={`h-1 w-1 rounded-full ${booked ? (isSel ? 'bg-white' : 'bg-[rgb(var(--accent))]') : 'bg-transparent'}`}
                    aria-hidden
                  />
                </button>
              )
            })}
          </div>
          <p className="mt-2 fb-t-caption text-[var(--ink-40)]">A dot marks a day with something booked. Click a day to book time on it.</p>
        </div>
      )}
      {booking != null &&
        createPortal(
          <BookTimeDialog
            startMs={booking}
            initialDurationMin={30}
            onCancel={() => {
              setBooking(null)
              setView('day')
            }}
            onCreate={async (taskId, title, startMs, durationMin, meeting, recurrence) => {
              // The dialog closes FIRST, then the block is booked through the
              // grid's own path — toast, undo, the invite hold — and the day
              // it landed on is shown.
              setBooking(null)
              setDay(startOfDay(new Date(startMs)))
              setView('day')
              await bookBlockWithToast({ taskId, title, startMs, durationMin, meeting, recurrence })
            }}
          />,
          document.body
        )}
    </div>
  )
}
