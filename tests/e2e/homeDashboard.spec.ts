// E2E verification for the PlexiSuite home live dashboard.
// Covers: (1) all sections render, (2) search bar navigates, (3) quick actions,
// (4) real-data cards with honest empty states + seeded content, (5) people panel.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

test.setTimeout(90_000)

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// Helper: navigate back to suite home via JS (avoids pointer-target races on
// the sidebar icon which is small and may overlap other elements).
async function goSuite(window: LaunchedApp['window']): Promise<void> {
  await window.evaluate(() => {
    // The view store is exposed as __fbView (the convention every other spec
    // uses). This helper reached for a `useViewStore` global that has never
    // existed, so it silently fell through to a "Suite" text search that finds
    // nothing under the four-segment switcher — and every case using it timed
    // out on a suite home it never navigated to.
    const store = (window as unknown as { __fbView?: { getState: () => { goSuite: () => void } } })
      .__fbView
    store?.getState().goSuite()
  })
  await expect(window.locator('[data-testid="plexisuite-home"]')).toBeVisible({ timeout: 5000 })
}

// -------------------------------------------------------------------
// Check 1: home renders all required sections
// -------------------------------------------------------------------
test('1. PlexiSuite home renders: search bar, hero, quick actions, product grid, dashboard', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Default landing IS the suite home; if not, navigate there
  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await expect(window.locator('[data-testid="plexisuite-home"]')).toBeVisible({ timeout: 8000 })
  await expect(window.locator('[data-testid="suite-search-bar"]')).toBeVisible({ timeout: 5000 })
  await expect(window.locator('[data-testid="hero-plexidesk"]')).toBeVisible({ timeout: 5000 })
  await expect(window.locator('[data-testid="hero-quick-actions"]')).toBeVisible({ timeout: 5000 })
  // At least the plexisearch tile is visible (grid rendered)
  await expect(window.locator('[data-testid="product-tile-plexisearch"]')).toBeVisible({ timeout: 5000 })
  // Dashboard region
  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })
})

// -------------------------------------------------------------------
// Check 2: search bar navigates to PlexiSearch view
// -------------------------------------------------------------------
test('2. suite-search-bar click -> plexisearch-view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await window.locator('[data-testid="suite-search-bar"]').click()
  await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 8000 })
})

// -------------------------------------------------------------------
// Check 3: quick actions navigate to the right surfaces
// -------------------------------------------------------------------
test('3a. hero-action-all-tasks -> All Tasks view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await window.locator('[data-testid="hero-action-all-tasks"]').click()
  // AllTasksView renders an <h1>All Tasks</h1>
  await expect(window.locator('h1').filter({ hasText: 'All Tasks' })).toBeVisible({ timeout: 8000 })
})

test('3b. hero-action-calendar -> Calendar view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await window.locator('[data-testid="hero-action-calendar"]').click()
  // CalendarView exposes calendar-mode-* buttons
  await expect(window.locator('[data-testid^="calendar-mode-"]').first()).toBeVisible({ timeout: 8000 })
})

test('3c. hero-action-templates -> pleximarketplace-view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await window.locator('[data-testid="hero-action-templates"]').click()
  await expect(window.locator('[data-testid="pleximarketplace-view"]')).toBeVisible({ timeout: 8000 })
})

test('3d. hero-action-new-desk creates a node and opens canvas', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  // Count nodes before
  const before = await window.evaluate(() => window.api.nodes.list())
  const beforeCount = before.length

  await window.locator('[data-testid="hero-action-new-desk"]').click()

  // Wait for view to change away from plexisuite-home (canvas opens)
  await expect(window.locator('[data-testid="plexisuite-home"]')).not.toBeVisible({ timeout: 8000 })

  // A new task node was created
  const after = await window.evaluate(() => window.api.nodes.list())
  expect(after.length).toBeGreaterThan(beforeCount)

  // The new node has kind 'task' and title 'New desk'
  const newDesks = after.filter((n: { kind: string; title: string }) => n.kind === 'task' && n.title === 'New desk')
  expect(newDesks.length).toBeGreaterThanOrEqual(1)
})

test('3e. hero-action-open-my-desk -> canvas / home view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await window.locator('[data-testid="hero-action-open-my-desk"]').click()
  // goHome() opens the canvas — plexisuite-home should no longer be visible
  await expect(window.locator('[data-testid="plexisuite-home"]')).not.toBeVisible({ timeout: 8000 })
})

// -------------------------------------------------------------------
// Check 4a: honest empty states on a fresh workspace
// -------------------------------------------------------------------
test('4a. Fresh workspace: empty-state text in tasks, desks, docs cards; no fake rows', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  // Wait for home-dashboard to appear
  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })

  // Give dashboard time to resolve async data (timeBlocks.list + docs.refresh)
  await window.waitForTimeout(2000)

  // In a fresh workspace there are no tasks/desks/docs.
  // The data-testid home-tasks / home-desks / home-docs only appear when data exists.
  // Confirm they are NOT present (no fake rows).
  const hasTasks = await window.locator('[data-testid="home-tasks"]').isVisible({ timeout: 500 }).catch(() => false)
  const hasDesks = await window.locator('[data-testid="home-desks"]').isVisible({ timeout: 500 }).catch(() => false)
  const hasDocs = await window.locator('[data-testid="home-docs"]').isVisible({ timeout: 500 }).catch(() => false)

  // All three lists must be absent in a fresh workspace
  expect(hasTasks, 'home-tasks should not exist when no tasks').toBe(false)
  expect(hasDesks, 'home-desks should not exist when no desks').toBe(false)
  expect(hasDocs, 'home-docs should not exist when no docs').toBe(false)

  // Confirm honest empty text is rendered (at least one of the cards shows empty copy)
  const dashText = await window.locator('[data-testid="home-dashboard"]').innerText()
  expect(dashText).toMatch(/No open tasks|No desks yet|No documents yet/i)
})

