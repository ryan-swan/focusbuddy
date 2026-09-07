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
