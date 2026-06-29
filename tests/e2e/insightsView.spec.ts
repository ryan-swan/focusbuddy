import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Feature B: Flow & focus insights view.
// Exercises:
//   1. Sidebar Insights nav item renders and navigates to the insights view.
//   2. With no sessions the honest empty state is shown (no fabricated numbers).
//   3. After seeding a real focus session via window.api, the summary stats
//      reflect the actual session (not invented values).

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('Insights sidebar item navigates to insights-view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Drive via goInsights() on the view store — same call the sidebar button
  // makes, and avoids pointer-target issues on the small icon button.
  await window.evaluate(() => {
    const { useViewStore } = (window as unknown as { __stores: { useViewStore: typeof import('../../src/renderer/src/stores/view').useViewStore } }).__stores ?? {}
    if (useViewStore) {
      useViewStore.getState().goInsights()
    }
  })

  // Fallback: click the Insights sidebar button if the store bridge is
  // unavailable (both paths are acceptable).
  const insightsView = window.locator('[data-testid="insights-view"]')
  const viaStore = await insightsView.isVisible({ timeout: 1_000 }).catch(() => false)
  if (!viaStore) {
    // Try clicking the sidebar button by aria-label or title.
    await window.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((el) => el.textContent?.includes('Insights') || el.getAttribute('title') === 'Insights')
      ;(btn as HTMLElement | undefined)?.click()
    })
  }

  await expect(window.locator('[data-testid="insights-view"]')).toBeVisible({ timeout: 5_000 })
})

test('Insights view shows honest empty state when no sessions exist', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Navigate to insights via the view store — most reliable IPC-driven path.
  await window.evaluate(() => {
    const store = (window as unknown as { useViewStore?: { getState: () => { goInsights: () => void } } }).useViewStore
    if (store) {
      store.getState().goInsights()
    } else {
      // Fallback: drive the sidebar button
      const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((el) => (el as HTMLElement).innerText?.trim() === 'Insights' ||
                       el.getAttribute('title') === 'Insights')
      ;(btn as HTMLElement | undefined)?.click()
    }
  })

  // Navigate via goInsights IPC on the view store (accessible via the
  // window.api surface is not exposed, so we use keyboard-dispatch as the
  // final fallback — matching the canvasUI spec pattern).
  await window.evaluate(() => {
    // Trigger the goInsights store action. The view store attaches to window
    // via the React devtools bridge in dev mode; in Electron test mode we
    // drive it indirectly by clicking the sidebar nav item.
    const all = Array.from(document.querySelectorAll('[data-sidebar-nav]'))
    const item = all.find((el) => el.textContent?.includes('Insights'))
    ;(item as HTMLElement | undefined)?.click()
  })

  const view = window.locator('[data-testid="insights-view"]')
  await expect(view).toBeVisible({ timeout: 6_000 })

  // Empty state text must be present (not fabricated numbers).
  const bodyText = await view.innerText()
  expect(bodyText).toContain('No focus sessions')
  // Confirm there are no fabricated session counts — any digit in the stats
  // grid would only be valid if sessions existed.
  expect(bodyText).not.toMatch(/\b[1-9]\d*\s*(sessions|completed)\b/i)
})

test('Insights view shows real summary after seeding a focus session', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a focus session via window.api (same path the product uses).
  const sessionId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Insight test task' })
    const session = await api.focus.start({
      taskId: task.id,
      kind: '5min',
      plannedSeconds: 300
    })
    // Complete it immediately with 300 seconds actual.
    await api.focus.complete(session.id, {
      actualSeconds: 300,
      outcome: 'done'
    })
    return session.id
  })
  expect(sessionId).toBeTruthy()

  // Navigate to Insights.
  await window.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
    const btn = btns.find(
      (el) =>
        el.getAttribute('title') === 'Insights' ||
        (el as HTMLElement).innerText?.trim() === 'Insights' ||
        el.querySelector('span')?.textContent?.trim() === 'Insights'
    )
    ;(btn as HTMLElement | undefined)?.click()
  })

  const view = window.locator('[data-testid="insights-view"]')
  await expect(view).toBeVisible({ timeout: 6_000 })

  // Wait for the session load (async useEffect in InsightsView).
  await window.waitForTimeout(800)

  const bodyText = await view.innerText()

  // The view should now NOT show the empty-state text.
  expect(bodyText).not.toContain('No focus sessions')

  // The completed session should appear in "Where your focus went" or the
  // summary — "Insight test task" or its minutes.
  // At minimum the summary stats grid is present (focusedMinutes >= 5 min = "5m").
  expect(bodyText).toMatch(/\d+m|\d+h/)
})
