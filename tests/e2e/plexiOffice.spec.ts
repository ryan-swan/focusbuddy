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
  // the new-document actions. (Scope to the sidebar — the footer also says
  // "PlexiOffice".)
  await expect(
    window.locator('aside').getByText('PlexiOffice', { exact: true })
  ).toBeVisible({ timeout: 10_000 })
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

test('PO-5 — the shell shows a version pill and updater affordance like PlexiDesk', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  // The footer version pill is the user-visible signal that updates are wired
  // here too (clicking it triggers an update check; the UpdaterBanner beside it
  // reflects state). It must show a v-prefixed version.
  const pill = window.locator('[data-testid="office-version"]')
  await expect(pill).toBeVisible({ timeout: 10_000 })
  await expect(pill).toContainText('v')
})

test('PO-6 — Drive: create a folder, open it, make a doc inside, breadcrumb back', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  // Create a folder; it appears in the Drive list (created as "New folder").
  await window.locator('[data-testid="office-new-folder"]').click()
  const folder = window.locator('[data-testid="office-folder-New folder"]')
  await expect(folder).toBeVisible({ timeout: 10_000 })

  // Open it — the breadcrumb now shows the folder, and it starts empty.
  await folder.locator('button').first().click()
  await expect(window.locator('aside').getByText('New folder', { exact: true })).toBeVisible()
  await expect(window.locator('aside').getByText('This folder is empty.')).toBeVisible({ timeout: 5_000 })

  // Create a document inside the folder; it lands here, not at the root.
  await window.locator('[data-testid="office-new-doc"]').click()
  await expect(window.locator('input').first()).toBeVisible({ timeout: 10_000 }) // editor mounted
  await window.getByRole('button', { name: /Back to list/i }).click()
  await expect(window.locator('aside').getByText('Untitled document', { exact: true })).toBeVisible({
    timeout: 5_000
  })

  // Breadcrumb home: the folder is listed at root, and the in-folder doc is not.
  await window.locator('[data-testid="office-crumb-home"]').click()
  await expect(window.locator('[data-testid="office-folder-New folder"]')).toBeVisible()
  await expect(window.locator('aside').getByText('Untitled document', { exact: true })).toHaveCount(0)
})

test('PO-7 — Share a document: create a view-only link', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  // Open a new document, then share it.
  await window.locator('[data-testid="office-new-doc"]').click()
  await window.locator('[data-testid="office-share-btn"]').click()
  await expect(window.locator('[data-testid="office-share-dialog"]')).toBeVisible({ timeout: 10_000 })

  // Minting produces a viewer link (works offline — local token mint).
  await window.locator('[data-testid="office-share-create"]').click()
  const link = window.locator('[data-testid="office-share-link"]')
  await expect(link).toBeVisible({ timeout: 5_000 })
  await expect(link).toHaveValue(/\/share\/[a-z0-9]+/)
})

test('PO-8 — Share a Drive folder: copy-scope view-only link', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  await window.locator('[data-testid="office-new-folder"]').click()
  const folder = window.locator('[data-testid="office-folder-New folder"]')
  await expect(folder).toBeVisible({ timeout: 10_000 })

  // Hover reveals the folder share button; click it.
  await folder.hover()
  await window.locator('[data-testid="office-folder-share-New folder"]').click()
  await expect(window.locator('[data-testid="office-share-dialog"]')).toBeVisible({ timeout: 5_000 })

  // A folder share offers view/copy scope; pick copy, then mint the link.
  await window.getByText('Can copy', { exact: true }).click()
  await window.locator('[data-testid="office-share-create"]').click()
  const link = window.locator('[data-testid="office-share-link"]')
  await expect(link).toBeVisible({ timeout: 5_000 })
  await expect(link).toHaveValue(/\/share\/[a-z0-9]+/)
})

test('PO-9 — Drive exposes an "open a shared link" import affordance', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  await window.locator('[data-testid="office-import-link"]').click()
  await expect(window.locator('[data-testid="office-import-url"]')).toBeVisible({ timeout: 5_000 })
  await expect(window.locator('[data-testid="office-import-go"]')).toBeVisible()
})

test('PO-10 — Collaborate offers live editing; prompts sign-in when signed out', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'office' } })
  const { window } = launched

  await window.locator('[data-testid="office-new-doc"]').click()
  // The Collaborate action is present in the document header.
  const collab = window.locator('[data-testid="office-collaborate-btn"]')
  await expect(collab).toBeVisible({ timeout: 10_000 })

  // Signed out (no account in the test env), it asks the user to sign in rather
  // than failing silently.
  await collab.click()
  await expect(window.getByText(/Sign in.*collaborate/i)).toBeVisible({ timeout: 5_000 })
})
