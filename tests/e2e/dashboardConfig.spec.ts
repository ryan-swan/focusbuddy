// E2E for configurable module dashboards (Dashboard.tsx, rendered by
// ProjectDashboard for the 'project-dashboard' view).
//
// The Dashboard is per-key personalisable: 'home' for the global home, a
// project node id per plan. It already supported move / add / remove / edit.
// These tests cover the two new capabilities layered on top:
//
//   1. A 1 / 2 / 3 column chooser that persists per dashboard key and drives
//      the grid container's data-columns attribute.
//   2. A per-portlet Small / Medium / Large size control that changes the
//      card's grid span, also persisted per key.
//
// We reach a project dashboard by seeding a folder node via IPC, reloading so
// the renderer's node store picks it up, then navigating with goProject(id)
// through the exposed view store (__fbView). Two distinct folder nodes let us
// prove that one dashboard's column choice does not leak into another's.

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

// Create a folder node (a "project") and return its id.
async function seedProject(
  window: LaunchedApp['window'],
  title: string
): Promise<string> {
  const folder = await window.evaluate(
    async (t) =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: t }),
    title
  )
  return (folder as { id: string }).id
}

// Navigate to a project's dashboard through the real view store, then wait for
// the configurable grid to render.
async function openProjectDashboard(
  window: LaunchedApp['window'],
  projectId: string
): Promise<void> {
  await window.evaluate((pid) => {
    const w = window as unknown as {
      __fbView?: { getState: () => { goProject: (id: string) => void } }
    }
    w.__fbView?.getState().goProject(pid)
  }, projectId)
  await expect(window.locator('[data-testid="dashboard-grid"]')).toBeVisible({
    timeout: 8_000
  })
}

// Enter edit mode via the Dashboard's own Customize toggle. The Dashboard
// renders a compact Customize row even when a parent supplies the page header.
async function enterEditMode(window: LaunchedApp['window']): Promise<void> {
  const chooser = window.locator('[data-testid="dashboard-columns-2"]')
  if (await chooser.isVisible().catch(() => false)) return

  await window.locator('[data-testid="dashboard-customize"]').first().click()
  await expect(chooser).toBeVisible({ timeout: 6_000 })
}

test('1. Column chooser sets the grid to 3 columns and it persists across reload', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const projectId = await seedProject(window, 'Config Project')
  // Reload so the renderer node store (refreshed on App mount) sees the folder.
  await window.reload()
  await waitForReady(window)

  await openProjectDashboard(window, projectId)
  await enterEditMode(window)

  const grid = window.locator('[data-testid="dashboard-grid"]')
  // Default is 2 columns.
  await expect(grid).toHaveAttribute('data-columns', '2')

  // Choose 3 columns.
  await window.locator('[data-testid="dashboard-columns-3"]').click()
  await expect(grid).toHaveAttribute('data-columns', '3')

  // The choice must be persisted to the DB. Read it back through IPC directly.
  const persistedColumns = await window.evaluate(async (key) => {
    const layout = await window.api.dashboard.getLayout(key)
    return layout?.columns ?? null
  }, projectId)
  expect(persistedColumns).toBe(3)

  // Reload the whole renderer and re-open — the 3-column choice must survive.
  await window.reload()
  await waitForReady(window)
  await openProjectDashboard(window, projectId)
  await expect(window.locator('[data-testid="dashboard-grid"]')).toHaveAttribute(
    'data-columns',
    '3'
  )
})

test('2. A portlet size control changes the card span and persists', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const projectId = await seedProject(window, 'Size Project')
  await window.reload()
  await waitForReady(window)

  await openProjectDashboard(window, projectId)
  await enterEditMode(window)

  // Use 3 columns so Large (full width) vs Small (1) is an unambiguous span
  // difference (at 2 columns Large=2 and Medium=2 would be equal).
  await window.locator('[data-testid="dashboard-columns-3"]').click()
  await expect(window.locator('[data-testid="dashboard-grid"]')).toHaveAttribute(
    'data-columns',
    '3'
  )

  // Pick a card that is in the default layout.
  const kind = 'workspace-progress'
  const card = window.locator(`[data-testid="dashboard-card-${kind}"]`)
  await expect(card).toBeVisible({ timeout: 6_000 })

  // Default size is medium → span 2 at 3 columns.
  await expect(card).toHaveAttribute('data-size', 'medium')
  await expect(card).toHaveAttribute('data-span', '2')

  const sizeBtn = window.locator(`[data-testid="dashboard-card-size-${kind}"]`)
  // Cycle medium → large. Large spans the full column count (3).
  await sizeBtn.click()
  await expect(card).toHaveAttribute('data-size', 'large')
  await expect(card).toHaveAttribute('data-span', '3')

  // Cycle large → small. Small spans 1.
  await sizeBtn.click()
  await expect(card).toHaveAttribute('data-size', 'small')
  await expect(card).toHaveAttribute('data-span', '1')

  // Persisted per card in the DB.
  const persistedSize = await window.evaluate(
    async ([key, k]) => {
      const layout = await window.api.dashboard.getLayout(key)
      return layout?.sizes?.[k as keyof typeof layout.sizes] ?? null
    },
    [projectId, kind] as [string, string]
  )
  expect(persistedSize).toBe('small')

  // Reload → the small size survives.
  await window.reload()
  await waitForReady(window)
  await openProjectDashboard(window, projectId)
  await expect(
    window.locator(`[data-testid="dashboard-card-${kind}"]`)
  ).toHaveAttribute('data-size', 'small')
})

test('3. Add and remove a portlet still work alongside the new config', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const projectId = await seedProject(window, 'AddRemove Project')
  await window.reload()
  await waitForReady(window)

  await openProjectDashboard(window, projectId)
  await enterEditMode(window)

  // 'folders' is in the default layout — remove it.
  const foldersCard = window.locator('[data-testid="dashboard-card-folders"]')
  await expect(foldersCard).toBeVisible({ timeout: 6_000 })
  await window.locator('[data-testid="dashboard-card-folders"] button[title="Remove from this dashboard"]').click()
  await expect(foldersCard).toHaveCount(0, { timeout: 4_000 })

  // The removed card now appears in the "Add a card" palette — add it back.
  const addBtn = window.getByRole('button', { name: /Folders/ }).first()
  await addBtn.click()
  await expect(window.locator('[data-testid="dashboard-card-folders"]')).toBeVisible({
    timeout: 4_000
  })
})

test('4. A column choice on one dashboard does not affect another key', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const projectA = await seedProject(window, 'Project A')
  const projectB = await seedProject(window, 'Project B')
  await window.reload()
  await waitForReady(window)

  // Set A to 3 columns.
  await openProjectDashboard(window, projectA)
  await enterEditMode(window)
  await window.locator('[data-testid="dashboard-columns-3"]').click()
  await expect(window.locator('[data-testid="dashboard-grid"]')).toHaveAttribute(
    'data-columns',
    '3'
  )

  // B was never touched → it shows the default 2 columns, not A's 3.
  await openProjectDashboard(window, projectB)
  await expect(window.locator('[data-testid="dashboard-grid"]')).toHaveAttribute(
    'data-columns',
    '2'
  )

  // And confirm at the persistence layer that B has no stored override.
  const bLayout = await window.evaluate(
    async (key) => window.api.dashboard.getLayout(key),
    projectB
  )
  expect(bLayout).toBeNull()

  // A is still 3 when we return to it.
  await openProjectDashboard(window, projectA)
  await expect(window.locator('[data-testid="dashboard-grid"]')).toHaveAttribute(
    'data-columns',
    '3'
  )
})
