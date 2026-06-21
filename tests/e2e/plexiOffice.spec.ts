// PlexiOffice standalone-app smoke test. Boots the SAME built bundle as PlexiDesk
// but with PLEXI_APP=office, so the main process loads plexioffice.html and the
// PlexiOffice shell renders. Proves the second product launches into its own UI,
// reuses the shared editors via @office, and can create/open documents — the
// keystone of the lean split.

import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('PO-1 — boots into the PlexiOffice shell with new-document actions', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  // The office shell, not the desk: its sidebar shows the PlexiOffice brand and
  // the three new-document actions.
  await expect(window.getByText('PlexiOffice', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(window.locator('[data-testid="office-new-doc"]')).toBeVisible()
  await expect(window.locator('[data-testid="office-new-sheet"]')).toBeVisible()
  await expect(window.locator('[data-testid="office-new-slides"]')).toBeVisible()

  // It must NOT be the desk shell — the canvas surface is absent.
  await expect(window.locator('[data-canvas-surface="true"]')).toHaveCount(0)
})

test('PO-2 — create a spreadsheet: the shared SheetEditor opens and the doc is listed', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  await window.locator('[data-testid="office-new-sheet"]').click()

  // The very same SheetEditor PlexiDesk uses (imported via @office) mounts — its
  // formula bar is the definitive signal.
  await expect(window.locator('input[placeholder*="Select a cell"]')).toBeVisible({ timeout: 10_000 })

  // Type a value so the editor is genuinely live, then go back to the list.
  await window.locator('[data-testid="cell-0-0"]').click()
  const bar = window.locator('input[placeholder*="Select a cell"]')
  await bar.click()
  await bar.fill('hello from PlexiOffice')
  await window.locator('[data-testid="cell-1-0"]').click()
  await window.waitForTimeout(200)

  await window.getByRole('button', { name: /Back to list/i }).click()
  // The new spreadsheet appears in the sidebar list (createBlank titles a sheet
  // "Untitled sheet").
  await expect(
    window.locator('aside').getByText('Untitled sheet', { exact: true })
  ).toBeVisible({ timeout: 5_000 })
})

test('PO-4 — create a PlexiMap: the diagram editor opens with a starter node and accepts a shape', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  await window.locator('[data-testid="office-new-map"]').click()

  // The MapEditor toolbar mounts (its shape buttons are the definitive signal).
  await expect(window.locator('[data-testid="map-add-process"]')).toBeVisible({ timeout: 10_000 })
  // A fresh map seeds a single Start node (starterMapBody) — React Flow renders it.
  await expect(window.locator('.react-flow__node')).toHaveCount(1, { timeout: 5_000 })

  // Adding a process shape puts a second node on the canvas.
  await window.locator('[data-testid="map-add-process"]').click()
  await expect(window.locator('.react-flow__node')).toHaveCount(2, { timeout: 5_000 })

  // Back in the list, the new map is present (createBlank titles it "Untitled map").
  await window.getByRole('button', { name: /Back to list/i }).click()
  await expect(window.locator('aside').getByText('Untitled map', { exact: true })).toBeVisible({
    timeout: 5_000
  })
})

test('PO-3 — the sidebar offers a sign-in surface so documents can sync with PlexiDesk', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  // Signed out (no real account in the test env), the account bar invites sign-in.
  // This is the integration contract of the split: one account, shared documents.
  const signIn = window.locator('[data-testid="office-signin"]')
  await expect(signIn).toBeVisible({ timeout: 10_000 })

  // Opening it reveals the inline email/password form with a submit control.
  await signIn.click()
  await expect(window.getByPlaceholder('Email')).toBeVisible()
  await expect(window.getByPlaceholder('Password')).toBeVisible()
  await expect(window.locator('[data-testid="office-signin-submit"]')).toBeVisible()
})
