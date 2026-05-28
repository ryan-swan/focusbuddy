import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Verify that the webview:link-clicked IPC pipeline is wired end-to-end through
// the real Electron app: main → preload contextBridge → renderer subscriber.
// The pure router decision logic is covered by popupRouter.test.ts unit suite —
// this test only proves the integration plumbing carries the right payload.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('webview:link-clicked IPC carries payload from main to renderer', async () => {
  launched = await launchApp()
  const { window, app } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  // Step 1 — install the listener in the renderer and stash the captured
  // payload on the global object. We do NOT await this; we just register the
  // subscriber and immediately return.
  await window.evaluate(() => {
    const w = window as unknown as {
      __fbCapturedLink: { sourceWebContentsId: number; url: string } | null
      __fbLinkOff: (() => void) | null
      api: typeof window.api
    }
    w.__fbCapturedLink = null
    w.__fbLinkOff = w.api.webview.onLinkClicked((payload) => {
      w.__fbCapturedLink = payload
      w.__fbLinkOff?.()
    })
  })

  // Step 2 — fire the event from main. This is exactly the call site in
  // index.ts's setWindowOpenHandler when a foreground-tab link is denied.
  await app.evaluate(async ({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows()
    wins[0]?.webContents.send('webview:link-clicked', {
      sourceWebContentsId: 999,
      url: 'https://synthetic.example/test'
    })
  })

  // Step 3 — wait until the listener captures the payload, then read it.
  await window.waitForFunction(() => {
    return (window as unknown as { __fbCapturedLink: unknown }).__fbCapturedLink != null
  }, { timeout: 5_000 })

  const captured = await window.evaluate(() => {
    return (
      window as unknown as {
        __fbCapturedLink: { sourceWebContentsId: number; url: string }
      }
    ).__fbCapturedLink
  })

  expect(captured.sourceWebContentsId).toBe(999)
  expect(captured.url).toBe('https://synthetic.example/test')
})
