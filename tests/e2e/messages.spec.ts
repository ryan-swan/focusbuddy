import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Messaging UI plumbing. The e2e harness runs signed-out (no account), so the
// deterministic check is that the Messages nav opens the view and it shows the
// sign-in gate. Real DM flow needs two signed-in users + the live server; the
// server side is covered by the signal server's messagingFlow integration test.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('MSG-1 — the Messages view opens from the sidebar and gates on sign-in', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.getByRole('button', { name: /^Messages$/ }).first().click()

  // Signed-out gate renders (the harness continues without an account).
  await expect(
    window.getByRole('heading', { name: 'Messages' })
  ).toBeVisible({ timeout: 6000 })
  await expect(window.getByText(/Sign in to message other people on PlexiDesk/)).toBeVisible()
})

test('MSG-2 — the unified Inbox opens from the sidebar and gates on sign-in', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.getByRole('button', { name: /^Inbox$/ }).first().click()
  await expect(window.getByRole('heading', { name: 'Inbox' })).toBeVisible({ timeout: 6000 })
  await expect(
    window.getByText(/your messages, shared items, and \(soon\) email in one place/i)
  ).toBeVisible()
})
