import { test } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Edges + Glass Phase 3 proof: the concentric focus ring is back for the
// keyboard (128 dead outline-nones stripped) and hover states breathe
// (fast in, slower out). Throwaway.
const OUT = process.env.SHOT_DIR ?? '/tmp'
let launched: LaunchedApp | null = null
test.afterEach(async () => { if (launched) { await launched.dispose(); launched = null } })

for (const theme of ['dark', 'light'] as const) {
  test(`focus ring + hover, ${theme}`, async () => {
    test.setTimeout(90_000)
    launched = await launchApp()
    const { window, app } = launched
    await waitForReady(window)
    await window.setViewportSize({ width: 2880, height: 1800 })
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2) })
    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const r = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Launch room' })
      await api.nodes.create({ parentId: r.id, kind: 'task', title: 'Runsheet desk' })
      await api.nodes.create({ parentId: null, kind: 'task', title: 'Scratch desk' })
    })
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2) })
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goDesks: (r?: string) => void } } }
      w.__fbView!.getState().goDesks(undefined)
    })
    await window.waitForTimeout(900)
    // Keyboard: tab until the search field then past it into the toolbar.
    for (let i = 0; i < 6; i++) await window.keyboard.press('Tab')
    await window.waitForTimeout(300)
    await window.screenshot({ path: `${OUT}/eg3-focus-${theme}.png` })
    // Hover: the first desk card.
    const card = window.locator('[data-testid="desks-index-mode-gallery"]')
    await card.hover()
    await window.waitForTimeout(400)
    await window.screenshot({ path: `${OUT}/eg3-hover-${theme}.png` })
  })
}
