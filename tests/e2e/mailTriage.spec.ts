/**
 * E2E: keyboard triage (j/k/r/a) in Mail (src/renderer/src/components/views/MailView.tsx).
 *
 * HONESTY NOTE: the test harness has no real IMAP account, so the live
 * archive-a-real-message and reply-to-a-real-thread paths are NOT exercised
 * here — that needs a real mailbox. What IS verified honestly:
 *   1. window.api.mail.archive exists and, called with no account connected,
 *      returns { ok: false, error: 'No mail account connected.' } rather than
 *      throwing or silently succeeding.
 *   2. With no account connected (Mail renders SetupForm, no message list),
 *      pressing j/k/r/a does not throw or crash the app — the keydown
 *      handler's `list.length === 0` guard makes them a no-op.
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

test('window.api.mail.archive reports the honest no-account error', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.mail.archive(1)
  })
  expect(result).toEqual({ ok: false, error: 'No mail account connected.' })
})

test('j/k/r/a keydown handling does not crash Mail when no account is connected', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (err) => pageErrors.push(err.message))

  await waitForReady(window)

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
    w.__fbView?.getState().goMail?.()
  })
  await window.waitForTimeout(500)

  // No account connected → SetupForm renders, no message list.
  for (const key of ['j', 'k', 'r', 'a']) {
    await window.keyboard.press(key)
    await window.waitForTimeout(100)
  }

  expect(pageErrors).toHaveLength(0)
})
