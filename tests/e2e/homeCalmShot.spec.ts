import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

const OUT =
  '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad/plexi-shots'

test.setTimeout(60_000)

test('home calm product grid screenshot', async () => {
  const { app, window, dispose } = await launchApp()
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) { w.setContentSize(1440, 900); w.center() }
  })
  try {
    await waitForReady(window)
    await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'futuristic'))
    await window.reload()
    await waitForReady(window)
    await window.waitForTimeout(1000)
    await window.screenshot({ path: `${OUT}/home-calm.png` })
    console.log('[calm] wrote home-calm.png')
  } finally {
    await dispose()
  }
})
