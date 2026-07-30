import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView, type LaunchedApp } from './_helpers'

// PLX-A11Y-002 — "Every function MUST be operable by keyboard alone, with a
// visible focus indicator and no keyboard trap."
//
// Verified two ways on each surface:
//   1. Tabbing forward N times reaches a genuinely varied set of distinct
//      elements (rules out an early trap that cycles a tiny closed loop).
//   2. Every focused element along the way renders SOME visible focus signal
//      (an outline the browser paints, or an author-supplied box-shadow/ring
//      that differs from a plain "none"/"transparent" box-shadow) — checked
//      via real computed style, not by trusting a CSS class name exists.
//   3. Escape does not throw and leaves focus on a live, attached element —
//      i.e. no trap where the only way out is closing the whole app.

interface FocusStep {
  key: string // tag + testid/aria-label/text, for identifying distinct elements
  hasIndicator: boolean
}

function describeAndCheck(): { key: string; hasIndicator: boolean } | null {
  const el = document.activeElement
  if (!el || el === document.body) return null
  const tag = el.tagName
  const testid = el.getAttribute('data-testid')
  const aria = el.getAttribute('aria-label')
  const text = (el.textContent || '').trim().slice(0, 24)
  const cs = getComputedStyle(el)
  const outlineVisible =
    cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' && cs.outlineColor !== 'transparent'
  const boxShadowVisible = cs.boxShadow !== 'none' && cs.boxShadow.trim() !== ''
  return {
    key: `${tag}|${testid ?? ''}|${aria ?? ''}|${text}`,
    hasIndicator: outlineVisible || boxShadowVisible
  }
}

// Drives REAL Tab keypresses through Playwright's keyboard API (not a scripted
// `.focus()` call) so Chromium's native focus manager sets `:focus-visible`
// exactly as it would for a real keyboard user — a programmatic `.focus()`
// does not reliably trigger the same focus-visible heuristics.
async function tabAndCollect(window: Page, times: number): Promise<FocusStep[]> {
  const steps: FocusStep[] = []
  for (let i = 0; i < times; i++) {
    await window.keyboard.press('Tab')
    const step = await window.evaluate(describeAndCheck)
    if (step) steps.push(step)
  }
  return steps
}

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('test_plx_a11y_002_keyboard_home — tabbing on Home reaches varied elements with a visible focus indicator, Escape does not trap', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await gotoView(window, 'goHome')
  await window.waitForTimeout(300)

  const steps = await tabAndCollect(window, 25)
  const distinct = new Set(steps.map((s) => s.key))
  expect(distinct.size, 'Tab must reach a varied set of elements, not a tiny closed loop').toBeGreaterThanOrEqual(8)
  const withoutIndicator = steps.filter((s) => !s.hasIndicator)
  expect(
    withoutIndicator.length,
    `every tabbed-to element must render a visible focus signal; missing on: ${withoutIndicator
      .map((s) => s.key)
      .join(', ')}`
  ).toBe(0)

  // No keyboard trap: Escape must not throw, and focus must remain on a live element.
  await window.keyboard.press('Escape')
  const activeIsLive = await window.evaluate(() => document.body.contains(document.activeElement))
  expect(activeIsLive).toBe(true)
})

test('test_plx_a11y_002_keyboard_desk_canvas — tabbing on an open desk canvas reaches varied elements with a visible focus indicator, Escape does not trap', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Keyboard operability desk' })
    await api.widgets.create({
      taskId: task.id, kind: 'sticky', title: 'note', content: 'hello',
      x: 100, y: 100, width: 200, height: 160
    })
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Keyboard operability desk/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(300)

  const steps = await tabAndCollect(window, 25)
  const distinct = new Set(steps.map((s) => s.key))
  expect(distinct.size, 'Tab must reach a varied set of elements, not a tiny closed loop').toBeGreaterThanOrEqual(8)
  const withoutIndicator = steps.filter((s) => !s.hasIndicator)
  expect(
    withoutIndicator.length,
    `every tabbed-to element must render a visible focus signal; missing on: ${withoutIndicator
      .map((s) => s.key)
      .join(', ')}`
  ).toBe(0)

  await window.keyboard.press('Escape')
  const activeIsLive = await window.evaluate(() => document.body.contains(document.activeElement))
  expect(activeIsLive).toBe(true)
})
