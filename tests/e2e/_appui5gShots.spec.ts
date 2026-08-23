import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for App-UI phase 5g: the Settings panel on the glass
// tier with the kit sweep applied. Throwaway.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

for (const theme of ['dark', 'atelier'] as const) {
  test(`settings panel, ${theme}`, async () => {
    launched = await launchApp()
    const { window } = launched
    await waitForReady(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await window.getByRole('button', { name: 'Appearance settings' }).click()
    await window.waitForTimeout(500)
    await expect(window.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await window.screenshot({ path: `${OUT}/5g-settings-${theme}.png` })
    // Esc still exits (the exit law holds on the new material).
    await window.keyboard.press('Escape')
    await expect(window.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  })
}
