/**
 * sidebarVisualParity.spec.ts
 *
 * Verifies that the restyled global Desk Sidebar (Sidebar.tsx) matches the
 * canonical PlexiOffice OfficeSidebar (PlexiOfficeShell.tsx) visual system:
 *
 *   - aside bg-[var(--surface-raised)] + rounded-[var(--radius-card)] floating card whose edge
 *     comes from light (hairline ring + cast shadow + inset highlight), not a 1px border
 *   - 14-tall header with 15px bold tracking-[0.14em] wordmark
 *   - SegmentSwitcher present
 *   - Nav rows: rounded-lg, accent/0.12 tint + accent text when active
 *   - Quiet uppercase section labels: text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)]
 *   - Pro upgrade card at the bottom
 *
 * All assertions are structural (CSS classes + computed styles + testid queries).
 * Screenshots of both sidebars are saved to the scratchpad directory.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { mkdirSync } from 'fs'
import { join } from 'path'

const SCRATCHPAD = '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad'

test('Desk Sidebar and OfficeSidebar share the same visual system', async () => {
  mkdirSync(SCRATCHPAD, { recursive: true })

  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // ── 1. Navigate to Home so the global Desk Sidebar renders ─────────────
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
      w.__fbView?.getState().goHome?.()
    })
    await window.waitForTimeout(600)

    // Screenshot the Desk sidebar
    const deskSidebar = window.locator('aside').first()
    await expect(deskSidebar).toBeVisible({ timeout: 6_000 })
    const deskSidebarPath = join(SCRATCHPAD, 'desk-sidebar.png')
    await deskSidebar.screenshot({ path: deskSidebarPath })

    // ── 2. Assert Desk Sidebar chrome ───────────────────────────────────────
    // 2a. Outer aside: surface-raised bg + a full rounded floating card edge.
    //     The menu is a floating material card on the radius law (Edges +
    //     Glass, 2026-08-23): rounded-[var(--radius-card)], NO 1px border;
    //     its edge is the hairline ring inside the box-shadow recipe.
    const deskAsideClasses = await deskSidebar.getAttribute('class') ?? ''
    expect(deskAsideClasses).toContain('bg-[var(--surface-raised)]')
    expect(deskAsideClasses).toContain('rounded-[var(--radius-card)]')
    expect(deskAsideClasses).not.toContain('border-[var(--edge-soft)]')
    const deskAsideShadow = await deskSidebar.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(deskAsideShadow).toContain('0px 0px 0px 1px')

    // 2b. Brand mark in the header. The sidebar redesign replaced the text
    // wordmark with the PlexiiLogo component (an <img>), so assert the logo
    // renders in the h-14 header rather than a specific text span.
    const deskHeaderMark = deskSidebar.locator('div.h-14 img, div.h-14 svg').first()
    await expect(deskHeaderMark).toBeVisible({ timeout: 3_000 })

    // 2c. Header border-b present
    const deskHeader = deskSidebar.locator('div.h-14').first()
    const deskHeaderClasses = await deskHeader.getAttribute('class') ?? ''
    expect(deskHeaderClasses).toContain('border-b')
    expect(deskHeaderClasses).toContain('border-[var(--edge-soft)]')

    // 2d. SegmentSwitcher present (it renders a [data-testid] or a specific class)
    //     We look for the switcher's area buttons — switch-office or switch-plexibrain
    const segSwitcher = deskSidebar.locator('[data-testid^="switch-"]').first()
    await expect(segSwitcher).toBeVisible({ timeout: 3_000 })

    // 2e. Nav rows: rounded-lg style with accent/0.12 on active row
    //     Home should be active (we just navigated there). The NavRow component
    //     uses `bg-[rgb(var(--accent)/0.12)]` on active.
    const deskNavRows = deskSidebar.locator('button.rounded-lg.text-\\[13px\\]')
    const deskNavCount = await deskNavRows.count()
    // At minimum we expect Home/Plans/Tasks/Calendar/Files/Vault = 6 rows
    expect(deskNavCount).toBeGreaterThanOrEqual(6)

    // Check that at least one row carries the active accent tint class
    const activeNavRows = deskSidebar.locator('button.bg-\\[rgb\\(var\\(--accent\\)\\/0\\.12\\)\\]')
    const activeNavCount = await activeNavRows.count()
    expect(activeNavCount).toBeGreaterThanOrEqual(1)

    // 2f. Pro upgrade card present at the bottom
    const deskProCard = deskSidebar.locator('div.rounded-xl.border.border-\\[rgb\\(var\\(--accent\\)\\/0\\.3\\)\\]')
    await expect(deskProCard).toBeVisible({ timeout: 3_000 })
    const upgradeBtn = deskProCard.locator('button')
    await expect(upgradeBtn).toBeVisible()
    const upgradeBtnText = await upgradeBtn.textContent()
    expect(upgradeBtnText?.trim()).toBe('Upgrade Now')

    // 2g. Six nav labels present
    for (const label of ['Home', 'Plans', 'Tasks', 'Calendar', 'Files', 'Vault']) {
      await expect(deskSidebar.getByText(label, { exact: true })).toBeVisible({ timeout: 3_000 })
    }

    // ── 3. Navigate to PlexiOffice so the OfficeSidebar renders ───────────
    await window.locator('[data-testid="switch-office"]').click()
    await window.waitForTimeout(600)

    const officeSidebar = window.locator('[data-testid="office-sidebar"]')
    await expect(officeSidebar).toBeVisible({ timeout: 6_000 })
    const officeSidebarPath = join(SCRATCHPAD, 'office-sidebar.png')
    await officeSidebar.screenshot({ path: officeSidebarPath })

    // ── 4. Assert OfficeSidebar chrome (reference) ──────────────────────────
    const officeAsideClasses = await officeSidebar.getAttribute('class') ?? ''
    expect(officeAsideClasses).toContain('bg-[var(--surface-raised)]')
    expect(officeAsideClasses).toContain('rounded-[var(--radius-card)]')
    expect(officeAsideClasses).not.toContain('border-[var(--edge-soft)]')
    const officeAsideShadow = await officeSidebar.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(officeAsideShadow).toContain('0px 0px 0px 1px')

    const officeWordmark = officeSidebar.locator('span.text-\\[15px\\].font-bold.tracking-\\[0\\.14em\\]').first()
    await expect(officeWordmark).toBeVisible({ timeout: 3_000 })
    const officeWordmarkText = await officeWordmark.textContent()
    expect(officeWordmarkText?.trim().toUpperCase()).toBe('PLEXIOFFICE')

    const officeHeader = officeSidebar.locator('div.h-14').first()
    const officeHeaderClasses = await officeHeader.getAttribute('class') ?? ''
    expect(officeHeaderClasses).toContain('border-b')
    expect(officeHeaderClasses).toContain('border-[var(--edge-soft)]')

    // Office Pro card
    const officeProCard = officeSidebar.locator('div.rounded-xl.border.border-\\[rgb\\(var\\(--accent\\)\\/0\\.3\\)\\]')
    await expect(officeProCard).toBeVisible({ timeout: 3_000 })

    // ── 5. Go back to Desk / Home and check the "Add to desk" strip ─────
    //    Open a task or navigate to a task so the desk view renders, then
    //    confirm the strip appears.
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
      w.__fbView?.getState().goHome?.()
    })
    await window.waitForTimeout(400)

    // Create a task via the node store so we can navigate to it
    const taskId = await window.evaluate(async () => {
      const w = window as unknown as {
        __nodeStore?: { getState: () => { create: (opts: { kind: string; title: string; parentId: null }) => Promise<{ id: string }> } }
      }
      const state = w.__nodeStore?.getState()
      if (!state) return null
      const node = await state.create({ kind: 'task', title: 'Sidebar parity test task', parentId: null })
      return node.id
    })

    if (taskId) {
      await window.evaluate((id) => {
        const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
        w.__fbView?.getState().goTask?.(id)
      }, taskId)
      await window.waitForTimeout(500)

      // The Desk sidebar still renders (as a task-context surface) with the shared
      // visual system. The widget-add UI is no longer a sidebar strip — it moved
      // to the floating WidgetPalette (covered by deskWidgets.spec.ts) — so this
      // parity check no longer asserts a sidebar widget section.
      await expect(window.locator('aside').first()).toBeVisible({ timeout: 4_000 })
    }

    // ── 6. Confirm nav rows are clickable — click Plans, verify active tint ─
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
      w.__fbView?.getState().goHome?.()
    })
    await window.waitForTimeout(400)

    const plansRow = window.locator('aside').first().getByText('Plans', { exact: true }).locator('..')
    await plansRow.click()
    await window.waitForTimeout(400)
    // After clicking Plans the row should carry the active tint
    const activePlansRow = window.locator('aside').first()
      .locator('button.bg-\\[rgb\\(var\\(--accent\\)\\/0\\.12\\)\\]')
    await expect(activePlansRow.first()).toBeVisible({ timeout: 3_000 })

    // Screenshot paths for the verdict
    console.log('DESK_SIDEBAR_SCREENSHOT:', deskSidebarPath)
    console.log('OFFICE_SIDEBAR_SCREENSHOT:', officeSidebarPath)

  } finally {
    await dispose()
  }
})
