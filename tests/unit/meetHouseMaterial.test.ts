import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The PlexiMeet material round (operator: "this page still feels very
// vibe-coded"). Presentation ONLY — these pin the house recipes onto the
// view so a refactor cannot quietly ship it back to bespoke styling. The
// functional pins (testids, copy, honest states) live in the m1–m6 suites
// and were untouched by this round.

const ROOT = join(__dirname, '..', '..')
const view = readFileSync(join(ROOT, 'src/renderer/src/components/views/PlexiMeetView.tsx'), 'utf-8')

describe('PlexiMeet wears the house material — and reads like Home', () => {
  // History: DEC-112 put the view on desk-paper (no-tod) with a raised,
  // bordered rail, a 15px display rail header and a glossy ROSE primary,
  // and gave the detail a sticky raised header bar. DEC-116 (operator:
  // "make the entire page background, textures and colors look and feel
  // like the Home screen") moved it onto Home's own substrate and idioms:
  // paper-texture (Home deliberately avoids desk-paper — its overlay caused
  // the mid-screen seam and the light-in-dark bug), Home's page shell and
  // hero header, Home's accent primary, and every surface a floating kit
  // RailCard. The rose identity survives as the module chip; the sunken
  // segmented track survives unchanged.
  it('the view sits on the SAME paper as Home (paper-texture, not desk-paper)', () => {
    expect(view).toContain('overflow-auto paper-texture text-[var(--ink-100)]" data-testid="pleximeet-view"')
    expect(view).not.toContain('desk-paper no-tod')
    // Home's page shell, verbatim: wide board, 32px gutters.
    expect(view).toContain('max-w-[1440px] mx-auto px-8 pb-8 pt-8')
  })

  it("the hero is Home's greeting header: display title, quiet subtitle, rose module chip", () => {
    expect(view).toContain('fb-display-hero text-[24px] leading-tight text-[var(--ink-100)]">PlexiMeet</h1>')
    expect(view).toContain('bg-rose-500/10 text-rose-500')
    expect(view).toContain('data-testid="meet-hero"')
    expect(view).not.toContain('fb-display text-[15px] font-bold')
  })

  it("the primary is Home's accent button (the Customize → Done glow), the doors are surface buttons", () => {
    expect(view).toContain(
      'rounded-[10px] bg-[rgb(var(--accent))] text-white shadow-[0_1px_2px_rgb(var(--accent)/0.25),0_4px_12px_-2px_rgb(var(--accent)/0.30)]'
    )
    expect(view).not.toContain('from-rose-500 to-rose-600')
    expect(view.split('h-9 px-3.5 fb-t-body font-medium fb-btn-surface fb-press text-[var(--ink-80)]').length - 1).toBeGreaterThanOrEqual(4)
  })

  it('the rail is a stack of floating kit cards, sticky beside the Record', () => {
    expect(view).toContain('lg:sticky lg:top-4 self-start" data-testid="meet-rail"')
    expect(view).toContain('testId="meet-list-card"')
    expect(view).toContain('testId="meet-recording-card"')
    expect(view).not.toContain('bg-[color-mix(in_oklab,var(--surface-raised)_88%,transparent)]')
  })

  it('the recording preferences live in one eyebrowed card', () => {
    expect(view).toContain('>RECORDING</div>')
  })

  it('the record views are a sunken segmented track with a glossy active pill', () => {
    expect(view).toContain('rounded-full bg-[var(--surface-sunken)] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]')
    expect(view).toContain('shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.15)]')
  })

  it('the detail header is the title on the paper with surface-button doors — no sticky bar', () => {
    expect(view).toContain('data-testid="meet-detail-header"')
    expect(view).toContain('fb-display-hero text-[22px] leading-tight text-[var(--ink-100)] outline-none')
    expect(view).not.toContain('sticky top-0 z-10 flex items-center gap-2 px-5 py-3')
    expect(view).not.toContain('bg-[color-mix(in_oklab,var(--surface-raised)_92%,transparent)]')
  })

  it('the three panels are kit RailCards with icon headers, side by side, the transcript sticky', () => {
    expect(view).not.toContain('max-w-[780px]')
    expect(view).toContain('flex flex-col lg:flex-row gap-4 items-start')
    for (const s of ['title="Timeline"', 'title="Record"', 'title="Transcript"']) expect(view).toContain(s)
    expect(view).toContain('testId="meet-record-pane"')
    expect(view).toContain('testId="meet-transcript-pane"')
    expect(view).toContain('lg:sticky lg:top-4 lg:max-h-[calc(100vh-140px)]')
  })

  it('the kit grew what the page needed, without moving a pixel for Home', () => {
    const kit = readFileSync(join(ROOT, 'src/renderer/src/components/plexi/index.tsx'), 'utf-8')
    expect(kit).toContain('trailing?: ReactNode')
    expect(kit).toContain("bodyClassName ?? (title ? 'px-4 pb-4' : 'p-4')")
    expect(kit).toContain('data-testid={testId}')
    const dash = readFileSync(join(ROOT, 'src/renderer/src/components/ModuleDashboard.tsx'), 'utf-8')
    expect(dash).toContain("embedded ? 'w-full' : 'w-full px-8 py-6'")
  })
})

describe('the Stage and wrap-up wear the house material too', () => {
  const wrap = readFileSync(join(ROOT, 'src/renderer/src/components/WrapupOverlay.tsx'), 'utf-8')
  const stage = readFileSync(join(ROOT, 'src/renderer/src/components/MeetingOverlay.tsx'), 'utf-8')

  it('the wrap-up header carries the rose identity chip and display title', () => {
    expect(wrap).toContain('bg-rose-500/10 text-rose-500')
    expect(wrap).toContain('fb-display text-[14px] font-semibold')
  })

  it("the wrap-up's Done is a glossy accent primary; Close stays quiet", () => {
    expect(wrap).toContain('bg-gradient-to-b from-[rgb(var(--accent))] to-[rgb(var(--accent-hover))]')
    expect(wrap).toContain("status === 'review'")
  })

  it('the Stage controls are premium — press, gloss inset, danger gradient', () => {
    expect(stage).toContain('rounded-full fb-press transition-colors shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]')
    expect(stage).toContain('bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400')
  })
})
