/**
 * Fullscreen AI home (Phase 3a.4): fullscreen mode becomes Notion's AI page —
 * app nav stays visible and clickable beside/above it, the empty state is a
 * centered home (greeting, big composer, honest capability row, suggestion
 * cards), and the composer footer carries a real model picker (P7).
 *
 * AF-1  Non-takeover fullscreen insets beside the desk sidebar and below the
 *       header: the dock stays clickable (navigation re-threads the panel),
 *       the header stays reachable. (P6 + approved amendment: side nav + top
 *       header visible.)
 * AF-2  The fullscreen empty state is the home: greeting, capability row,
 *       suggestion cards that fill the composer; sending swaps to the
 *       conversation layout.
 * AF-3  The model picker is real: lists the real MODEL_OPTIONS, and picking
 *       one writes through to the shared preference (fb.model.mode).
 * AF-4  On a segment takeover, fullscreen stays full-bleed (its nav lives
 *       inside the takeover shell).
 * AF-5  Fullscreen is flat — the panel drops its floating-card chrome (no
 *       radius, no inset) and IS the screen; floating mode keeps the card.
 * AF-6  Capability chips are functional: a click sends a REAL starter request
 *       (captured at the far end, byte-equal to what the chip declares) and
 *       the flow begins as a genuine conversation turn.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

const overlay = (window: Page) => window.locator('[data-testid="assistant-overlay"]')
const panel = (window: Page) => window.locator('[data-testid="assistant-panel"]')

async function openAssistant(window: Page): Promise<void> {
  await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
  await panel(window).waitFor({ state: 'visible', timeout: 8000 })
}

async function switchToFullscreen(window: Page): Promise<void> {
  await window.locator('[data-testid="assistant-mode-toggle"]').click()
  await window.locator('[data-testid="assistant-mode-fullscreen"]').click()
  await expect(overlay(window)).toHaveAttribute('data-mode', 'fullscreen')
}

test('AF-1 — fullscreen keeps the sidebar and header alive; nav clicks re-thread the panel', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openAssistant(window)
  await switchToFullscreen(window)

  // The desk sidebar is beside the AI page, not buried under it: the overlay
  // starts where the dock ends.
  const dock = window.locator('[data-testid="sidebar-dock"]')
  await expect(dock).toBeVisible()
  const dockBox = (await dock.boundingBox())!
  const overlayBox = (await overlay(window).boundingBox())!
  expect(overlayBox.x).toBeGreaterThanOrEqual(dockBox.x + dockBox.width - 2)
  // And the header row is above it, still reachable.
  expect(overlayBox.y).toBeGreaterThanOrEqual(38)
  await expect(window.locator('[data-testid="topbar-search"]')).toBeVisible()

  // Navigation genuinely works from fullscreen: clicking Rooms re-threads the
  // panel to the rooms scope, exactly as everywhere else.
  await window.getByRole('button', { name: /Rooms/ }).first().click()
  await expect(window.locator('[data-testid="composer-context-chip"]')).toContainText(
    'your rooms',
    { timeout: 6000 }
  )
  await expect(overlay(window)).toHaveAttribute('data-mode', 'fullscreen')
})

test('AF-2 — the fullscreen empty state is the Notion home; a card fills the composer; sending swaps to conversation', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await switchToFullscreen(window)

  const home = window.locator('[data-testid="assistant-home"]')
  await expect(home).toBeVisible()
  await expect(home).toContainText('How can I help you today?')
  // The honest capability row — what the assistant can actually act on.
  await expect(window.locator('[data-testid="assistant-capability-row"]')).toBeVisible()
  // Suggestion cards live under the composer in home; clicking one is an
  // offer (fills the composer), not a command.
  const card = window.locator('[data-testid="home-suggestion-card"]').first()
  await expect(card).toBeVisible()
  const cardText = (await card.textContent()) ?? ''
  await card.click()
  const composer = window.locator('[data-testid="chat-composer"]')
  const value = await composer.inputValue()
  expect(value.length).toBeGreaterThan(0)
  expect(cardText).toContain(value)

  // Sending swaps home → conversation layout, same panel.
  await app.evaluate(({ ipcMain }) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install */
    }
    ipcMain.handle(
      'chat:sendStream',
      async (e: Electron.IpcMainInvokeEvent, input: { requestId: string }) => {
        const channel = `chat:stream:${input.requestId}`
        const send = (type: string, payload: unknown): void => {
          if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
        }
        await new Promise((r) => setTimeout(r, 20))
        send('sources', { sources: [], elapsedMs: 5 })
        send('reply', 'A fullscreen answer.')
        send('complete', {
          ok: true,
          message: { role: 'assistant', content: 'A fullscreen answer.', ts: Date.now() }
        })
        return { ok: true }
      }
    )
  })
  await window.locator('button[aria-label="Send"]').click()
  await expect(window.getByText('A fullscreen answer.')).toBeVisible({ timeout: 8000 })
  await expect(home).toHaveCount(0)
})

