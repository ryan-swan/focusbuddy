/**
 * Smoke tests for the cross-user live-document collaboration wiring added in
 * the docCollab epic. Full cross-user lock/takeover flows require a deployed
 * signal server + two live accounts and are NOT exercised here. What is
 * verified:
 *
 *   1. App boots with no uncaught exceptions — the new stores/docCollab.ts +
 *      lib/docCollabClient.ts + lib/messagingSocket.ts import chain must not
 *      crash on boot when signed out (init() only fires on sign-in).
 *
 *   2. DocumentsView: open Documents, create a blank Document, return to the
 *      hub, and assert that the Collaborate button (data-testid="doc-collaborate")
 *      is present in the DOM of the recent-doc row. Its opacity is controlled
 *      by a CSS group-hover class so it may be invisible; we assert on DOM
 *      presence, not visibility. Clicking it while signed out must NOT crash —
 *      it sets an inline error instead.
 *
 *   3. The "Shared live" section (data-testid="shared-live-list") must NOT
 *      appear when signed out (it is only rendered when shared.length > 0, and
 *      the fetch is skipped without a token).
 *
 *   4. PlexiInbox: navigate to PlexiInbox (sidebar button). It must render
 *      (sign-in gate or empty state is fine). No crash. No takeover cards
 *      when signed out (data-testid="takeover-requests" must not exist).
 *
 * Real cross-user collaboration (lock, takeover, respond) needs a deployed
 * /livedocs API and two signed-in accounts — explicitly out of scope here.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

test('COLLAB-1 — boot smoke: app loads, no uncaught exceptions, docCollab store + socket handler are inert when signed out', async () => {
  const { window, dispose } = await launchApp()
  const uncaught: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') uncaught.push(msg.text())
  })
  try {
    await waitForReady(window)

    // Allow any async store initialisation to settle.
    await window.waitForTimeout(800)

    const realErrors = uncaught.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('WebSocket') &&
        // Not signed in — network attempts to signal server are expected to fail.
        !e.includes('signal') &&
        !e.includes('localhost:3001') &&
        !e.includes('focusbuddy-signal')
    )
    expect(realErrors, `Unexpected console errors on boot:\n${realErrors.join('\n')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('COLLAB-2 — DocumentsView: Collaborate button present in DOM after creating a doc; clicking while signed out shows inline error, app remains alive', async () => {
  const { window, dispose } = await launchApp()
  const uncaught: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') uncaught.push(msg.text())
  })
  try {
    await waitForReady(window)

    // Open Documents hub.
    await gotoView(window, 'goDocuments')
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })

    // Create a blank Document so a recent-doc row is available.
    const blankRowContainer = window.locator('text=Or start blank:').locator('..')
    await blankRowContainer.locator('button', { hasText: 'Document' }).first().click()

    // Wait for the editor to mount.
    const editor = window.locator('[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible', timeout: 6_000 })

    // Let autosave debounce fire.
    await window.waitForTimeout(800)

    // Navigate back to the hub.
    await window.locator('button[title="Back to Documents"]').click()
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 5_000 })

    // The recent-doc row for "Untitled document" must now exist.
    await expect(window.locator('text=Untitled document').first()).toBeVisible({ timeout: 5_000 })

    // The Collaborate button must be in the DOM (opacity hidden by CSS group-hover,
    // so we check the DOM, not visual visibility).
    const collaborateBtn = window.locator('[data-testid="doc-collaborate"]').first()
    await expect(collaborateBtn).toHaveCount(1, { timeout: 3_000 })

    // Hover the card so the button becomes interactive (group-hover makes it opaque).
    const card = window.locator('text=Untitled document').first().locator('..').locator('..')
    await card.hover()

    // Click the Collaborate button while signed out.
    await collaborateBtn.click()

    // The app must stay alive — we are still on the Documents hub after the click.
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 3_000 })

    // An inline error should be visible (the collaborate() function sets error state
    // when no token — "Sign in to collaborate on a document.").
    // We allow a short wait for the state update to render.
    await window.waitForTimeout(300)
    const errorEl = window.locator('text=/sign in to collaborate/i')
    await expect(errorEl).toBeVisible({ timeout: 3_000 })

    // No new uncaught errors from the collaborate click path.
    const realErrors = uncaught.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('WebSocket') &&
        !e.includes('signal') &&
        !e.includes('localhost:3001') &&
        !e.includes('focusbuddy-signal')
    )
    expect(realErrors, `Unexpected console errors:\n${realErrors.join('\n')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('COLLAB-3 — DocumentsView: Shared-live section absent when signed out', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await gotoView(window, 'goDocuments')
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })

    // No account, so shared=[] → the section must not be rendered.
    const sharedSection = window.locator('[data-testid="shared-live-list"]')
    await expect(sharedSection).toHaveCount(0, { timeout: 3_000 })
  } finally {
    await dispose()
  }
})

test('COLLAB-4 — PlexiInbox renders without crash; no takeover-requests section when signed out', async () => {
  const { window, dispose } = await launchApp()
  const uncaught: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') uncaught.push(msg.text())
  })
  try {
    await waitForReady(window)

    // Navigate to PlexiInbox through the view store (object-based IA has no
    // literal sidebar button for it).
    await gotoView(window, 'goInbox')

    // The view must mount — sign-in gate or content, either is fine.
    // We just wait a beat and confirm the app hasn't crashed.
    await window.waitForTimeout(600)

    // App still alive: the always-present footer sync chip is rendered.
    await expect(window.locator('[data-testid="footer-sync-chip"]')).toBeVisible({ timeout: 4_000 })

    // No takeover-requests section when signed out (takeovers array is empty,
    // the conditional block is not rendered).
    await expect(window.locator('[data-testid="takeover-requests"]')).toHaveCount(0, { timeout: 2_000 })

    const realErrors = uncaught.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('WebSocket') &&
        !e.includes('signal') &&
        !e.includes('localhost:3001') &&
        !e.includes('focusbuddy-signal')
    )
    expect(realErrors, `Unexpected console errors:\n${realErrors.join('\n')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})
