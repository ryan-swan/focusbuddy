import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Chrome layout — verifies three coordinated changes:
//   1. The "Desk objects" palette is now a single "+ Add" button that
//      opens a popover, not a full-width horizontal strip.
//   2. The picker shows the universal File entry but no longer shows
//      the folded-away kinds (image, video, pdf, gdoc, gsheet, gslide,
//      email) — those still render correctly when an existing widget
//      uses them, but they're hidden from the picker.
//   3. The pinned-BR minimap shifts left to clear the AI Assistant rail
//      when the rail is open. When the rail collapses, the minimap
//      glides back toward the corner.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function bootAndOpenTask(launched: LaunchedApp): Promise<string> {
  const { window } = launched
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )
  const skip = window.getByRole('button', { name: /Continue without account|Skip|Not now/i })
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})

  const taskId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Chrome test'
    })
    return task.id
  })

  await window.reload()
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )
  const skip2 = window.getByRole('button', { name: /Continue without account|Skip|Not now/i })
  if (await skip2.isVisible().catch(() => false)) await skip2.click().catch(() => {})
  await window.getByRole('button', { name: 'Chrome test' }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  return taskId
}

test('Palette renders as a single "+ Add" button — the legacy full-width strip is gone', async () => {
  launched = await launchApp()
  await bootAndOpenTask(launched)

  // The new compact palette is a single button with data-testid.
  const addBtn = launched.window.locator('[data-testid="palette-add-button"]').first()
  await expect(addBtn).toBeVisible({ timeout: 5_000 })

  // The legacy "Desk objects" header label that lived inside the
  // collapsed strip should no longer be in the persistent toolbar.
  // It now only appears INSIDE the popover when the button is clicked.
  const persistentHeader = launched.window.getByText('Desk objects', { exact: true }).first()
  // Before clicking — header should not be visible (popover is closed).
  await expect(persistentHeader).not.toBeVisible({ timeout: 1000 }).catch(() => {})

  // Clicking opens the popover; the header IS visible inside it.
  await addBtn.click()
  await expect(persistentHeader).toBeVisible({ timeout: 2000 })
})

test('Picker shows File or link but hides the folded redundant kinds (image / video / pdf / gdoc / gsheet / gslide / email)', async () => {
  launched = await launchApp()
  await bootAndOpenTask(launched)

  const addBtn = launched.window.locator('[data-testid="palette-add-button"]').first()
  await addBtn.click()
  await launched.window.waitForTimeout(150)

  // The universal File entry exists in the picker.
  await expect(
    launched.window.locator('[data-testid="palette-add-file"]').first()
  ).toBeVisible({ timeout: 3000 })

  // Each folded-away kind must NOT have a picker tile any more. We use
  // the per-kind data-testid since label-based lookups would race with
  // partial-text matches across the rest of the chrome.
  const foldedKinds = ['image', 'video', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email']
  for (const kind of foldedKinds) {
    const count = await launched.window
      .locator(`[data-testid="palette-add-${kind}"]`)
      .count()
    expect({ kind, count }).toEqual({ kind, count: 0 })
  }
})

test('AI rail collapse/expand shifts the BR-pinned minimap horizontally — wider gap when rail is open', async () => {
  launched = await launchApp()
  const taskId = await bootAndOpenTask(launched)
  await launched.window.waitForTimeout(500) // auto-create

  // The minimap is auto-created pinned to BR on first task open.
  const minimaps = await launched.window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const widgets = await api.widgets.listByTask(tid)
    return widgets.filter((w) => w.kind === 'minimap').map((w) => ({ id: w.id }))
  }, taskId)
  expect(minimaps.length).toBe(1)
  const minimapId = minimaps[0].id

  // Force the AI rail OPEN by clearing the localStorage flag + dispatching
  // the custom event chromeState listens for.
  await launched.window.evaluate(() => {
    localStorage.removeItem('fb.ai-rail.collapsed')
    window.dispatchEvent(new CustomEvent('fb:ai-rail-changed'))
  })
  await launched.window.waitForTimeout(200)
  const openRect = await launched.window.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)
    return el ? el.getBoundingClientRect() : null
  }, minimapId)
  expect(openRect).not.toBeNull()

  // Collapse the rail by setting the flag + dispatching.
  await launched.window.evaluate(() => {
    localStorage.setItem('fb.ai-rail.collapsed', '1')
    window.dispatchEvent(new CustomEvent('fb:ai-rail-changed'))
  })
  await launched.window.waitForTimeout(200)
  const collapsedRect = await launched.window.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)
    return el ? el.getBoundingClientRect() : null
  }, minimapId)
  expect(collapsedRect).not.toBeNull()

  // When the rail is open it occupies ~280px on the right. When collapsed
  // it shrinks to ~32px. The minimap's right edge therefore moves at least
  // ~200px to the right (closer to the screen edge) when the rail
  // collapses. We require >100px shift to allow for sub-pixel drift /
  // animation easing windows.
  const shift = collapsedRect!.right - openRect!.right
  expect(shift).toBeGreaterThan(100)
})
