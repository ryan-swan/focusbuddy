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

describe('PlexiMeet wears the house material', () => {
  it('the view sits on the desk paper (the dotted house texture)', () => {
    expect(view).toContain('desk-paper no-tod text-[var(--ink-100)]" data-testid="pleximeet-view"')
  })

  it('the rail is a raised panel with the display header and rose identity chip', () => {
    expect(view).toContain('bg-[color-mix(in_oklab,var(--surface-raised)_88%,transparent)]')
    expect(view).toContain('bg-rose-500/10 text-rose-500')
    expect(view).toContain('fb-display text-[15px] font-bold')
  })

  it('the primary is a glossy accent commit (canon Part III — accent = commit)', () => {
    // History: DEC-112 shipped a glossy ROSE primary; the design-canon test
    // (Part III: the primary commit is accent) moved it to the app accent.
    expect(view).toContain('bg-gradient-to-b from-[rgb(var(--accent))] to-[rgb(var(--accent-hover))]')
  })

  it('the recording preferences live in one eyebrowed card', () => {
    // History: DEC-112 labelled it 'RECORDING'; the canon test (Law 6 — name
    // the dimension in words) relabelled it 'Recording preferences'.
    expect(view).toContain('>Recording preferences</div>')
  })

  it('the record views are a sunken segmented track with a WHITE raised thumb', () => {
    // History: DEC-112 used an accent-filled active pill; the canon test
    // (Part II — one signature raised element, the white thumb) slides a
    // --surface-raised thumb by layoutId instead.
    expect(view).toContain('rounded-full bg-[var(--surface-sunken)] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]')
    expect(view).toContain("layoutId=\"record-view-thumb\"")
    expect(view).toContain('absolute inset-0 rounded-full bg-[var(--surface-raised)]')
  })

  it('the detail header is a sticky raised bar over the paper', () => {
    expect(view).toContain('sticky top-0 z-10 flex items-center gap-2 px-5 py-3')
    expect(view).toContain('bg-[color-mix(in_oklab,var(--surface-raised)_92%,transparent)]')
  })

  it('all three renderings read as an editorial column', () => {
    expect(view.split('max-w-[780px]').length - 1).toBeGreaterThanOrEqual(4)
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
