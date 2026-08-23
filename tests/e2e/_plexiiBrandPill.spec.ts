import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Brand motion Phase 1 (AI lane): the assistant pill wears the ii mark.
// Static verification that the mark renders inside the pill at rest (the
// blink/wink is the brand machine's unit-tested job). Throwaway.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('the assistant pill wears the PlexiiMark', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  const pill = window.locator('[data-testid="assistant-pill"]')
  await expect(pill).toBeVisible()
  // The mark is an inline SVG now, not a font icon.
  await expect(pill.locator('svg')).toHaveCount(1)
  // The mark must actually paint: a real box, not a collapsed or hidden svg.
  const box = await pill.locator('svg').boundingBox()
  expect(box && box.width >= 12 && box.height >= 12).toBeTruthy()
  await window.screenshot({
    path: `${OUT}/brand-pill.png`,
    clip: { x: 1440 - 140, y: 900 - 140, width: 140, height: 140 }
  })

  await launched.dispose()
})
