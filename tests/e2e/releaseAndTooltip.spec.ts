import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Two pieces of the 2.5.26 onboarding work, exercised in the real app:
//  1. The first-run "What's new in vX.Y.Z" modal shows once after an update for
//     a returning user, dismisses, and does not reappear.
//  2. Hovering a header control shows the new portalled tooltip.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('RM-1 — release modal shows once after an update, then not again', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Simulate a returning user who just updated: the last-run version is an older
  // one, and this version has not been acknowledged yet.
  await window.evaluate(() => {
    localStorage.setItem('fb.app.lastRunVersion', '2.5.25')
    localStorage.removeItem('fb.app.releaseModalVersion')
  })
  await window.reload()
  await waitForReady(window)

  const modal = window.locator('[role="dialog"][aria-label*="What"]')
  await expect(modal).toBeVisible({ timeout: 8000 })
  await expect(modal).toContainText('v2.5.26')
  await expect(modal).toContainText('Learn more')

  // The release version is recorded the moment the modal mounts.
  const seenWhileOpen = await window.evaluate(() => localStorage.getItem('fb.app.releaseModalVersion'))
  expect(seenWhileOpen).toBe('2.5.26')

  await window.getByRole('button', { name: 'Got it' }).click()
  await expect(modal).toHaveCount(0)

  // Reload → it must not reappear for a version already seen.
  await window.reload()
  await waitForReady(window)
  await window.waitForTimeout(600)
  await expect(window.locator('[role="dialog"][aria-label*="What"]')).toHaveCount(0)
})

test('RM-2 — does NOT show on a fresh launch with no prior state', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  // Fresh app data dir → no prior fb.* state → modal must stay hidden.
  await window.waitForTimeout(600)
  await expect(window.locator('[role="dialog"][aria-label*="What"]')).toHaveCount(0)
})

test('TT-1 — hovering the Ask AI button shows a tooltip', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // No prior state, so no release modal is in the way.
  const askAi = window.getByRole('button', { name: /AI command bar/i })
  await expect(askAi).toBeVisible()
  await askAi.hover()

  const tip = window.locator('[role="tooltip"]')
  await expect(tip).toBeVisible({ timeout: 4000 })
  await expect(tip).toContainText('Ask AI')

  // Moving away hides it.
  await window.mouse.move(5, 5)
  await expect(tip).toHaveCount(0, { timeout: 4000 })
})
