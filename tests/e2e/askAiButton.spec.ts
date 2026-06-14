import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The canvas "Ask AI" button (was the separate "Build with AI" / "AI Setup"
// pair) now opens the single, store-backed command bar — the same one the
// header button and Cmd+Shift+K open.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('AA-1 — the canvas Ask AI button opens the command bar', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a task so the task toolbar (which holds the canvas Ask AI button) renders.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: 'AskAiToolbarTest' })
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /AskAiToolbarTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })

  // The canvas toolbar Ask AI button is identified by its title.
  const canvasAskAi = window.getByTitle(/Ask AI — describe what you want/)
  await expect(canvasAskAi).toBeVisible()
  await canvasAskAi.click()

  // The single command bar opens (aria-label "AI command bar").
  const commandBar = window.locator('[role="dialog"][aria-label="AI command bar"]')
  await expect(commandBar).toBeVisible({ timeout: 4000 })

  // Escape closes it (store-driven).
  await window.keyboard.press('Escape')
  await expect(commandBar).toHaveCount(0, { timeout: 4000 })
})
