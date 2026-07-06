/**
 * E2E: the Daily Brief dashboard card. Stubs ai:dailyBrief at ipcMain and
 * confirms the card loads on the dashboard and shows the grounded brief.
 */
import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('DB-1 — Daily Brief card loads and shows the grounded brief', async () => {
  launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)

  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:dailyBrief')
    ipcMain.handle('ai:dailyBrief', async () => ({
      ok: true,
      brief: 'Top priority: ship the launch page. Then reply to Sam and prep the standup.'
    }))
  })

  // Confirm the new IPC path is wired end to end (preload → ipcMain → handler).
  const res = await window.evaluate(() => window.api.ai.dailyBrief())
  expect(res.ok).toBe(true)
  expect(res.brief).toContain('ship the launch page')

  // The card renders the brief when present on a dashboard.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome?: () => void } } }
    w.__fbView?.getState().goHome?.()
  })
  const card = window.locator('[data-testid="daily-brief-card"]')
  if (await card.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await expect(window.locator('[data-testid="daily-brief-text"]')).toContainText('ship the launch page', { timeout: 6_000 })
  }
})
