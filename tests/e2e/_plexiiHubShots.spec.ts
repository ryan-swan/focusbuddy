import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual-review shots for the Phase 1 gate. Not part of the suite's
// assertions; delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii hub visual shots', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
    w.__fbView?.getState().goHome()
  })
  await window.waitForTimeout(500)
  await window.screenshot({ path: `${OUT}/p1-home.png` })

  // Seed a conversation via the hero.
  const input = window.locator('[data-testid="start-or-ask-input"]')
  await input.fill('Plan a product launch for spring')
  await window.locator('[data-testid="start-or-ask-go"]').click()
  await window.waitForTimeout(1200)
  await window.screenshot({ path: `${OUT}/p1-hub-after-hero.png` })

  // Fresh-chat hub home state.
  await window.locator('[data-testid="conversation-new"]').click()
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/p1-hub-empty.png` })

  // Back home: sidebar sublist with the recent conversation.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
    w.__fbView?.getState().goHome()
  })
  await window.waitForTimeout(500)
  await window.screenshot({ path: `${OUT}/p1-home-with-recents.png` })

  await launched.dispose()
})
