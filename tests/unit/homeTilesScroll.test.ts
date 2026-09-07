// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const home = read('src/renderer/src/components/views/HomeDashboard.tsx')
const kit = read('src/renderer/src/components/plexi/index.tsx')
const standup = read('src/renderer/src/components/views/StandupHome.tsx')
const blocks = read('src/renderer/src/components/attention/attentionBlocks.tsx')
const pill = read('src/renderer/src/components/attention/ItemStatusPill.tsx')
const frame = read('src/renderer/src/components/widgets/WidgetFrame.tsx')
const picker = read('src/renderer/src/components/views/StandupOutputPicker.tsx')

// DEC-132 — operator: "On the home page, individual widgets get cut off, and
// there's no ability to scroll… either it needs to stop before something gets
// cut off mid-row, or there needs to be the ability to scroll." Every tile
// scrolls instead of clipping; the two named widgets pin their header and
// scroll their body (the navigator's columns each on their own).

describe('dec_132 — home tiles scroll, never clip', () => {
  it('the live tile wrapper scrolls vertically (the drag ghost stays clipped)', () => {
    expect(home).toContain('className={`h-full overflow-y-auto overflow-x-hidden rounded-2xl fb-widget-tile [&>*]:h-full')
    expect(home).toContain('className="absolute left-0 top-0 pointer-events-none select-none overflow-hidden rounded-2xl fb-widget-tile')
  })
  it('RailCard `fill`: a sized host pins the header and scrolls the body; unsized hosts are pixel-identical', () => {
    expect(kit).toContain("<section className={`${PLEXI_CARD} ${fill ? 'h-full flex flex-col min-h-0' : ''} ${className}`}")
    expect(kit).toContain('className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 shrink-0"')
    expect(kit).toContain("className={`${fill ? 'flex-1 min-h-0 ' : ''}${bodyClassName ?? (title ? 'px-4 pb-4' : 'p-4')}${")
    expect(kit).toContain("fill && !bodyClassName ? ' overflow-y-auto' : ''")
    expect(kit).toContain('fill = false')
  })
  it('the three RailCard tiles fill; the navigator\'s rooms and desks columns each scroll on their own', () => {
    for (const f of [
      "action={{ label: 'All rooms', onClick: () => v.goRooms() }}\n            fill",
      '<RailCard\n            fill\n            title="Continue where you left off"',
      '<RailCard title="Quick actions" icon="bolt" tone="emerald" fill>'
    ])
      expect(home).toContain(f)
    expect(home).toContain('bodyClassName="px-4 pb-4 flex flex-col"')
    expect(home).toContain('className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto min-h-0 sm:border-r sm:border-[var(--edge-soft)] sm:pr-3"')
    expect(home).toContain('<div className="min-w-0 min-h-0 overflow-y-auto" data-testid="home-desks">')
    expect(home).not.toContain('sm:overflow-visible')
  })
  it('the standup: title row pinned, everything under it scrolls', () => {
    expect(standup).toContain('className="mb-6 fb-card p-5 flex flex-col min-h-0"')
    expect(standup).toContain('<div className="flex items-center gap-2 mb-2 shrink-0">')
    expect(standup).toContain('<div className="flex-1 min-h-0 overflow-y-auto" data-testid="standup-body">')
  })
  it('the command-center blocks scroll their body', () => {
    expect(blocks).toContain('<div className="flex-1 min-h-0 overflow-y-auto">{children}</div>')
  })
  it('the status menu rides a portal at the pill\'s coordinates, so a scrolling list never clips it', () => {
    expect(pill).toContain("import { createPortal } from 'react-dom'")
    expect(pill).toContain("style={{ position: 'fixed', top: anchor.top, right: anchor.right }}")
    // below the pill when there is room, above it when there is not
    expect(pill).toContain('const top = r.bottom + 4 + est <= window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - 4 - est)')
    expect(pill).toContain('data-testid="status-menu"')
    expect(pill).toContain('if (!wrap.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)')
    expect(pill).not.toContain('className="absolute right-0 top-7 z-30')
  })
})

