import { test } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Home tiles mission frames: the home dashboard, seeded so every tile family
// is on screen at once. Throwaway shot spec (pattern: _brandMotionShots).
//   home — standup (main), shortcuts sm + md, app launcher, create,
//          and the vivid icon heroes (new meeting / focus / transcribe /
//          discover / new desk) in one grid.
// Theme matrix: five themes when a commit touches globals.css or a token
// (steward 1e's tier ruling); THEMES env picks the set. Gemstone captures
// at 1x — its fixed layers blank under zoomed capture.
// Seeding is pure localStorage (home.layout.v3): section + url shortcut
// targets need no workspace data and cover seven chip tones; url favicons
// fall back to the globe glyph offline, which is the honest offline frame.

const OUT = process.env.SHOT_DIR ?? '/tmp'
const THEMES = (process.env.THEMES ?? 'dark,atelier,light').split(',')

const SHORTCUT_TARGETS = [
  { kind: 'section', id: 'tasks' },
  { kind: 'section', id: 'calendar' },
  { kind: 'section', id: 'documents' },
  { kind: 'section', id: 'desks' },
  { kind: 'section', id: 'plans' },
  { kind: 'url', url: 'https://linear.app' }
]

const LAYOUT = {
  widgets: [
    { key: 'standup:shot', widget: 'standup', size: 'lg' },
    { key: 'shortcuts:shot-sm', widget: 'shortcuts', size: 'sm', config: { targets: SHORTCUT_TARGETS } },
    { key: 'shortcuts:shot-md', widget: 'shortcuts', size: 'md', config: { title: 'Places', targets: SHORTCUT_TARGETS } },
    { key: 'app-launcher:shot', widget: 'app-launcher', size: 'sm' },
    { key: 'create:shot', widget: 'create', size: 'sm' },
    { key: 'new-meeting:shot', widget: 'new-meeting', size: 'icon' },
    { key: 'focus-timer:shot', widget: 'focus-timer', size: 'icon' },
    { key: 'transcribe:shot', widget: 'transcribe', size: 'icon' },
    { key: 'discover:shot', widget: 'discover', size: 'icon' },
    { key: 'new-desk:shot', widget: 'new-desk', size: 'icon' },
    // Phase 3R additions: the widgets Caleb flagged as still-black wells.
    // All render meaningfully from the seeded e2e profile without config.
    { key: 'continue:shot', widget: 'continue', size: 'lg' },
    { key: 'pulse:shot', widget: 'pulse', size: 'sm' },
    { key: 'navigator:shot', widget: 'navigator', size: 'lg' },
    { key: 'agenda:shot', widget: 'agenda', size: 'sm' },
    { key: 'activity:shot', widget: 'activity', size: 'sm' }
  ]
}

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

for (const theme of THEMES) {
  test(`home tiles: home, ${theme}`, async () => {
    test.setTimeout(120_000)
    launched = await launchApp()
    const { window, app } = launched
    await waitForReady(window)
    const scale = theme === 'gemstone' ? 1 : 2
    await window.setViewportSize({ width: 1440 * scale, height: 900 * scale })
    await window.evaluate(
      ({ t, layout }) => {
        localStorage.setItem('fb.theme.mode', t)
        localStorage.setItem('home.layout.v3', JSON.stringify(layout))
      },
      { t: theme, layout: LAYOUT }
    )
    await window.reload()
    await waitForReady(window)
    await app.evaluate(({ BrowserWindow }, z) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z)
    }, scale)
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
      w.__fbView?.getState().goHome()
    })
    // Let the one-time widget cascade-in stagger finish before the frame.
    await window.waitForTimeout(2_000)
    await window.screenshot({ path: `${OUT}/ht-home-${theme}.png` })
    // Second frame: home scrolls in an inner container (fullPage sees one
    // viewport), so bring the below-fold Phase 3R widgets into view.
    await window.evaluate(() => {
      document.querySelector('[data-testid="home-insights"]')?.scrollIntoView({ block: 'center' })
    })
    await window.waitForTimeout(600)
    await window.screenshot({ path: `${OUT}/ht-homelow-${theme}.png` })
  })
}
