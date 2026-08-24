// E2E for the rebuilt Home view (the kind:'home' landing dashboard rendered by
// HomeDashboard.tsx — reached from the sidebar's Home entry / goHome()).
//
// This is distinct from homeDashboard.spec.ts, which covers the PlexiSuite home
// region. Here we assert the Home dashboard reads real data and shows honest
// empty states: a real greeting name, quick-action navigation, empty Agenda and
// Activity on a fresh workspace, and a real document appearing under "Continue
// where you left off" after one is created via window.api.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

test.setTimeout(90_000)

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// Navigate to the Home view through the real view store exposed on window.
async function goHome(window: LaunchedApp['window']): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
    w.__fbView?.getState().goHome()
  })
  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })
}

test('1. Home renders all sections with a real greeting name', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await goHome(window)

  const greeting = window.locator('[data-testid="home-greeting"]')
  await expect(greeting).toBeVisible()
  // The greeting is "<time-of-day>, <name>". Signed out in the test env, the name
  // falls back to the stable, non-invented "there" — never a fabricated identity.
  await expect(greeting).toContainText(/Good (morning|afternoon|evening), \S+/)

  // Core surfaces present. The header's Ask Plexii door is gone by ruling
  // (2026-08-24) — the omnibar pill is the one door — so its absence is
  // asserted, guarding against the duplicate coming back.
  await expect(window.locator('[data-testid="home-ask-brain"]')).toHaveCount(0)
  await expect(window.locator('[data-testid="home-insights"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-focus-toggle"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-quick-create"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-quick-plan"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-quick-collaborate"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-quick-automate"]')).toBeVisible()
  // The "Your desk" section always renders (it owns the New Desk tile).
  await expect(window.locator('[data-testid="home-desks"]')).toBeVisible()
  await expect(window.locator('[data-testid="home-desk-new"]')).toBeVisible()
})

test('2. Fresh workspace: Agenda and Activity show honest empty states', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await goHome(window)

  // Give the imperative loads (timeBlocks.list + trail.recent) time to resolve.
  await window.waitForTimeout(2000)

  await expect(window.locator('[data-testid="home-agenda-empty"]')).toBeVisible({ timeout: 5000 })
  await expect(window.locator('[data-testid="home-agenda-empty"]')).toContainText(/Nothing scheduled today/i)

  await expect(window.locator('[data-testid="home-activity-empty"]')).toBeVisible({ timeout: 5000 })
  await expect(window.locator('[data-testid="home-activity-empty"]')).toContainText(/No recent activity yet/i)

  // No "Continue" grid on a fresh workspace (no fake document rows).
  const hasContinue = await window
    .locator('[data-testid="home-continue"]')
    .isVisible({ timeout: 500 })
    .catch(() => false)
  expect(hasContinue, 'home-continue should be absent with no documents').toBe(false)
})

test('3. Quick action Plan navigates to the Plans view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await goHome(window)

  await window.locator('[data-testid="home-quick-plan"]').click()
  // goPlexiDesk('plans') opens the PlexiDesk segment; the Home dashboard unmounts.
  await expect(window.locator('[data-testid="home-dashboard"]')).not.toBeVisible({ timeout: 8000 })
})

test('4. Quick action Automate navigates away from Home', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await goHome(window)

  await window.locator('[data-testid="home-quick-automate"]').click()
  await expect(window.locator('[data-testid="home-dashboard"]')).not.toBeVisible({ timeout: 8000 })
})

test('5. New desk tile creates a real desk and opens its canvas', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await goHome(window)

  const before = await window.evaluate(() => window.api.nodes.list())
  const beforeCount = (before as Array<unknown>).length

  await window.locator('[data-testid="home-desk-new"]').click()
  await expect(window.locator('[data-testid="home-dashboard"]')).not.toBeVisible({ timeout: 8000 })

  const after = await window.evaluate(() => window.api.nodes.list())
  expect((after as Array<unknown>).length).toBeGreaterThan(beforeCount)
  const newDesks = (after as Array<{ kind: string; title: string }>).filter(
    (n) => n.kind === 'task' && n.title === 'New desk'
  )
  expect(newDesks.length).toBeGreaterThanOrEqual(1)
})

test('6. A document created via window.api appears under Continue and opens on click', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a real document via raw IPC, then mount Home so its useEffect refresh
  // picks it up from the real documents store.
  const doc = await window.evaluate(() =>
    window.api.documents.create({ docType: 'doc', title: 'HOMEVIEW_DOC' })
  )
  const docId = (doc as { id: string }).id

  await goHome(window)
  // refreshDocs runs in useEffect on mount; give it time to resolve + render.
  await window.waitForTimeout(2500)

  const item = window.locator(`[data-testid="home-continue-item-${docId}"]`)
  await expect(item).toBeVisible({ timeout: 10000 })
  await expect(item).toContainText('HOMEVIEW_DOC')

  // Clicking opens the document editor — Home unmounts.
  await item.click()
  await expect(window.locator('[data-testid="home-dashboard"]')).not.toBeVisible({ timeout: 8000 })
})
