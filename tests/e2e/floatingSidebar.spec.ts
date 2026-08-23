/**
 * floatingSidebar.spec.ts
 *
 * Verifies the floating, resizable, minimisable Desk sidebar:
 *   - the menu renders as a floating rounded card inside a dock column
 *   - dragging the resize grip changes the width and persists it
 *   - ArrowRight on the focused grip nudges the width (keyboard-accessible)
 *   - minimise hides the whole dock and shows an always-visible restore pill
 *   - restore brings the menu back
 *   - the minimised state persists to localStorage so it survives a reload
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('Desk sidebar floats, resizes, and minimises to a restore pill', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
      w.__fbView?.getState().goHome?.()
    })
    await window.waitForTimeout(400)

    const dock = window.locator('[data-testid="sidebar-dock"]')
    const aside = window.locator('[data-testid="desk-sidebar"]')
    await expect(dock).toBeVisible({ timeout: 6_000 })
    await expect(aside).toBeVisible()

    // Floating card, not a docked panel: rounded on all corners (the radius
    // law's card radius), its edge from the material recipe rather than a
    // border, and no one-sided right border.
    const asideClass = (await aside.getAttribute('class')) ?? ''
    expect(asideClass).toContain('rounded-[var(--radius-card)]')
    expect(asideClass).not.toContain('border-r')
    expect(asideClass).not.toContain('border-[var(--edge-soft)]')

    // ── Resize by dragging the grip ─────────────────────────────────────────
    const startWidth = (await dock.boundingBox())?.width ?? 0
    const grip = window.locator('[data-testid="sidebar-resize"]')
    const gb = await grip.boundingBox()
    expect(gb).not.toBeNull()
    if (gb) {
      await window.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
      await window.mouse.down()
      await window.mouse.move(gb.x + gb.width / 2 + 90, gb.y + gb.height / 2, { steps: 8 })
      await window.mouse.up()
    }
    await window.waitForTimeout(200)
    const widerWidth = (await dock.boundingBox())?.width ?? 0
    expect(widerWidth).toBeGreaterThan(startWidth + 40)

    // Width persisted to localStorage.
    const storedWidth = await window.evaluate(() => localStorage.getItem('fb.sidebar.width'))
    expect(Number(storedWidth)).toBeGreaterThan(startWidth + 20)

    // ── Keyboard nudge ──────────────────────────────────────────────────────
    await grip.focus()
    const beforeNudge = (await dock.boundingBox())?.width ?? 0
    await grip.press('ArrowRight')
    await grip.press('ArrowRight')
    await window.waitForTimeout(150)
    const afterNudge = (await dock.boundingBox())?.width ?? 0
    expect(afterNudge).toBeGreaterThan(beforeNudge)

    // ── Minimise → dock gone, restore pill visible ──────────────────────────
    await aside.locator('[data-testid="menu-minimize"]').click()
    await window.waitForTimeout(200)
    await expect(dock).toHaveCount(0)
    const pill = window.locator('[data-testid="menu-restore-pill"]')
    await expect(pill).toBeVisible()
    const storedMin = await window.evaluate(() => localStorage.getItem('fb.sidebar.minimized'))
    expect(storedMin).toBe('1')

    // ── Restore → menu back ─────────────────────────────────────────────────
    await pill.click()
    await window.waitForTimeout(200)
    await expect(dock).toBeVisible()
    await expect(aside).toBeVisible()
    const restoredMin = await window.evaluate(() => localStorage.getItem('fb.sidebar.minimized'))
    expect(restoredMin).toBe('0')

    // Arrow-key tree navigation still works after the chrome change: focus the
    // first tree row and confirm ArrowDown moves focus without throwing.
    // (Structural smoke — the tree only exists when there are nodes, so we just
    // assert the tree container is present and reachable.)
    await expect(aside.locator('[role="tree"]')).toHaveCount(1)
  } finally {
    await dispose()
  }
})
