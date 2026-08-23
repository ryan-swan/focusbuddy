import { test, expect } from '@playwright/test'
import { gotoView, launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for App-UI phase 5b: the Documents hub aligned to the
// design system. The critical check is atelier: the old header hardcoded
// dark:text-stone-100, which atelier's cream paper rendered at ~1.05:1
// contrast (invisible). Throwaway; delete when the phase closes.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedDocs(window: import('@playwright/test').Page): Promise<void> {
  await window.evaluate(async () => {
    const w = window as unknown as {
      __fbDocuments?: {
        getState: () => { createBlank: (t: string, title: string) => Promise<unknown> }
      }
    }
    const st = w.__fbDocuments!.getState()
    await st.createBlank('doc', 'Launch plan')
    await st.createBlank('sheet', 'Budget tracker')
    await st.createBlank('slides', 'Pitch deck')
  })
}

test('documents hub: empty and populated, dark', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goDocuments')
  await window.waitForTimeout(600)
  await window.screenshot({ path: `${OUT}/5b-docs-empty-dark.png` })

  await seedDocs(window)
  await gotoView(window, 'goHome')
  await gotoView(window, 'goDocuments')
  await window.waitForTimeout(700)
  await window.screenshot({ path: `${OUT}/5b-docs-recent-dark.png` })
})

test('atelier: the Documents heading is legible again', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'atelier'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goDocuments')
  await window.waitForTimeout(600)

  // The heading must resolve to a token ink with real contrast, not a
  // dark:-variant grey. Assert on computed color: it must differ hugely from
  // the page background luminance (the old bug was ~1.05:1).
  const legible = await window.evaluate(() => {
    const h = [...document.querySelectorAll('h1, [class*="fb-display"], header p, h2')].find(
      (el) => el.textContent?.trim() === 'Documents'
    )
    if (!h) return { found: false, ratio: 0 }
    // Normalize any CSS color (rgb, oklch, …) to sRGB via a 1x1 canvas —
    // Chromium serializes oklch-specified colors as oklch(), which naive
    // rgb parsing silently misreads.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const lum = (c: string): number => {
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const f = (v: number): number => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fg = lum(getComputedStyle(h).color)
    // Walk up for the effective background.
    let el: Element | null = h
    let bgc = ''
    while (el) {
      const c = getComputedStyle(el).backgroundColor
      if (c && !c.includes('rgba(0, 0, 0, 0)')) {
        bgc = c
        break
      }
      el = el.parentElement
    }
    const bg = bgc ? lum(bgc) : 0.94
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    return { found: true, ratio }
  })
  expect(legible.found).toBe(true)
  expect(legible.ratio).toBeGreaterThan(4)
  await window.screenshot({ path: `${OUT}/5b-docs-atelier.png` })
})