describe('dec_133 — the same rule for desk widgets, and the Save chip', () => {
  it('every desk widget body scrolls vertically rather than clipping', () => {
    expect(frame).toContain('className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden"')
    expect(frame).not.toContain("autoGrowsHeight(widget.kind) && !isChildOfSection && !isPinned ? 'overflow-y-auto' : ''")
  })
  it("the standup's Save chip is sized by its content — no 24px icon-btn square hugging the icon", () => {
    expect(picker).toContain('className="fb-btn-surface h-7 px-2 gap-1.5 inline-flex items-center rounded-[var(--radius-field)] text-[12px]')
    expect(picker).not.toContain('fb-btn-surface icon-btn')
  })
})

// DEC-134 — operator: "Now do the same for the Calendar and Meet pages." Both
// pages bounded their tall regions with 100vh arithmetic (`calc(100vh - 380px)`
// for the hour grid, `- 268px` for the queue rail, `- 460px` for the meetings
// list, `- 140px` for the sticky transcript) — numbers that drifted from the
// real header whenever it wrapped, so a full rail or the transcript's bottom
// edge ran under the footer with nothing to scroll. Each page is a WINDOW now:
// the header pinned, the regions taking the rest of the height and scrolling
// inside themselves, hugging when short (DEC-131's `fill` on the grid).

