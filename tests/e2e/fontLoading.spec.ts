/**
 * The Material Symbols icon font is self-hosted (bundled), so icons must load with
 * no network. Regression guard for icons rendering as their raw ligature text
 * (e.g. "auto_awesome") when the Google Fonts CDN was unreachable.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('the Material Symbols icon font is loaded from the bundle', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const info = await window.evaluate(async () => {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready
      const fonts = document.fonts as unknown as {
        check: (f: string) => boolean
      }
      // A material-symbols icon element should exist and resolve to the bundled
      // family, and the font itself must be available (not falling back to text).
      const el = document.querySelector('.material-symbols-outlined') as HTMLElement | null
      const family = el ? getComputedStyle(el).fontFamily : ''
      return {
        hasIconEl: !!el,
        familyOk: family.toLowerCase().includes('material symbols outlined'),
        fontAvailable: fonts.check('24px "Material Symbols Outlined"')
      }
    })
    expect(info.hasIconEl).toBe(true)
    expect(info.familyOk).toBe(true)
    expect(info.fontAvailable).toBe(true)
  } finally {
    await dispose()
  }
})
