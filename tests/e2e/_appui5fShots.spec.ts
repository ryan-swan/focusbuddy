import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for App-UI phase 5f: PlexiPeople home aligned to the
// design system. Also captures the kit fixture 08 asked for: the Offline
// StatTile (tone=stone) which has no dark: variant and goes low-contrast on
// atelier's navy. Throwaway.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

for (const theme of ['dark', 'atelier'] as const) {
  test(`people home, ${theme}`, async () => {
    launched = await launchApp()
    const { window } = launched
    await waitForReady(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goPlexiPeople: (app?: string) => void } } }
      w.__fbView!.getState().goPlexiPeople()
    })
    await window.waitForTimeout(800)
    await expect(window.locator('[data-testid="people-home"]')).toBeVisible()
    await window.screenshot({ path: `${OUT}/5f-people-${theme}.png` })
    // The stone Offline tile close-up — 08's atelier fixture.
    if (theme === 'atelier') {
      const tiles = window.locator('[data-testid="people-status"]')
      await tiles.screenshot({ path: `${OUT}/5f-people-stattiles-atelier.png` })
    }
  })
}