test('AF-3 — the model picker is real: MODEL_OPTIONS listed, choice written through', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openAssistant(window)
  await switchToFullscreen(window)

  await window.locator('[data-testid="composer-model-toggle"]').click()
  const menu = window.locator('[data-testid="composer-model-menu"]')
  await expect(menu).toBeVisible()
  // The four real options, by their real labels.
  await expect(menu).toContainText('Auto')
  await expect(menu).toContainText('Haiku 4.5')
  await expect(menu).toContainText('Sonnet 4.6')
  await expect(menu).toContainText('Opus 4.7')

  await window.locator('[data-testid="composer-model-haiku"]').click()
  await expect(menu).toHaveCount(0)
  // Written through to the one shared preference (Settings reads the same key).
  const stored = await window.evaluate(() => localStorage.getItem('fb.model.mode'))
  expect(stored).toBe('haiku')
  await expect(window.locator('[data-testid="composer-model-toggle"]')).toContainText('Haiku')
})

test('AF-5 — fullscreen is flat and full-bleed; floating keeps the card chrome', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openAssistant(window)

  // Floating: the panel is a card — rounded, detached from the wrapper edge.
  const radiusFloating = await panel(window).evaluate((el) => getComputedStyle(el).borderRadius)
  expect(radiusFloating).not.toBe('0px')

  await switchToFullscreen(window)
  // Fullscreen: no card. Flat surface, no radius, and the panel spans the
  // whole overlay — no 880px column, no inset gutter.
  const radiusFull = await panel(window).evaluate((el) => getComputedStyle(el).borderRadius)
  expect(radiusFull).toBe('0px')
  const overlayBox = (await overlay(window).boundingBox())!
  const panelBox = (await panel(window).boundingBox())!
  expect(Math.abs(panelBox.width - overlayBox.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(panelBox.height - overlayBox.height)).toBeLessThanOrEqual(2)
})

test('AF-6 — a capability chip click sends the real starter request it declares', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await switchToFullscreen(window)

  await app.evaluate(({ ipcMain }) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install */
    }
    ipcMain.handle(
      'chat:sendStream',
      async (
        e: Electron.IpcMainInvokeEvent,
        input: { requestId: string; messages: Array<{ role: string; content: string }> }
      ) => {
        ;(globalThis as Record<string, unknown>).__afLastUserMessage =
          [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? null
        const channel = `chat:stream:${input.requestId}`
        const send = (type: string, payload: unknown): void => {
          if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
        }
        await new Promise((r) => setTimeout(r, 20))
        send('sources', { sources: [], elapsedMs: 5 })
        send('reply', 'Starting that for you.')
        send('complete', {
          ok: true,
          message: { role: 'assistant', content: 'Starting that for you.', ts: Date.now() }
        })
        return { ok: true }
      }
    )
  })

  const chip = window.locator('[data-testid="capability-chip"]').first()
  await expect(chip).toBeVisible()
  const declaredStarter = await chip.getAttribute('data-starter')
  expect(declaredStarter && declaredStarter.length).toBeTruthy()

  await chip.click()
  // The starter became a real user turn…
  await expect(window.locator('[data-testid="user-turn"]').last()).toContainText(
    declaredStarter!,
    { timeout: 8000 }
  )
  await expect(window.getByText('Starting that for you.')).toBeVisible({ timeout: 8000 })
  // …and the far end received EXACTLY what the chip declared.
  const sent = await app.evaluate(
    () => (globalThis as Record<string, unknown>).__afLastUserMessage
  )
  expect(sent).toBe(declaredStarter)
})

test('AF-4 — on a segment takeover, fullscreen stays full-bleed', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.getByRole('button', { name: /Office/ }).first().click()
  await openAssistant(window)
  await switchToFullscreen(window)

  const overlayBox = (await overlay(window).boundingBox())!
  expect(Math.round(overlayBox.x)).toBe(0)
  expect(Math.round(overlayBox.y)).toBe(0)
})
