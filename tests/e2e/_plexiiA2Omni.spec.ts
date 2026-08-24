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
  // Deliberate browsing opens FULL SCREEN by default (Caleb's ruling) —
  // the connected-app rectangle: rail visible, content area filled.
  await expect(panel).toHaveAttribute('data-expanded', 'true')
  const wide = await panel.boundingBox()
  expect(wide && wide.width > 1100).toBeTruthy()
  await window.waitForTimeout(300)
  await window.screenshot({ path: `${OUT}/omni-2-web-full.png` })
  // The explicit system-browser escape exists; the default never leaves Plexi.
  await expect(window.locator('[data-testid="browser-external"]')).toBeVisible()
  // Esc steps DOWN: fullscreen to the compact panel, then closed; the toggle
  // still flips between the two sizes by hand.
  await window.keyboard.press('Escape')
  await expect(panel).toHaveAttribute('data-expanded', 'false')
  await window.screenshot({ path: `${OUT}/omni-2b-web-panel.png` })
  await window.locator('[data-testid="web-panel-expand"]').click()
  await expect(panel).toHaveAttribute('data-expanded', 'true')
  await window.keyboard.press('Escape')
  await window.keyboard.press('Escape')
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

test('plexii A2: the engine picker pins a choice and the next search honours it', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  const input = window.locator('[data-testid="command-palette-input"]')
  const panel = window.locator('[data-testid="web-panel"]')

  // A search opens the panel on the default engine (keyless DuckDuckGo).
  await window.keyboard.press(CMD_K)
  await input.fill('standing desk setups')
  await window.locator('[data-testid="palette-row-omni-search"]').click()
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-testid="browser-address"]')).toHaveValue(/duckduckgo\.com/, {
    timeout: 15000
  })

  // The toolbar chip opens the model-picker-style menu; picking Google pins it.
  await window.locator('[data-testid="web-panel-engine-toggle"]').click()
  const menu = window.locator('[data-testid="web-panel-engine-menu"]')
  await expect(menu).toBeVisible()
  // The honesty note: in-chat answers stay keyless DDG.
  await expect(menu).toContainText('in-chat web answers stay on keyless DuckDuckGo')
  await window.waitForTimeout(400) // let the pop-in settle so the shot shows steady state
  await window.screenshot({ path: `${OUT}/omni-7-engine-menu.png` })
  await window.locator('[data-testid="web-panel-engine-google"]').click()
  await window.locator('[data-testid="web-panel-close"]').click()

  // The NEXT search rides the pinned engine.
  await window.keyboard.press(CMD_K)
  await input.fill('standing desk setups')
  await window.locator('[data-testid="palette-row-omni-search"]').click()
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-testid="browser-address"]')).toHaveValue(/google\.com/, {
    timeout: 15000
  })
  await window.screenshot({ path: `${OUT}/omni-8-engine-pinned.png` })

  // Pinned = survives a reload (localStorage preference).
  await window.reload()
  await waitForReady(window)
  await window.keyboard.press(CMD_K)
  await input.fill('standing desk setups')
  const row = window.locator('[data-testid="palette-row-omni-search"]')
  await expect(row).toBeVisible()
  await row.click()
  await expect(panel.locator('[data-testid="browser-address"]')).toHaveValue(/google\.com/, {
    timeout: 15000
  })

  await launched.dispose()
})
