// E2E: the Home dashboard's "Reset layout" control uses the app's styled
// PromptDialog confirm, not a native window.confirm().
//
// Contract (src/renderer/src/components/dashboard/Dashboard.tsx +
// components/plexi/PromptDialog.tsx):
//   - Clicking [data-testid="dashboard-customize"] enters editing mode, which
//     reveals the "Reset" button (title="Restore default layout").
//   - Clicking Reset calls confirmDialog({...}), which renders
//     [data-testid="prompt-dialog"] with a confirm button
//     [data-testid="prompt-dialog-confirm"] and a plain "Cancel" button.
//   - Cancelling must not touch the layout and must not raise any native
//     dialog (Electron doesn't implement window.confirm anyway — this test
//     proves the in-app affordance renders instead of silently no-oping).

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, openProduct, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// KNOWN GAP, deliberately fixme rather than deleted: Dashboard.tsx implements
// the reset-with-styled-confirm contract this spec exercises, but nothing
// routes to it yet (ProjectDashboard.tsx has no importer; Home and the module
// dashboards have no reset control). The per-module configurable-dashboards
// feature is queued; un-fixme this the moment a live surface gains the reset
// control, and it becomes the regression trap for that wiring.
test.fixme('dashboard reset shows the styled prompt-dialog confirm, not a native dialog; cancel dismisses it', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Native dialog canary: if window.confirm/alert/prompt were ever invoked,
  // record it so we can assert none of them fired.
  await window.evaluate(() => {
    const w = window as unknown as { __nativeDialogCalls?: string[] }
    w.__nativeDialogCalls = []
    const push = (name: string) => (): boolean | string | null => {
      w.__nativeDialogCalls!.push(name)
      return name === 'confirm' ? true : null
    }
    window.confirm = push('confirm') as typeof window.confirm
    window.alert = push('alert') as typeof window.alert
    window.prompt = push('prompt') as typeof window.prompt
  })

  // Navigate to the Home dashboard.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
    w.__fbView?.getState().goHome?.() ?? w.__fbView?.getState().goDashboard?.()
  })
  await window.waitForTimeout(300)

  // Enter customize mode, then click Reset.
  const customize = window.locator('[data-testid="dashboard-customize"]').first()
  await expect(customize).toBeVisible({ timeout: 5_000 })
  await customize.click()

  const resetBtn = window.getByRole('button', { name: /^Reset$/ }).first()
  await expect(resetBtn).toBeVisible({ timeout: 3_000 })
  await resetBtn.click()

  // The styled prompt dialog appears with its confirm button.
  const dialog = window.locator('[data-testid="prompt-dialog"]')
  await expect(dialog).toBeVisible({ timeout: 3_000 })
  await expect(window.locator('[data-testid="prompt-dialog-confirm"]')).toBeVisible()

  // Cancel it — Cancel is a plain-text button inside the dialog.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 3_000 })

  // No native dialog primitive was ever called.
  const nativeCalls = await window.evaluate(() => (window as unknown as { __nativeDialogCalls?: string[] }).__nativeDialogCalls)
  expect(nativeCalls).toEqual([])
})
