import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// First-run onboarding. It must appear for a genuinely fresh install, be fully
// skippable, set a flag so it never returns, and be grandfathered away for an
// existing user (one who already has data). The API-key success path makes a
// real model call, so it's left to manual use; here we drive the deterministic
// structural flow.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

const onboarding = (l: LaunchedApp) =>
  l.window.locator('[role="dialog"][aria-label="Welcome to PlexiDesk"]')

const nodeTitles = (l: LaunchedApp): Promise<string[]> =>
  l.window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.nodes.list()).map((n) => n.title)
  })

test('ONB-1 — a fresh install sees onboarding, can skip through, and it never returns', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window, { dismissModals: false })

  // Fresh DB, no key → onboarding shows.
  await expect(onboarding(launched)).toBeVisible({ timeout: 8000 })

  // Welcome → skip the key → tour → start blank.
  await window.getByRole('button', { name: 'Get started' }).click()
  await window.getByRole('button', { name: 'Skip for now' }).click()
  await expect(window.locator('[data-testid="onboarding-tour"]')).toBeVisible()
  await window.locator('[data-testid="onboarding-tour-continue"]').click()
  await window.locator('[data-testid="onboarding-start-blank"]').click()

  // Dismissed, and the flag persists across a reload.
  await expect(onboarding(launched)).toHaveCount(0, { timeout: 4000 })
  await window.reload()
  await waitForReady(window, { dismissModals: false })
  await window.waitForTimeout(800)
  await expect(onboarding(launched)).toHaveCount(0)
})

test('ONB-2 — creating the starter workspace seeds a real folder and closes onboarding', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window, { dismissModals: false })
  await expect(onboarding(launched)).toBeVisible({ timeout: 8000 })

  await window.getByRole('button', { name: 'Get started' }).click()
  await window.getByRole('button', { name: 'Skip for now' }).click()
  await window.locator('[data-testid="onboarding-tour-continue"]').click()
  await window.locator('[data-testid="onboarding-create-starter"]').click()

  await expect(onboarding(launched)).toHaveCount(0, { timeout: 6000 })
  expect(await nodeTitles(launched)).toContain('Getting started')
})

test('ONB-3 — an existing user (already has data) is grandfathered and never sees onboarding', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window, { dismissModals: false })
  // Fresh install shows it first…
  await expect(onboarding(launched)).toBeVisible({ timeout: 8000 })

  // …seed data, then relaunch the renderer. The gate now sees existing nodes and
  // marks onboarding done without showing it.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'folder', title: 'Existing work' })
  })
  await window.reload()
  await waitForReady(window, { dismissModals: false })
  await window.waitForTimeout(800)
  await expect(onboarding(launched)).toHaveCount(0)
})
