import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

const OUT_DIR =
  '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad/plexi-shots'

test.setTimeout(120_000)

test('simple full-window design shots', async () => {
  const { app, window, dispose } = await launchApp()

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { win.setContentSize(1440, 900); win.center() }
  })

  try {
    await waitForReady(window)
    await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'futuristic'))
    await window.reload()
    await waitForReady(window)
    await window.waitForTimeout(800)

    // 1. Home / shell
    await window.screenshot({ path: `${OUT_DIR}/home.png` })
    console.log('[simple] wrote home.png')

    // 2. People Map
    const clicked = await window.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
      const btn = btns.find(
        (el) =>
          el.getAttribute('title') === 'People Map' ||
          (el as HTMLElement).innerText?.trim() === 'People Map' ||
          Array.from(el.querySelectorAll('span')).some((s) => s.textContent?.trim() === 'People Map')
      )
      if (btn) { (btn as HTMLElement).click(); return true }
      return false
    })
    if (clicked) {
      await window.waitForTimeout(1000)
      await window.screenshot({ path: `${OUT_DIR}/people-map.png` })
      console.log('[simple] wrote people-map.png')
    } else {
      console.log('[simple] SKIP people-map.png — nav item not found')
    }

    // 3. Team presence popover
    const presenceClicked = await window.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
      const btn = btns.find(
        (el) => el.getAttribute('aria-label') === 'Team presence'
      ) as HTMLElement | undefined
      if (btn) { btn.click(); return true }
      return false
    })
    if (presenceClicked) {
      await window.waitForTimeout(800)
      await window.screenshot({ path: `${OUT_DIR}/team-popover.png` })
      console.log('[simple] wrote team-popover.png')

      // Toggle appear-offline and capture second state
      const toggled = await window.evaluate(() => {
        const btn = document.querySelector('[data-testid="presence-appear-offline"]') as HTMLElement | null
        if (btn) { btn.click(); return true }
        return false
      })
      if (toggled) {
        await window.waitForTimeout(500)
        await window.screenshot({ path: `${OUT_DIR}/team-popover-invisible.png` })
        console.log('[simple] wrote team-popover-invisible.png')
      }
    } else {
      console.log('[simple] SKIP team-popover.png — presence button not found')
    }

    console.log('[simple] done')
  } finally {
    await dispose()
  }
})
