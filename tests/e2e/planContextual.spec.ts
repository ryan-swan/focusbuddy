import { test, expect } from '@playwright/test'
import { openProduct, launchApp, waitForReady } from './_helpers'

// Verifies the Plan view's contextual tabs over its real universal objects:
//
//   OVERVIEW — the default landing view. A real summary built from the
//   ProjectPlan: percent complete, done/total task counts, milestone count and
//   the next upcoming milestone, missed-deadline count, and critical-path length.
//   Real values only; a fresh plan shows honest zeros.
//
//   FILES — the real documents and files filed under the plan node, read via
//   window.api.fileManager.list(projectId). An honest empty state on a fresh
//   plan; a filed document appears as a plan-files-row-<id> and opens.
//
// The existing task views (Timeline/Board/Grid/Calendar) are unchanged: this
// spec confirms Timeline still renders the gantt after switching tabs.

async function setupPlan(
  window: Awaited<ReturnType<typeof launchApp>>['window'],
  taskTitles: string[] = ['Task A', 'Task B']
): Promise<{ folderId: string; taskIds: string[] }> {
  await waitForReady(window)

  const folder = await window.evaluate(
    (title: string) => window.api.nodes.create({ parentId: null, kind: 'folder', isPlan: true, title }),
    'Contextual Plan Test'
  )
  const folderId = (folder as { id: string }).id

  const taskIds: string[] = []
  for (const title of taskTitles) {
    const t = await window.evaluate(
      ([pid, ttl]: [string, string]) => window.api.nodes.create({ parentId: pid, kind: 'task', title: ttl }),
      [folderId, title] as [string, string]
    )
    taskIds.push((t as { id: string }).id)
  }

  const now = Date.now()
  const dayMs = 86_400_000
  for (let i = 0; i < taskIds.length; i++) {
    await window.evaluate(
      ([tid, start, due]) => window.api.projects.setTaskPlan(tid as string, { planStart: start as number, planDue: due as number }),
      [taskIds[i], now + i * 3 * dayMs, now + (i + 1) * 3 * dayMs] as [string, number, number]
    )
  }

  await openProduct(window, 'projects')
  await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
  await window.locator(`[data-testid="project-card-${folderId}"]`).click()
  await expect(window.locator('[data-testid="projects-view-overview"]')).toBeVisible({ timeout: 8_000 })

  return { folderId, taskIds }
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

test('O1. opening a plan lands on Overview showing the real task counts', async () => {
  const { window, dispose } = await launchApp()
  try {
    await setupPlan(window, ['Task A', 'Task B'])

    // The Overview tab is the default landing panel.
    const overview = window.locator('[data-testid="plan-overview"]')
    await expect(overview).toBeVisible({ timeout: 6_000 })

    // Real counts: two tasks, none done yet → "0 of 2 tasks done".
    const progress = window.locator('[data-testid="plan-overview-progress"]')
    await expect(progress).toBeVisible({ timeout: 3_000 })
    await expect(progress).toContainText('0 of 2')
  } finally {
    await dispose()
  }
})

test('O2. completing a task moves the Overview progress to reflect it', async () => {
  const { window, dispose } = await launchApp()
  try {
    const { folderId, taskIds } = await setupPlan(window, ['One', 'Two'])

    // Mark the first task done via the node store, then re-enter the plan so the
    // overview re-reads a fresh plan.
    await window.evaluate(
      (tid: string) => window.api.nodes.update(tid, { status: 'done' as never }),
      taskIds[0]
    )
    await window.locator('[data-testid="projects-back"]').click()
    await expect(window.locator('[data-testid="projects-portfolio"]')).toBeVisible({ timeout: 6_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator('[data-testid="projects-view-overview"]')).toBeVisible({ timeout: 8_000 })

    await expect(window.locator('[data-testid="plan-overview-progress"]')).toContainText('1 of 2')
  } finally {
    await dispose()
  }
})

test('O3. a milestone task shows up as the next milestone on Overview', async () => {
  const { window, dispose } = await launchApp()
  try {
    const { folderId, taskIds } = await setupPlan(window, ['Build', 'Ship Milestone'])

    // Flag the second task as a milestone scheduled in the future.
    const future = Date.now() + 10 * 86_400_000
    await window.evaluate(
      ([tid, s]) => window.api.projects.setTaskPlan(tid as string, { isMilestone: true, planStart: s as number }),
      [taskIds[1], future] as [string, number]
    )
    await window.locator('[data-testid="projects-back"]').click()
    await expect(window.locator('[data-testid="projects-portfolio"]')).toBeVisible({ timeout: 6_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator('[data-testid="projects-view-overview"]')).toBeVisible({ timeout: 8_000 })

    const milestone = window.locator('[data-testid="plan-overview-milestone"]')
    await expect(milestone).toBeVisible({ timeout: 3_000 })
    await expect(milestone).toContainText('Ship Milestone')
  } finally {
    await dispose()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// FILES
// ─────────────────────────────────────────────────────────────────────────────

test('F1. Files tab shows the honest empty state on a fresh plan', async () => {
  const { window, dispose } = await launchApp()
  try {
    await setupPlan(window)

    await window.locator('[data-testid="projects-view-files"]').click()
    await expect(window.locator('[data-testid="plan-files"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="plan-files-empty"]')).toBeVisible({ timeout: 3_000 })
    await expect(window.locator('[data-testid="plan-files-empty"]')).toContainText('No files in this plan yet')
  } finally {
    await dispose()
  }
})

test('F2. a document filed under the plan appears as a plan-files-row', async () => {
  const { window, dispose } = await launchApp()
  try {
    const { folderId } = await setupPlan(window)

    // Create a document, then file it under the plan node. fileDocument returns a
    // FileEntry of kind "doc" whose id we use to find the row.
    const docId = await window.evaluate(async () => {
      const doc = await window.api.documents.create({ docType: 'doc', title: 'Plan Brief' })
      return (doc as { id: string }).id
    })
    const entryId = await window.evaluate(
      ([did, pid]: [string, string]) => window.api.fileManager.fileDocument(did, pid),
      [docId, folderId] as [string, string]
    ).then((e) => (e as { id: string } | null)?.id)
    expect(entryId).toBeTruthy()

    // Re-enter the plan so the Files view re-reads the list, then open Files.
    await window.locator('[data-testid="projects-back"]').click()
    await expect(window.locator('[data-testid="projects-portfolio"]')).toBeVisible({ timeout: 6_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator('[data-testid="projects-view-files"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-view-files"]').click()

    await expect(window.locator('[data-testid="plan-files"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator(`[data-testid="plan-files-row-${entryId}"]`)).toBeVisible({ timeout: 5_000 })
    // The empty state must NOT be present once a file is filed.
    await expect(window.locator('[data-testid="plan-files-empty"]')).toHaveCount(0)
  } finally {
    await dispose()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING TASK VIEWS STILL WORK
// ─────────────────────────────────────────────────────────────────────────────

test('T1. switching to Timeline still shows the gantt', async () => {
  const { window, dispose } = await launchApp()
  try {
    const { taskIds } = await setupPlan(window)

    await window.locator('[data-testid="projects-view-gantt"]').click()
    // The gantt task-name rows render for each task.
    await expect(window.locator(`[data-testid="gantt-row-${taskIds[0]}"]`)).toBeVisible({ timeout: 5_000 })
  } finally {
    await dispose()
  }
})
