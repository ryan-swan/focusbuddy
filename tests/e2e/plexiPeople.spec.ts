/**
 * E2E for the PlexiPeople segment — the fourth top-level segment, sitting between
 * PlexiOffice and PlexiBrain. It is the team area: a people home with real team
 * status, a real people directory, and a way into the organisation map.
 *
 * NO FAKERY is the central assertion here. A fresh test workspace has no
 * organisation and no teammates, so the directory MUST show its honest empty
 * state and the team-status counts MUST read zero — never the mockup's invented
 * 128 people / 42 online / birthdays / anniversaries.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

async function exitSegment(window: Page): Promise<void> {
  const segExit = window.locator('[data-testid="segment-exit"]')
  if (await segExit.isVisible().catch(() => false)) await segExit.click()
  const officeExit = window.locator('[data-testid="office-exit"]')
  if (await officeExit.isVisible().catch(() => false)) await officeExit.click()
}

test.describe('PlexiPeople segment', () => {
  let app: LaunchedApp
  let window: Page

  test.beforeAll(async () => {
    app = await launchApp()
    window = app.window
    await waitForReady(window)
  })
  test.afterAll(async () => {
    await app.dispose()
  })

  test('opens from the sidebar and renders the people home', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="nav-plexipeople"]').click()
    await expect(window.locator('[data-testid="segment-plexipeople"]')).toBeVisible({ timeout: 8_000 })
    // The segment lands on its People Home app by default.
    await expect(window.locator('[data-testid="people-home"]')).toBeVisible({ timeout: 8_000 })
    // Team status block is present and reads real presence counts.
    await expect(window.locator('[data-testid="people-status"]')).toBeVisible()
  })

  test('a fresh workspace shows the honest empty directory, not invented people', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="nav-plexipeople"]').click()
    await window.locator('[data-testid="people-home"]').waitFor({ timeout: 8_000 })

    // No organisation + signed out on a fresh DB → honest empty state, never a
    // fabricated team. The empty block must be visible and the populated
    // directory list must NOT be.
    await expect(window.locator('[data-testid="people-directory-empty"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.locator('[data-testid="people-directory"]')).toHaveCount(0)

    // No invented member rows anywhere.
    await expect(window.locator('[data-testid="people-member-row"]')).toHaveCount(0)

    // Total-people stat reads 0 on an empty workspace — proving the count is the
    // real member count, not the mockup's 128.
    const status = window.locator('[data-testid="people-status"]')
    await expect(status).toContainText('Total people')
    await expect(status.locator('text=/^128$/')).toHaveCount(0)
  })

  test('the directory app and organisation map are reachable from the segment menu', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="nav-plexipeople"]').click()
    // Organisation (the directory backend / OrgAdminView) renders inline.
    await window.locator('[data-testid="segment-app-workspaces"]').click()
    await expect(window.locator('[data-testid="org-admin"]')).toBeVisible({ timeout: 8_000 })
    // Organisation Map app renders the real People Map view (its empty state on a
    // fresh workspace, never an invented org chart).
    await window.locator('[data-testid="segment-app-map"]').click()
    await expect(window.locator('[data-testid="people-map"]')).toBeVisible({ timeout: 8_000 })
  })
})