describe('dec_134 — the same rule for the Calendar and Meet pages', () => {
  const cal = read('src/renderer/src/components/views/CalendarView.tsx')
  const meet = read('src/renderer/src/components/views/PlexiMeetView.tsx')

  it('Calendar: the page is a window — the header pinned, the rail and the grid take the rest', () => {
    expect(cal).toContain('<div className="h-full flex flex-col overflow-y-auto paper-texture text-[var(--ink-100)]" data-testid="calendar-view">')
    expect(cal).toContain('<div className="fb-cq w-full max-w-[1600px] mx-auto px-5 lg:px-8 xl:px-10 py-7 flex-1 min-h-0 flex flex-col">')
    expect(cal).toContain('<div className="mb-5 flex flex-col gap-3.5 shrink-0">')
    expect(cal).toContain('<div className="fb-cq-cal flex-1 min-h-0">')
  })
  it('Calendar: the rail hugs a short list and caps at the window, its list scrolling under the pinned title and filter — no 100vh arithmetic, nothing to stick to', () => {
    expect(cal).toContain('className={`fb-cq-rail flex-col gap-2 max-h-full min-h-0 rounded-xl transition-shadow ${')
    expect(cal).toContain('<div className="flex items-center gap-2 shrink-0">')
    expect(cal).toContain('className="fb-field w-full shrink-0 bg-[var(--surface-sunken)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink-80)]"')
    expect(cal).toContain('<div className="flex flex-col gap-1.5 min-h-0 overflow-y-auto pr-0.5 -mr-0.5" data-testid="calendar-rail-list">')
    expect(cal).not.toContain('max-h-[calc(100vh-268px)]')
    expect(cal).not.toContain('sticky top-0')
  })
  it('Calendar: the grid column stretches to the floor; the plan bar stays; the week grid fills (DEC-131 `fill`) above a 240px floor', () => {
    expect(cal).toContain('<div className="min-w-0 min-h-0 self-stretch flex flex-col" onWheel={onRangeWheel} data-testid="calendar-main">')
    expect(cal).toContain('<div className="mb-3 flex flex-col gap-2 shrink-0" data-testid="plan-bar">')
    expect(cal).toContain('<div className="rounded-[var(--radius-card)] fb-glass-card p-3 flex-1 min-h-[240px] flex flex-col" data-testid="calendar-grid-card">')
    expect(cal).toContain('<WeekTimeGrid\n                fill\n')
  })
  it('Calendar: the month fills too — the weekday row pinned, six weeks sharing the height and never shorter than their content, scrolling when the window cannot hold them', () => {
    expect(cal).toContain('<div className="rounded-[var(--radius-card)] fb-glass-card p-3 flex-1 min-h-[240px] flex flex-col" data-testid="calendar-month">')
    expect(cal).toContain('<div className="grid grid-cols-7 gap-1.5 mb-1.5 shrink-0">')
    expect(cal).toContain('<div className="grid grid-cols-7 gap-1.5 flex-1 min-h-0 overflow-y-auto auto-rows-[minmax(max-content,1fr)]" data-testid="calendar-month-cells">')
  })

  it('Meet: the page is a window on a wide screen (the hero pinned); below lg the columns stack and the page scrolls', () => {
    expect(meet).toContain('<div className="h-full w-full flex flex-col overflow-y-auto lg:overflow-hidden paper-texture text-[var(--ink-100)]" data-testid="pleximeet-view">')
    expect(meet).toContain('<div className="w-full max-w-[1440px] mx-auto px-8 pb-8 pt-8 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">')
    expect(meet).toContain('<header className="flex items-start justify-between gap-4 flex-wrap mb-6 shrink-0" data-testid="meet-hero">')
    expect(meet).toContain('<div className="mb-4 space-y-2 shrink-0">')
    expect(meet).toContain('<div className="flex flex-col lg:flex-row gap-6 items-start lg:items-stretch lg:flex-1 lg:min-h-0">')
  })
  it('Meet: the rail stands as tall as the floor — the Meetings card shrinks and scrolls its list under the pinned title and search, the Recording card keeps its height; no 100vh cap, nothing sticky', () => {
    expect(meet).toContain('<aside className="w-full lg:w-[300px] shrink-0 flex flex-col gap-4 lg:min-h-0" data-testid="meet-rail">')
    expect(meet).toContain('className="flex flex-col min-h-0"\n              bodyClassName="px-2 pb-2 min-h-0 flex flex-col"')
    expect(meet).toContain('<div className="px-1 pb-2 shrink-0">')
    expect(meet).toContain('<div className="min-h-0 overflow-y-auto max-h-[60vh] lg:max-h-none" data-testid="meet-list">')
    expect(meet).toContain('<RailCard className="shrink-0" bodyClassName="p-4 space-y-2" testId="meet-recording-card">')
    expect(meet).not.toContain('max-h-[max(240px,calc(100vh-460px))]')
    expect(meet).not.toContain('lg:sticky')
  })
  it('Meet: the column beside the rail scrolls on its own for the dashboard, or hands its height to the open Record (header and timeline pinned)', () => {
    expect(meet).toContain("className={`flex-1 min-w-0 w-full ${selected ? 'lg:min-h-0 lg:flex lg:flex-col' : 'lg:min-h-0 lg:overflow-y-auto'}`}")
    expect(meet).toContain('data-testid="meet-main"')
    expect(meet).toContain('<div className="flex flex-col lg:flex-1 lg:min-h-0" data-testid="meet-detail">')
    expect(meet).toContain('<header className="flex items-start justify-between gap-4 flex-wrap mb-5 shrink-0" data-testid="meet-detail-header">')
    expect(meet).toContain('testId="meet-timeline"\n          className="mb-4 shrink-0"')
  })
  it('Meet: the Record and the Transcript hug short content and cap at the floor, each scrolling under its own pinned header', () => {
    expect(meet).toContain('<div className="flex flex-col lg:flex-row gap-4 items-start lg:flex-1 lg:min-h-0">')
    expect(meet).toContain('<div className="flex-1 min-w-0 w-full lg:min-h-0 lg:max-h-full lg:flex lg:flex-col" ref={recordRef}>')
    expect(meet).toContain('className="overflow-hidden flex flex-col min-h-0"\n            bodyClassName="px-0 pb-0 min-h-0 overflow-y-auto"')
    expect(meet).toContain('className="w-full lg:w-[44%] lg:max-w-[560px] shrink-0 flex flex-col lg:min-h-0 lg:max-h-full"')
    expect(meet).toContain('bodyClassName="flex-1 min-h-0 flex flex-col"')
    expect(meet).toContain('<div className="flex-1 min-h-0 overflow-auto px-3 py-2" data-testid="rendering-thread" ref={threadRef}>')
    expect(meet).not.toContain('lg:max-h-[calc(100vh-140px)]')
  })
})
