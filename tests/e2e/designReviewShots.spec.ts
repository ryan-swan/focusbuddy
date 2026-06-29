/**
 * Design review screenshot capture — NOT a functional test.
 *
 * Captures three screens for design reviewers:
 *   1. People Map view (unauthenticated honest empty state)
 *   2. Team presence popover (with appear-offline toggle visible)
 *   3. Home / main shell aesthetic overview
 *
 * Saves PNGs to the session scratchpad under plexi-shots/.
 *
 * Run with:
 *   npx playwright test tests/e2e/designReviewShots.spec.ts --timeout 120000
 */

import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { execSync } from 'child_process'

const OUT_DIR =
  '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad/plexi-shots'

test.setTimeout(120_000)

test('capture design review screenshots', async () => {
  const { app, window, dispose } = await launchApp()

  // Resize to 1440×900 so the chrome breathes and the header is fully visible.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setContentSize(1440, 900)
      win.center()
    }
  })

  try {
    await waitForReady(window)

    // Set the futuristic theme so everything looks on-brand.
    await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'futuristic'))
    await window.reload()
    await waitForReady(window)

    // ── 1. Home / main shell ─────────────────────────────────────────────────
    // After waitForReady the home dashboard or the first desk view is visible.
    // Take the screenshot here before navigating anywhere — this is the raw
    // first-run aesthetic that reviewers want to judge.
    await window.waitForTimeout(800) // let layout fully settle
    await window.screenshot({ path: `${OUT_DIR}/home.png`, fullPage: false })
    console.log('[shots] wrote home.png')

    // ── 2. People Map ────────────────────────────────────────────────────────
    // Navigate via the sidebar "People Map" button. Scope away from the home-
    // dashboard quick-action to avoid a strict-mode hit.
    const navPeopleMap = window
      .getByRole('button', { name: 'People Map' })
      .filter({ hasNot: window.locator('[data-testid="home-dashboard"]') })
      .first()

    const navVisible = await navPeopleMap.isVisible({ timeout: 5_000 }).catch(() => false)
    if (navVisible) {
      await navPeopleMap.click()
    } else {
      // Fallback: evaluate-based click by text content
      await window.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
        const btn = btns.find(
          (el) =>
            el.getAttribute('title') === 'People Map' ||
            (el as HTMLElement).innerText?.trim() === 'People Map' ||
            Array.from(el.querySelectorAll('span')).some((s) => s.textContent?.trim() === 'People Map')
        )
        ;(btn as HTMLElement | undefined)?.click()
      })
    }

    // Wait for the people-map root to appear (succeeds in unauth state too).
    const pmRoot = window.locator('[data-testid="people-map"]')
    const pmVisible = await pmRoot.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)

    await window.waitForTimeout(600) // let any async effects settle
    await window.screenshot({ path: `${OUT_DIR}/people-map.png`, fullPage: false })
    if (pmVisible) {
      console.log('[shots] wrote people-map.png (people-map root mounted)')
    } else {
      console.log('[shots] wrote people-map.png (people-map root not found — captured current state)')
    }

    // ── 3. Team presence popover ─────────────────────────────────────────────
    // Navigate home first so the full header chrome is visible in the shot.
    const homeBtn = window.getByRole('button', { name: /^home$/i }).first()
    const homeBtnVisible = await homeBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (homeBtnVisible) {
      await homeBtn.click()
      await window.waitForTimeout(500)
    }

    // Collapse the assistant panel so the presence popover is NOT obscured by
    // the right-side chat rail when we take the screenshot.
    // The collapse button has title="Hide assistant panel" (ChatPanel.tsx line 228).
    await window.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const collapseBtn = btns.find(
        (b) =>
          b.getAttribute('title') === 'Hide assistant panel' ||
          b.getAttribute('aria-label') === 'Hide assistant panel' ||
          b.getAttribute('title')?.toLowerCase().includes('hide assistant') ||
          b.getAttribute('aria-label')?.toLowerCase().includes('hide assistant')
      )
      if (collapseBtn) {
        collapseBtn.click()
        console.log('[shots-eval] collapse clicked:', collapseBtn.getAttribute('title'))
      } else {
        console.log('[shots-eval] collapse button not found, titles:', btns.slice(0,10).map(b => b.getAttribute('title')).join('|'))
      }
    })
    await window.waitForTimeout(600)

    // Find and click the Team presence button via evaluate.
    const presenceClicked = await window.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
      const btn = btns.find(
        (el) =>
          el.getAttribute('aria-label') === 'Team presence' ||
          (el as HTMLElement).title?.includes('Team')
      ) as HTMLElement | undefined
      if (btn) {
        btn.click()
        return true
      }
      return false
    })

    if (presenceClicked) {
      // Wait for the popover body: the "Team" heading inside the popover.
      const teamHeading = window.getByRole('heading', { name: /^team$/i })
      const headingVisible = await teamHeading.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
      console.log('[shots] team heading visible:', headingVisible)

      // Diagnostic: dump what headings actually exist and whether the appear-offline
      // testid is anywhere in the DOM.
      const diag = await window.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
          (h) => `${h.tagName}: "${h.textContent?.trim().slice(0, 50)}"`
        )
        const hasToggle = !!document.querySelector('[data-testid="presence-appear-offline"]')
        const popoverEl = document.querySelector('.rounded-xl.border.bg-white, .rounded-xl.border.bg-stone-900')
        const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).map(
          (el) => el.getAttribute('data-testid')
        ).filter((id) => id?.includes('presence'))
        return {
          headings,
          hasToggle,
          allPresenceTestIds: allTestIds,
          popoverElTag: popoverEl?.tagName,
          popoverClass: popoverEl?.getAttribute('class')?.slice(0, 80),
          popoverInnerText: (popoverEl as HTMLElement | null)?.innerText?.slice(0, 200)
        }
      })
      console.log('[shots] diag:', JSON.stringify(diag))

      // The header uses backdrop-filter (fb-glass-chrome) which creates a CSS
      // stacking context that confines the popover's z-50 within the header's
      // 40px height. To capture the popover visually, inject CSS that makes the
      // popover escape its stacking context by setting position:fixed on the
      // popover root element, anchored to the top-right of the viewport.
      const popoverFixed = await window.evaluate(() => {
        const toggleEl = document.querySelector('[data-testid="presence-appear-offline"]') as HTMLElement | null
        if (!toggleEl) return false
        let el: HTMLElement | null = toggleEl
        while (el && !(el.getAttribute('class') || '').includes('rounded-xl')) el = el.parentElement
        if (!el) return false
        // Reposition to fixed in the viewport top-right corner.
        el.style.position = 'fixed'
        el.style.top = '48px'
        el.style.right = '8px'
        el.style.zIndex = '99999'
        return true
      })
      console.log('[shots] popover repositioned to fixed:', popoverFixed)

      await window.waitForTimeout(400) // let repaint settle

      // Full-window shot with popover in fixed position.
      await window.screenshot({ path: `${OUT_DIR}/debug-fullwindow.png`, fullPage: false })
      console.log('[shots] wrote debug-fullwindow.png')

      // Get the OS-level window position so we can use macOS screencapture
      // to capture the true composited pixel region. Playwright's clip uses the
      // Chromium renderer's idea of z-order, which places the popover behind the
      // assistant panel's stacking context. macOS screencapture captures the actual
      // composited screen and sees the popover on top as intended.
      const winPos = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]
        return { x: w.getPosition()[0], y: w.getPosition()[1] }
      })

      // Get popover CSS-pixel bounds from the DOM (after fixed repositioning).
      const cssBounds = await window.evaluate(() => {
        const toggleEl = document.querySelector('[data-testid="presence-appear-offline"]') as HTMLElement | null
        if (toggleEl) {
          let el: HTMLElement | null = toggleEl
          while (el && !(el.getAttribute('class') || '').includes('rounded-xl')) el = el.parentElement
          if (el) {
            const r = el.getBoundingClientRect()
            return { left: r.left, top: r.top, width: r.width, height: r.height }
          }
        }
        return null
      })

      // macOS screencapture uses physical pixels and the screen coordinate system.
      // The window position from BrowserWindow.getPosition() is in points (same
      // as CSS px on Retina). Convert CSS-px bounds → screen points by adding
      // the window origin. Then pass to screencapture -R x,y,w,h (points).
      async function screencapturePopover(outPath: string): Promise<boolean> {
        if (!cssBounds) return false
        const pad = 8
        const sx = winPos.x + cssBounds.left - pad
        const sy = winPos.y + cssBounds.top - pad
        const sw = cssBounds.width + pad * 2
        const sh = cssBounds.height + pad * 2
        try {
          execSync(`screencapture -R "${sx},${sy},${sw},${sh}" -x "${outPath}"`)
          return true
        } catch {
          return false
        }
      }

      // Shot 1: popover in default state (toggle OFF, "Appear offline" label visible).
      const sc1ok = await screencapturePopover(`${OUT_DIR}/team-popover.png`)
      if (sc1ok) {
        console.log('[shots] wrote team-popover.png (macOS screencapture, appear-offline=OFF state) cssX:', cssBounds?.left)
      } else {
        await window.screenshot({ path: `${OUT_DIR}/team-popover.png`, fullPage: false })
        console.log('[shots] wrote team-popover.png (full-window Playwright fallback)')
      }

      // Activate the toggle via evaluate to bypass pointer-event interception.
      const toggled = await window.evaluate(() => {
        const btn = document.querySelector('[data-testid="presence-appear-offline"]') as HTMLElement | null
        if (btn) { btn.click(); return true }
        return false
      })
      if (toggled) {
        await window.waitForTimeout(500)
        // Shot 2: popover with toggle ON — "Appearing offline to others" self-label.
        const sc2ok = await screencapturePopover(`${OUT_DIR}/team-popover-invisible.png`)
        if (sc2ok) {
          console.log('[shots] wrote team-popover-invisible.png (macOS screencapture, appear-offline=ON state)')
        } else {
          await window.screenshot({ path: `${OUT_DIR}/team-popover-invisible.png`, fullPage: false })
          console.log('[shots] wrote team-popover-invisible.png (full-window Playwright fallback)')
        }
      } else {
        console.log('[shots] appear-offline button not found in DOM — skipping invisible-state shot')
      }
    } else {
      // Header button not found — screenshot whatever is on screen.
      await window.screenshot({ path: `${OUT_DIR}/team-popover.png`, fullPage: false })
      console.log('[shots] wrote team-popover.png (presence button not found — captured current state)')
    }

    console.log('[shots] All captures done.')
  } finally {
    await dispose()
  }
})
