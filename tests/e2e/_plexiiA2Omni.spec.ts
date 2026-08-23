import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// A2 flagship verification (AI-01/03, R11-R13): the omnibar routes live in
// the CommandCenter — one door — and the in-app web panel is where the web
// opens. Throwaway; delete when A2 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'
const CMD_K = process.platform === 'darwin' ? 'Meta+k' : 'Control+k'

test('plexii A2: one door — URL, web search, ask Plexii, and the web panel', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  const input = window.locator('[data-testid="command-palette-input"]')
  const panel = window.locator('[data-testid="web-panel"]')

  // R12: Cmd+K raises the one palette.
  await window.keyboard.press(CMD_K)
  await expect(input).toBeVisible()

  // R11: an address previews "Open …" as the TOP row, and Enter opens the
  // in-app panel (R13), never the system browser.
  await input.fill('plexi.so')
  const urlRow = window.locator('[data-testid="palette-row-omni-url"]')
  await expect(urlRow).toContainText('Open plexi.so')
  await expect(urlRow).toHaveAttribute('aria-selected', 'true')
  await window.screenshot({ path: `${OUT}/omni-1-url-preview.png` })
  await window.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await window.screenshot({ path: `${OUT}/omni-2-web-panel.png` })
  // The explicit system-browser escape exists; the default never leaves Plexi.
  await expect(window.locator('[data-testid="web-panel-external"]')).toBeVisible()
  await window.locator('[data-testid="web-panel-close"]').click()
  await expect(panel).toHaveCount(0)

  // A question ranks Ask Plexii on top; Enter routes it to the assistant.
  await window.keyboard.press(CMD_K)
  await input.fill('what should our launch plan cover?')
  const askRow = window.locator('[data-testid="palette-row-omni-ask"]')
  await expect(askRow).toHaveAttribute('aria-selected', 'true')
  await window.screenshot({ path: `${OUT}/omni-3-ask-preview.png` })
  await window.keyboard.press('Enter')
  await expect(window.locator('text=what should our launch plan cover?').first()).toBeVisible({
    timeout: 5000
  })
  await window.screenshot({ path: `${OUT}/omni-4-ask-routed.png` })

  // A bare phrase offers the web without stealing Enter from a workspace
  // hit; the row is reachable and opens results in the panel.
  await window.keyboard.press(CMD_K)
  await input.fill('standing desk setups')
  const searchRow = window.locator('[data-testid="palette-row-omni-search"]')
  await expect(searchRow).toContainText('Search the web')
  await window.screenshot({ path: `${OUT}/omni-5-search-row.png` })
  await searchRow.click()
  await expect(panel).toBeVisible()
  await window.screenshot({ path: `${OUT}/omni-6-search-panel.png` })
  await window.locator('[data-testid="web-panel-close"]').click()

  await launched.dispose()
})
