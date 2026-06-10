// E2E spec: macOS auto-update UX fix
//
// The fix prevents the "update check failed" red flash on macOS by disabling
// autoDownload and autoInstallOnAppQuit (Squirrel.Mac always fails with ad-hoc
// signing). Instead the renderer shows a "Download vX.Y.Z" button that opens
// the releases page in the browser, rather than trying to stage an in-place
// install.
//
// NOTE: the actual electron-updater autoDownload=false behaviour only takes
// effect in a packaged build where the updater runs. That path is exercised
// by code inspection (see src/main/autoUpdate.ts:89-90 — IS_MAC guards both
// flags). This spec exercises the user-visible renderer layer and the IPC
// wiring, which is the full testable surface in a hermetic harness.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Inject an UpdateState event into the focused renderer window. */
async function sendUpdateState(
  l: LaunchedApp,
  state: { kind: string; [k: string]: unknown }
): Promise<void> {
  await l.app.evaluate(({ BrowserWindow }, s) => {
    const wins = BrowserWindow.getAllWindows()
    if (wins[0] && !wins[0].isDestroyed()) {
      wins[0].webContents.send('update:state', s)
    }
  }, state as Record<string, unknown>)
}

/**
 * Install a spy on 'update:open-download' IPC handler. The real handler opens
 * a browser URL — in tests we swap it out for a flag setter so no browser
 * window spawns. Returns a function that reads and returns the invocation count.
 */
async function installOpenDownloadSpy(l: LaunchedApp): Promise<void> {
  await l.app.evaluate(({ ipcMain }) => {
    interface SpyGlobal {
      __fb_open_download_calls: number
    }
    const g = globalThis as unknown as SpyGlobal
    g.__fb_open_download_calls = 0
    ipcMain.removeHandler('update:open-download')
    ipcMain.handle('update:open-download', () => {
      g.__fb_open_download_calls += 1
      return { ok: true as const }
    })
  })
}

async function readOpenDownloadCallCount(l: LaunchedApp): Promise<number> {
  return l.app.evaluate(() => {
    interface SpyGlobal {
      __fb_open_download_calls: number
    }
    return (globalThis as unknown as SpyGlobal).__fb_open_download_calls ?? 0
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('window.api.platform is darwin on the test machine', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const platform = await window.evaluate(() => {
    return (window as unknown as { api: { platform: string } }).api.platform
  })

  // This test suite runs on macOS. The preload must expose process.platform
  // verbatim — any other value means the banner would fall into Windows-mode
  // on a Mac and the fix would be inert.
  expect(platform).toBe('darwin')
})

test('available state on macOS renders the Download button with correct version label', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await sendUpdateState(launched, { kind: 'available', version: '9.9.9' })

  const btn = window.locator('[data-testid="updater-download"]')
  await expect(btn).toBeVisible({ timeout: 5_000 })
  await expect(btn).toContainText('Download v9.9.9')
})

test('clicking the Download button invokes the update:open-download IPC handler', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await installOpenDownloadSpy(launched)
  await sendUpdateState(launched, { kind: 'available', version: '9.9.9' })

  const btn = window.locator('[data-testid="updater-download"]')
  await expect(btn).toBeVisible({ timeout: 5_000 })
  await btn.click()

  // Give the IPC round-trip time to complete.
  await window.waitForTimeout(300)

  const calls = await readOpenDownloadCallCount(launched)
  expect(calls).toBe(1)
})

test('error state renders the retry affordance without crashing', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await sendUpdateState(launched, { kind: 'error', message: 'signature check failed' })

  // The banner should show a retry button — not blank, not crashed.
  // Text is "Update check failed — retry" (with an em-dash in production
  // copy — we match loosely so the test survives copy tweaks).
  await expect(
    window.locator('button', { hasText: /update check failed/i })
  ).toBeVisible({ timeout: 5_000 })
})

test('ready state on macOS also renders the Download button, not an Install button', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await sendUpdateState(launched, { kind: 'ready', version: '9.9.9' })

  // On macOS the ready state should show the same download-to-replace path,
  // not the Windows in-place install button.
  const dlBtn = window.locator('[data-testid="updater-download"]')
  await expect(dlBtn).toBeVisible({ timeout: 5_000 })
  await expect(dlBtn).toContainText('Download v9.9.9')

  // The Windows-style "Install" button must NOT appear.
  const installBtn = window.locator('button', { hasText: /^install v/i })
  await expect(installBtn).toHaveCount(0)
})
