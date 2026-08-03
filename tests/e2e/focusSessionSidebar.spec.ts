import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Verifies the CSS fix for focus-session-active sidebar legibility.
//
// Before the fix: `.focus-session-active aside` was opacity 0.28 (base) and
// opacity 0.22 + blur(2px) in futuristic — making the navigation unreadable.
//
// After the fix: base theme uses opacity 0.62 with no blur; futuristic uses
// opacity 0.6 with no blur.
//
// Strategy: disable CSS transitions on the <aside> and <header> before
// toggling the focus-session-active class so getComputedStyle immediately
// returns the TARGET value rather than a mid-transition interpolated value.
// This mirrors the actual CSS rule intent and avoids flaky timing.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Index 0 = leftmost aside (the navigation sidebar). Returns all asides sorted
 *  by their left bounding-box position so the navigation sidebar is always [0].
 */
async function getAsideStyles(
  window: Awaited<ReturnType<typeof launchApp>>['window']
): Promise<Array<{ index: number; left: number; opacity: number; filter: string }>> {
  return window.evaluate(() => {
    const asides = Array.from(document.querySelectorAll('aside'))
    return asides
      .map((el, i) => {
        const rect = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
          index: i,
          left: rect.left,
          opacity: parseFloat(cs.opacity),
          filter: cs.filter ?? 'none'
        }
      })
      .sort((a, b) => a.left - b.left)
  })
}

/** Freeze transitions on all asides and headers so getComputedStyle reads the
 *  TARGET value, not a mid-transition interpolated value. */
async function freezeTransitions(
  window: Awaited<ReturnType<typeof launchApp>>['window']
): Promise<void> {
  await window.evaluate(() => {
    const els = [
      ...Array.from(document.querySelectorAll('aside')),
      ...Array.from(document.querySelectorAll('header')),
      ...Array.from(document.querySelectorAll('footer'))
    ]
    for (const el of els) {
      ;(el as HTMLElement).style.transition = 'none'
    }
  })
}

/** Restore transitions (remove inline override). */
async function restoreTransitions(
  window: Awaited<ReturnType<typeof launchApp>>['window']
): Promise<void> {
  await window.evaluate(() => {
    const els = [
      ...Array.from(document.querySelectorAll('aside')),
      ...Array.from(document.querySelectorAll('header')),
      ...Array.from(document.querySelectorAll('footer'))
    ]
    for (const el of els) {
      ;(el as HTMLElement).style.transition = ''
    }
  })
}

// ---------------------------------------------------------------------------
// Test 1 — BASE THEME: focus-session-active sidebar opacity >= 0.5 and no blur
// ---------------------------------------------------------------------------
test('BASE THEME: focus-session-active sidebar opacity >= 0.5 and no blur', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Ensure futuristic is NOT active for base-theme assertions.
  await window.evaluate(() => {
    document.documentElement.classList.remove('futuristic')
  })

  // Freeze transitions so the computed style instantly reflects the target
  // value — avoids capturing a mid-transition interpolated opacity.
  await freezeTransitions(window)

  // Toggle the class exactly as FocusSessionOverlay does.
  await window.evaluate(() => {
    document.documentElement.classList.add('focus-session-active')
  })

  // One rAF tick is enough now that transitions are frozen.
  await window.waitForTimeout(50)

  const asides = await getAsideStyles(window)
  const sidebar = asides[0] // leftmost = navigation sidebar

  // Clean up before assertions to keep teardown clean.
  await window.evaluate(() => {
    document.documentElement.classList.remove('focus-session-active')
  })
  await restoreTransitions(window)

  console.log(`[BASE] leftmost aside: opacity=${sidebar.opacity}  filter="${sidebar.filter}"`)

  // PRIMARY: sidebar must be legible — opacity was 0.28 before the fix.
  expect(sidebar.opacity).toBeGreaterThanOrEqual(0.5)

  // PRIMARY: no blur — was blur(0.5px) shared with header before the fix.
  const hasBlur =
    sidebar.filter !== 'none' &&
    sidebar.filter.includes('blur(') &&
    !sidebar.filter.includes('blur(0')
  expect(hasBlur).toBe(false)

  // REGRESSION GUARD: still de-emphasised (not at full opacity) — ambience preserved.
  expect(sidebar.opacity).toBeLessThan(1)

  // REGRESSION GUARD: sits in the expected legible-but-backgrounded range (~0.62).
  expect(sidebar.opacity).toBeGreaterThanOrEqual(0.55)
  expect(sidebar.opacity).toBeLessThanOrEqual(0.95)
})

