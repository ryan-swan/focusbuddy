/**
 * accountSection.spec.ts — E2E coverage for Change 3: in-app sign-in / sign-out UI.
 *
 * Previously the only sign-in path was the boot modal with no way to reopen it
 * and no sign-out anywhere. The change adds:
 *   - A Settings Account section (AccountSection component) with signed-out /
 *     signed-in states and the appropriate data-testids.
 *   - A sign-in prompt store (useSignInPrompt) that lets any part of the app
 *     request the modal on demand.
 *   - LaunchSignInModal now respects manualOpen and has a close button
 *     (data-testid="signin-close").
 *
 * We boot with an isolated userData dir (signed out, no session). The boot
 * modal is dismissed by waitForReady. Then we open Settings, verify the
 * signed-out Account section, click the "Sign in or create account" button,
 * verify the modal appears (with signin-close), and close it.
 *
 * A real server login is NOT exercised here because the hermetic test
 * environment has no live signal server. The test is intentionally scoped
 * to rendering / interaction correctness, not auth success.
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

test('Settings Account section renders signed-out state and the sign-in modal opens and closes', async () => {
  launched = await launchApp()
  const { window } = launched

  const pageErrors: string[] = []
  window.on('pageerror', (err) => pageErrors.push(err.message))

  // waitForReady dismisses the boot modal (via "Continue without account")
  // so the app is in the signed-out state with no modal overlay.
  await waitForReady(window)

  // Open Settings via the gear button in the titlebar.
  const settingsBtn = window.getByRole('button', { name: /appearance settings/i })
  await expect(settingsBtn).toBeVisible({ timeout: 5_000 })
  await settingsBtn.click()

  // The settings panel is a scrollable container (max-h-[80vh] overflow-y-auto).
  // AccountSection is mounted near the bottom, so we need to scroll to it.
  // We wait for the panel to appear first, then scroll the Account section into view.
  const settingsPanel = window.locator('.fixed.z-\\[200\\].overflow-y-auto').first()
  await expect(settingsPanel).toBeVisible({ timeout: 5_000 })

  // Scroll the account-signin button into view via JavaScript.
  await window.evaluate(() => {
    const el = document.querySelector('[data-testid="account-signin"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  })

  // The Account section should render in the signed-out state.
  // Signed-out renders a "Sign in or create account" button.
  const signInBtn = window.locator('[data-testid="account-signin"]')
  await expect(signInBtn).toBeVisible({ timeout: 5_000 })

  // The signed-in elements must NOT be present in signed-out state.
  await expect(window.locator('[data-testid="account-identity"]')).toHaveCount(0)
  await expect(window.locator('[data-testid="account-signout"]')).toHaveCount(0)

  // Click the sign-in button — this calls useSignInPrompt.requestOpen() which
  // sets open=true in the store, which causes LaunchSignInModal to render even
  // though the user previously dismissed the boot modal.
  await signInBtn.click()

  // The sign-in modal should appear. It contains an email field and the close button.
  const closeBtn = window.locator('[data-testid="signin-close"]')
  await expect(closeBtn).toBeVisible({ timeout: 5_000 })

  // The form's email input must also be present, confirming it's the full modal.
  const emailInput = window.locator('input[type="email"]')
  await expect(emailInput).toBeVisible({ timeout: 3_000 })

  // Close via signin-close — this should dismiss the modal.
  await closeBtn.click()

  // After close the modal should be gone.
  await expect(closeBtn).toHaveCount(0, { timeout: 3_000 })
  await expect(emailInput).toHaveCount(0, { timeout: 3_000 })

  // No page errors throughout.
  expect(pageErrors).toHaveLength(0)
})

test('Settings Account section is mounted above ApiKeysSection in the panel', async () => {
  launched = await launchApp()
  const { window } = launched

  await waitForReady(window)

  // Open Settings.
  const settingsBtn = window.getByRole('button', { name: /appearance settings/i })
  await settingsBtn.click()

  // Wait for panel, then scroll to Account section.
  const settingsPanel = window.locator('.fixed.z-\\[200\\].overflow-y-auto').first()
  await expect(settingsPanel).toBeVisible({ timeout: 5_000 })
  await window.evaluate(() => {
    const el = document.querySelector('[data-testid="account-signin"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  })

  // Both AccountSection and ApiKeysSection should be visible.
  // Account is above ApiKeys in the panel per the mount order in SettingsPanel.
  const accountSignInBtn = window.locator('[data-testid="account-signin"]')
  await expect(accountSignInBtn).toBeVisible({ timeout: 5_000 })

  // The API keys section has an "Anthropic API Key" label — confirm it renders too.
  const apiSection = window.getByText(/anthropic api key/i)
  await expect(apiSection).toBeVisible({ timeout: 5_000 })

  // Verify vertical order: AccountSection appears before ApiKeysSection in the DOM.
  // getBoundingClientRect().top for account-signin should be less than for the api label.
  const accountY = await accountSignInBtn.evaluate((el) => el.getBoundingClientRect().top)
  const apiY = await apiSection.first().evaluate((el) => el.getBoundingClientRect().top)
  expect(accountY).toBeLessThan(apiY)
})
