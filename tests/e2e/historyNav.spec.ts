import { test, expect } from '@playwright/test'
import { gotoView, launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The true back button: global back/forward in the titlebar wired to the view
// store's history stacks, plus ⌘←/⌘→. Back exists on every view now, not just
// inside the desk canvas.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function viewKind(window: import('@playwright/test').Page): Promise<string> {
  return await window.evaluate(() => {
    const w = window as unknown as {
      __fbView?: { getState: () => { view: { kind: string } } }
    }
    return w.__fbView!.getState().view.kind
  })
}

test('titlebar back/forward walk the navigation history', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)

  const backBtn = window.locator('[data-testid="history-back"]')
  const fwdBtn = window.locator('[data-testid="history-forward"]')

  // Build history: home → documents → calendar.
  await gotoView(window, 'goHome')
  await gotoView(window, 'goDocuments')
  await gotoView(window, 'goCalendar')
  expect(await viewKind(window)).toBe('calendar')
  await expect(backBtn).toBeEnabled()
  await window.screenshot({ path: `${OUT}/history-nav-dark.png` })

  await backBtn.click()
  expect(await viewKind(window)).toBe('documents')
  await backBtn.click()
  expect(await viewKind(window)).toBe('home')
  await expect(fwdBtn).toBeEnabled()

  await fwdBtn.click()
  expect(await viewKind(window)).toBe('documents')

  // ⌘← goes back again.
  await window.keyboard.press('Meta+ArrowLeft')
  expect(await viewKind(window)).toBe('home')
  // ⌘→ forward.
  await window.keyboard.press('Meta+ArrowRight')
  expect(await viewKind(window)).toBe('documents')
})

test('⌘← never fires while typing, and atelier chrome holds', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'atelier'))
  await window.reload()
  await waitForReady(window)

  await gotoView(window, 'goHome')
  await gotoView(window, 'goDocuments')
  await window.screenshot({ path: `${OUT}/history-nav-atelier.png` })

  // Focus a text field (the ⌘K palette input) and press ⌘← — the view must
  // not change; the editor owns line-start.
  await window.keyboard.press('Meta+k')
  const palette = window.locator('input:focus, [contenteditable="true"]:focus')
  if (await palette.first().isVisible().catch(() => false)) {
    await window.keyboard.type('hello')
    await window.keyboard.press('Meta+ArrowLeft')
    expect(await viewKind(window)).toBe('documents')
    await window.keyboard.press('Escape')
  }

  // Outside a field it works.
  await window.keyboard.press('Meta+ArrowLeft')
  expect(await viewKind(window)).toBe('home')
})