// ---------------------------------------------------------------------------
// Test 2 — FUTURISTIC THEME: focus-session-active sidebar opacity >= 0.5 and no blur
// ---------------------------------------------------------------------------
test('FUTURISTIC THEME: focus-session-active sidebar opacity >= 0.5 and no blur', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await freezeTransitions(window)

  // Enable both futuristic + focus-session together.
  await window.evaluate(() => {
    document.documentElement.classList.add('futuristic')
    document.documentElement.classList.add('focus-session-active')
  })

  await window.waitForTimeout(50)

  const asides = await getAsideStyles(window)
  const sidebar = asides[0]

  await window.evaluate(() => {
    document.documentElement.classList.remove('futuristic', 'focus-session-active')
  })
  await restoreTransitions(window)

  console.log(
    `[FUTURISTIC] leftmost aside: opacity=${sidebar.opacity}  filter="${sidebar.filter}"`
  )

  // PRIMARY: opacity was 0.22 before the fix — must now be >= 0.5.
  expect(sidebar.opacity).toBeGreaterThanOrEqual(0.5)

  // PRIMARY: no blur — was blur(2px) before the fix.
  const hasBlur =
    sidebar.filter !== 'none' &&
    sidebar.filter.includes('blur(') &&
    !sidebar.filter.includes('blur(0')
  expect(hasBlur).toBe(false)

  // REGRESSION GUARD: still de-emphasised.
  expect(sidebar.opacity).toBeLessThan(1)

  // REGRESSION GUARD: in the legible range ~0.60.
  expect(sidebar.opacity).toBeGreaterThanOrEqual(0.55)
  expect(sidebar.opacity).toBeLessThanOrEqual(0.95)
})

// ---------------------------------------------------------------------------
// Test 3 — HEADER stays properly dimmed (regression guard for other elements)
// ---------------------------------------------------------------------------
test('focus-session-active header stays dimmed (header/footer dim is preserved)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.evaluate(() => {
    document.documentElement.classList.remove('futuristic')
  })
  await freezeTransitions(window)

  await window.evaluate(() => {
    document.documentElement.classList.add('focus-session-active')
  })
  await window.waitForTimeout(50)

  const headerStyle = await window.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) return { opacity: 1, filter: 'none' }
    const cs = getComputedStyle(header)
    return { opacity: parseFloat(cs.opacity), filter: cs.filter ?? 'none' }
  })

  await window.evaluate(() => {
    document.documentElement.classList.remove('focus-session-active')
  })
  await restoreTransitions(window)

  console.log(`[HEADER] opacity=${headerStyle.opacity}  filter="${headerStyle.filter}"`)

  // Header should be noticeably dimmed (< 0.5 in the base theme, target 0.28).
  // This regression guard proves the fix didn't accidentally remove ALL
  // focus-session-active dimming — only the sidebar was exempted.
  expect(headerStyle.opacity).toBeLessThan(0.5)
})

// ---------------------------------------------------------------------------
// Test 4 — CLEANUP: after removing the class, aside returns to full opacity
// ---------------------------------------------------------------------------
test('sidebar returns to full opacity once focus-session-active is removed', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Add then remove — no need to freeze transitions here; we wait after removal.
  await window.evaluate(() => {
    document.documentElement.classList.add('focus-session-active')
  })
  await window.waitForTimeout(30)
  await window.evaluate(() => {
    document.documentElement.classList.remove('focus-session-active')
  })

  // Wait for the 700ms restore transition to complete.
  await window.waitForTimeout(800)

  const asides = await getAsideStyles(window)
  const sidebar = asides[0]

  console.log(`[CLEANUP] opacity=${sidebar.opacity}  filter="${sidebar.filter}"`)

  // With no focus-session class the aside should be fully opaque.
  expect(sidebar.opacity).toBeCloseTo(1, 1)
})
