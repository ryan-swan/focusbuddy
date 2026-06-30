import { test, expect } from '@playwright/test'
import { openProduct, launchApp, waitForReady } from './_helpers'

const DAY_MS = 24 * 60 * 60 * 1000

test('drift marker: overdue open task shows gantt-late-<id>, future/undated task does not', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Late Marker Project' })
    )
    const folderId: string = (folder as { id: string }).id

    const now = Date.now()

    // Task A: plan window fully in the past, status stays open (not done).
    // scheduledEndMs will land in the past => lateSet includes this task.
    const taskA = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Overdue Task' }),
      folderId
    )
    const taskAId: string = (taskA as { id: string }).id
    await window.evaluate(
      async ([tid, start, due]) =>
        window.api.projects.setTaskPlan(tid, { planStart: start, planDue: due }),
      [taskAId, now - 7 * DAY_MS, now - 3 * DAY_MS] as [string, number, number]
    )

    // Task B: plan window fully in the future — scheduledEnd > now => not late.
    // Must use explicit future dates: the anchor is pulled back to A's plan_start
    // (7 days ago), so an undated task B would be scheduled starting at the anchor
    // and ending 1 day later, which would also be in the past.
    const taskB = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Future Task' }),
      folderId
    )
    const taskBId: string = (taskB as { id: string }).id
    await window.evaluate(
      async ([tid, start, due]) =>
        window.api.projects.setTaskPlan(tid, { planStart: start, planDue: due }),
      [taskBId, now + 7 * DAY_MS, now + 14 * DAY_MS] as [string, number, number]
    )

    // Open Gantt
    await openProduct(window, 'projects')
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator(`[data-testid="gantt-bar-${taskAId}"]`)).toBeVisible({ timeout: 8_000 })

    // Task A: amber late marker must be present
    await expect(window.locator(`[data-testid="gantt-late-${taskAId}"]`)).toBeVisible({ timeout: 5_000 })

    // Task B: no late marker
    await expect(window.locator(`[data-testid="gantt-late-${taskBId}"]`)).not.toBeVisible()
  } finally {
    await dispose()
  }
})
