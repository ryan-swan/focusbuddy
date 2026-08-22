import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Probe for Caleb's report: clicking a history row stays on the new-chat page.
test('reopening history from the hub rail', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)

  // Create two real conversations through the composer (keyless send still
  // persists the conversation + user turn).
  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.click()
  await window.keyboard.type('First conversation about venues')
  await window.keyboard.press('Enter')
  await window.waitForTimeout(900)
  await window.locator('[data-testid="conversation-new"]').click()
  await window.waitForTimeout(400)
  await composer.click()
  await window.keyboard.type('Second conversation about budget')
  await window.keyboard.press('Enter')
  await window.waitForTimeout(900)
  await window.locator('[data-testid="conversation-new"]').click()
  await window.waitForTimeout(400)

  // Fresh new-chat page; now click the FIRST conversation's row.
  const rows = window.locator('[data-testid="conversation-row"]')
  const n = await rows.count()
  console.log('PROBE rows:', n)
  expect(n).toBeGreaterThanOrEqual(2)
  await rows.filter({ hasText: 'venues' }).first().click()
  await window.waitForTimeout(700)
  const shown = await window
    .locator('[data-testid="user-turn"]')
    .allInnerTexts()
    .catch(() => [])
  console.log('PROBE turns:', JSON.stringify(shown))
  expect(shown.join(' ')).toContain('venues')

  await launched.dispose()
})
