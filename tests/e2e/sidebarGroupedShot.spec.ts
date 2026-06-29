import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

const OUT =
  '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad/plexi-shots'

test.setTimeout(60_000)

test('sidebar grouped sections screenshot', async () => {
  const { app, window, dispose } = await launchApp()
  // Taller window so more of the sidebar fits in one shot
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) { w.setContentSize(1440, 1050); w.center() }
  })
  try {
    await waitForReady(window)
    await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'futuristic'))
    await window.reload()
    await waitForReady(window)
    await window.waitForTimeout(800)
    // Scroll sidebar to top
    await window.evaluate(() => {
      const sidebar = document.querySelector('aside, nav, [class*="sidebar"]') as HTMLElement | null
      if (sidebar) sidebar.scrollTop = 0
    })
    await window.waitForTimeout(300)
    await window.screenshot({ path: `${OUT}/sidebar-grouped.png` })
    console.log('[sidebar] wrote sidebar-grouped.png')
  } finally {
    await dispose()
  }
})
