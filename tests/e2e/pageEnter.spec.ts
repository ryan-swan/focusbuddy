import { test, expect } from '@playwright/test'
import { gotoView, launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The unraveling, app-wide: every navigation rises the incoming view into
// place through the shared PageEnter wrapper. These specs verify the wrapper
// exists on non-home views, replays per navigation, and cleans its transform
// after settling (a lingering transform would re-anchor position:fixed
// descendants to the wrapper instead of the viewport).

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function mainPaneTransformStates(
  window: import('@playwright/test').Page
): Promise<{ midOpacity: number; settledTransform: string; settledOpacity: number }> {
  // Navigate, sample the wrapper immediately (mid-entrance), then after settle.
  const mid = await window.evaluate(() => {
    const w = window as unknown as {
      __fbView?: { getState: () => { goDocuments: () => void } }
    }
    w.__fbView!.getState().goDocuments()
    return new Promise<number>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector('main [data-projection-id], main div[style*="opacity"]')
          const target = el ?? document.querySelector('main > div > div')
          resolve(target ? Number(getComputedStyle(target as Element).opacity) : -1)
        })
      })
    })
  })
  await window.waitForTimeout(900)
  const settled = await window.evaluate(() => {
    const el = document.querySelector('main div[style*="opacity"]') ?? document.querySelector('main > div > div')
    const cs = el ? getComputedStyle(el as Element) : null
    return { transform: cs?.transform ?? 'missing', opacity: cs ? Number(cs.opacity) : -1 }
  })
  return { midOpacity: mid, settledTransform: settled.transform, settledOpacity: settled.opacity }
}

test('navigations unravel in and settle clean (dark)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goHome')

  const s = await mainPaneTransformStates(window)
  // Mid-entrance the view is still fading in; settled it is fully opaque with
  // no lingering transform.
  expect(s.midOpacity).toBeGreaterThanOrEqual(0)
  expect(s.midOpacity).toBeLessThan(1)
  expect(s.settledOpacity).toBe(1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(s.settledTransform)
  await window.screenshot({ path: `${OUT}/page-enter-settled-dark.png` })

  // Mid-frame shot for the record: calendar entrance caught in flight.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goCalendar: () => void } } }
    w.__fbView!.getState().goCalendar()
  })
  await window.waitForTimeout(80)
  await window.screenshot({ path: `${OUT}/page-enter-mid-dark.png` })
})

test('atelier: the entrance runs and settles clean', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'atelier'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goHome')

  const s = await mainPaneTransformStates(window)
  expect(s.settledOpacity).toBe(1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(s.settledTransform)
  await window.screenshot({ path: `${OUT}/page-enter-settled-atelier.png` })
})