// -------------------------------------------------------------------
// Check 4b + 4c: seeded task appears in home-task- AND home-desk-;
//               seeded doc appears in home-doc-; clicking navigates
// -------------------------------------------------------------------
test('4b. Seeded task appears in My tasks and Recent desks; clicking opens canvas', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Start from the suite home
  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  // Use hero-action-new-desk which calls the nodeStore create action (not raw IPC),
  // so the in-memory Zustand store is updated immediately.
  // Capture the node count before to identify the new node.
  const before = await window.evaluate(() => window.api.nodes.list())
  const beforeIds = new Set((before as Array<{ id: string }>).map((n) => n.id))

  await window.locator('[data-testid="hero-action-new-desk"]').click()
  // Wait for navigation away from suite (canvas opens)
  await expect(window.locator('[data-testid="plexisuite-home"]')).not.toBeVisible({ timeout: 8000 })

  // Get the id of the newly created desk
  const after = await window.evaluate(() => window.api.nodes.list())
  const newNode = (after as Array<{ id: string; kind: string; title: string }>)
    .find((n) => !beforeIds.has(n.id) && n.kind === 'task')
  expect(newNode, 'new task node created via hero-action-new-desk').toBeTruthy()
  const taskId = newNode!.id

  // Navigate back to suite home — PlexiSuiteHome remounts, HomeDashboardRegion
  // reads from the Zustand store which was updated by the store's create action.
  await goSuite(window)
  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })
  // Scroll home-dashboard into view (below the fold on the long launcher page)
  await window.locator('[data-testid="home-dashboard"]').scrollIntoViewIfNeeded()
  await window.waitForTimeout(1000)

  // home-task-<id> row
  const taskRow = window.locator(`[data-testid="home-task-${taskId}"]`)
  await expect(taskRow).toBeVisible({ timeout: 10000 })

  // home-desk-<id> row (recentDesks also includes task nodes)
  const deskRow = window.locator(`[data-testid="home-desk-${taskId}"]`)
  await expect(deskRow).toBeVisible({ timeout: 8000 })

  // Clicking the task row opens its canvas (plexisuite-home disappears)
  await taskRow.click()
  await expect(window.locator('[data-testid="plexisuite-home"]')).not.toBeVisible({ timeout: 8000 })
})

test('4c. Seeded document appears in Recent documents; clicking opens document view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a document via raw IPC
  const doc = await window.evaluate(() =>
    window.api.documents.create({ docType: 'doc', title: 'DASHTEST_DOC' })
  )
  const docId = (doc as { id: string }).id

  // HomeDashboardRegion calls refreshDocs() in useEffect on MOUNT.
  // If the suite home is already mounted (default view on boot), navigating to
  // suite again is a no-op for React. We must navigate AWAY first to unmount
  // PlexiSuiteHome, then back to trigger remount and refreshDocs.
  await window.evaluate(() => {
    // Navigate away to plexisearch-view (any non-suite view)
    const store = (window as unknown as { useViewStore?: { getState: () => { goSearch: () => void } } }).useViewStore
    if (store) store.getState().goSearch()
    else {
      const btn = document.querySelector('[data-testid="suite-search-bar"]') as HTMLElement | null
      btn?.click()
    }
  })
  await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 5000 })

  // Now navigate back to suite home — PlexiSuiteHome remounts, refreshDocs fires
  await goSuite(window)
  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })
  await window.locator('[data-testid="home-dashboard"]').scrollIntoViewIfNeeded()
  // refreshDocs is async; wait for it to complete and re-render
  await window.waitForTimeout(3000)

  // home-doc-<id> row
  const docRow = window.locator(`[data-testid="home-doc-${docId}"]`)
  await expect(docRow).toBeVisible({ timeout: 10000 })
  await expect(docRow).toContainText('DASHTEST_DOC')

  // Clicking navigates away from suite home (goDocument sets kind:'document')
  await docRow.click()
  await expect(window.locator('[data-testid="plexisuite-home"]')).not.toBeVisible({ timeout: 8000 })
})

// -------------------------------------------------------------------
// Check 5: People panel honest empty state, People Map link navigates
// -------------------------------------------------------------------
test('5. People panel: honest empty state; People Map link -> people-map view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const homeVisible = await window.locator('[data-testid="plexisuite-home"]').isVisible({ timeout: 3000 }).catch(() => false)
  if (!homeVisible) await goSuite(window)

  await expect(window.locator('[data-testid="home-dashboard"]')).toBeVisible({ timeout: 8000 })
  await window.waitForTimeout(1000)

  // No presence peers in test env -> EmptyCard text (no home-people testid)
  // home-people only renders when peers.length > 0
  const hasPeople = await window.locator('[data-testid="home-people"]').isVisible({ timeout: 500 }).catch(() => false)
  expect(hasPeople, 'home-people should not appear with no peers').toBe(false)

  // The honest empty text must appear in the dashboard
  const dashText = await window.locator('[data-testid="home-dashboard"]').innerText()
  expect(dashText).toMatch(/Nobody else is online right now/i)

  // People Map action button in the RailCard header navigates to people-map.
  // Scope strictly inside home-dashboard to avoid matching the sidebar nav button.
  const dashboard = window.locator('[data-testid="home-dashboard"]')
  await dashboard.scrollIntoViewIfNeeded()
  const peopleMapBtn = dashboard.locator('button', { hasText: 'People Map' })
  await expect(peopleMapBtn).toBeVisible({ timeout: 5000 })
  await peopleMapBtn.click()
  await expect(window.locator('[data-testid="people-map"]')).toBeVisible({ timeout: 8000 })
})
