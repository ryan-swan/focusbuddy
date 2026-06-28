// E2E verification for the PlexiMeet live-meeting UI (rebrand/archeon).
//
// Exercises: start-live button, message picker honest-empty state,
// start-meeting error path (no getUserMedia in headless), MeetingOverlay
// presence and controls when status transitions, module-home create label,
// and existing record/list regressions.
//
// What is NOT verified here (requires two live peers with real media):
//   • Actual WebRTC offer/answer exchange between two clients.
//   • Remote video tiles populating with a real MediaStream.
//   • meetingPeerJoined / meetingRoster socket events processing.
//   • Mute / camera toggle actually silencing a real audio track.
//
// All assertions below are UI-driven against real IPC/store paths.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function openMeet(window: LaunchedApp['window']): Promise<void> {
  const btn = window.locator('button').filter({ hasText: 'PlexiMeet' }).first()
  await btn.click()
  await window.waitForSelector('[data-testid="pleximeet-view"]', { timeout: 8_000 })
}

// ── Check 1: Left-rail buttons render ─────────────────────────────────────────

test('1 — meet-start-live, meet-record, meet-message and meet-add all render in left rail', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openMeet(window)

  const view = window.locator('[data-testid="pleximeet-view"]')
  await expect(view).toBeVisible()

  await expect(view.locator('[data-testid="meet-start-live"]')).toBeVisible()
  await expect(view.locator('[data-testid="meet-record"]')).toBeVisible()
  await expect(view.locator('[data-testid="meet-message"]')).toBeVisible()
  await expect(view.locator('[data-testid="meet-add"]')).toBeVisible()

  // "Start a meeting" label on the primary button.
  await expect(view.locator('[data-testid="meet-start-live"]')).toContainText('Start a meeting')
})

// ── Check 2: Message picker — honest empty state when no peers ────────────────

test('2 — meet-message opens picker; honest "No teammates online right now." shown with zero peers', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openMeet(window)

  // Picker not visible yet.
  await expect(window.locator('[data-testid="meet-message-picker"]')).toHaveCount(0)

  await window.locator('[data-testid="meet-message"]').click()

  // Picker mounts.
  const picker = window.locator('[data-testid="meet-message-picker"]')
  await expect(picker).toBeVisible({ timeout: 3_000 })

  // With no account signed in → zero presence peers → honest empty message.
  await expect(picker).toContainText('No teammates online right now.', { timeout: 3_000 })

  // Toggle again: picker dismissed.
  await window.locator('[data-testid="meet-message"]').click()
  await expect(window.locator('[data-testid="meet-message-picker"]')).toHaveCount(0)
})

// ── Check 3: Start a meeting — no crash; honest camera/mic error surfaced ─────

test('3 — meet-start-live does not crash app; getUserMedia denial shows honest error or overlay mounts', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openMeet(window)

  await window.locator('[data-testid="meet-start-live"]').click()

  // Give up to 6 s for either the meeting window to mount (getUserMedia granted,
  // possibly via a headless dummy device) OR an error to appear. Both are valid.
  const windowMounted = await window.locator('[data-testid="meeting-window"]')
    .waitFor({ state: 'visible', timeout: 6_000 })
    .then(() => true)
    .catch(() => false)

  if (windowMounted) {
    // Overlay mounted. Verify required elements inside it.
    const overlay = window.locator('[data-testid="meeting-window"]')

    // Self tile (labelled "You") — two elements match "You" (avatar + label chip),
    // so scope to the label chip at the bottom of the self tile via .first().
    await expect(overlay.locator('text=You').first()).toBeVisible({ timeout: 3_000 })

    // Participant count (data-testid="meeting-count") — solo = "1 person".
    const countEl = overlay.locator('[data-testid="meeting-count"]')
    await expect(countEl).toBeVisible()
    const countText = await countEl.textContent()
    expect(countText, 'meeting-count shows 1 person when solo').toMatch(/1\s+person/i)

    // Control buttons: mute, camera, invite, leave.
    await expect(overlay.locator('[aria-label="Mute"], [aria-label="Unmute"]')).toBeVisible()
    await expect(overlay.locator('[aria-label="Turn camera off"], [aria-label="Turn camera on"]')).toBeVisible()
    await expect(overlay.locator('[aria-label="Invite people"]')).toBeVisible()
    await expect(overlay.locator('[aria-label="Leave meeting"]')).toBeVisible()

    // Leave → overlay gone, app still visible.
    await overlay.locator('[aria-label="Leave meeting"]').click()
    await expect(overlay).toHaveCount(0, { timeout: 4_000 })
    await expect(window.locator('[data-testid="pleximeet-view"]')).toBeVisible()

  } else {
    // getUserMedia denied path: an error banner or the view stays intact (no crash).
    const errorEl = window.locator('[data-testid="meet-error"]')
    const gotError = await errorEl.isVisible().catch(() => false)

    if (gotError) {
      const errText = await errorEl.textContent()
      expect(errText, 'error mentions camera/mic/permissions').toMatch(/camera|microphone|mic|permission/i)
    }

    // Either way the app must not have crashed.
    const viewStillUp = await window.locator('[data-testid="pleximeet-view"]').isVisible()
    expect(viewStillUp, 'pleximeet-view still visible after denied getUserMedia').toBe(true)
  }
})

// ── Check 4: ModuleHome renders when no meeting selected; create label correct ─

test('4 — module-home-meet renders; "Start a meeting" is the create-action label', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openMeet(window)

  // No meeting selected → ModuleHome is rendered.
  const home = window.locator('[data-testid="module-home-meet"]')
  await expect(home).toBeVisible({ timeout: 5_000 })

  // The create button inside ModuleHome is data-testid="module-home-create-meet"
  // (ModuleHome stamps this from moduleKey). Verify it says "Start a meeting".
  const createBtn = home.locator('[data-testid="module-home-create-meet"]')
  await expect(createBtn).toBeVisible()
  await expect(createBtn).toContainText('Start a meeting')
})

// ── Check 5: Record-notes flow and meeting list regressions ──────────────────

test('5 — record-notes button present; adding manual meeting via meet-add still works', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openMeet(window)

  // Record button exists and is not disabled without a running recording.
  const recordBtn = window.locator('[data-testid="meet-record"]')
  await expect(recordBtn).toBeVisible()
  await expect(recordBtn).not.toBeDisabled()

  // Add a meeting via the notes path.
  await window.locator('[data-testid="meet-add"]').click()
  await window.waitForSelector('[data-testid="meet-detail"]', { timeout: 5_000 })

  // A row appears in the list.
  await expect(window.locator('[data-testid^="meet-row-"]').first()).toBeVisible()

  // Detail panel is visible with a title input and summary textarea.
  const detail = window.locator('[data-testid="meet-detail"]')
  await expect(detail).toBeVisible()
  await expect(detail.locator('[data-testid="meet-title"]')).toBeVisible()

  // IPC round-trip: meeting persisted to SQLite.
  const count = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const meetings = await api.meetings.list()
    return (meetings as unknown[]).length
  })
  expect(count, 'one meeting in SQLite after meet-add').toBeGreaterThanOrEqual(1)
})
