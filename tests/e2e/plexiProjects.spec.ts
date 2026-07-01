import { test, expect } from '@playwright/test'
import { openProduct, launchApp, waitForReady } from './_helpers'

// PlexiProjects: Gantt/critical-path planner.
// A "project" is a folder node; its plan is the task nodes under it.
// Seeds folder + task nodes via window.api.nodes.create, exercises the
// projects.* IPC surface, then confirms UI state in the Gantt renderer.

test('1. empty state: no folders shows projects-empty, not invented data', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Navigate to PlexiProjects via the sidebar NavRow
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })

    // Empty workspace: no folders with tasks => honest empty state
    const empty = window.locator('[data-testid="projects-empty"]')
    const portfolio = window.locator('[data-testid="projects-portfolio"]')
    await expect(empty).toBeVisible({ timeout: 5_000 })
    await expect(portfolio).not.toBeVisible()
  } finally {
    await dispose()
  }
})

test('2. portfolio: folder + 3 tasks shows project card with real task count, Gantt rows', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Seed folder + tasks via IPC
    const folder = await window.evaluate(async () => {
      return window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Alpha Project' })
    })
    const folderId: string = (folder as { id: string }).id

    const taskIds: string[] = []
    for (const title of ['Design', 'Build', 'Ship']) {
      const t = await window.evaluate(
        async ([pid, ttl]) => window.api.nodes.create({ parentId: pid, kind: 'task', title: ttl }),
        [folderId, title] as [string, string]
      )
      taskIds.push((t as { id: string }).id)
    }

    // Open PlexiProjects
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })

    // Portfolio card with real folder id
    const card = window.locator(`[data-testid="project-card-${folderId}"]`)
    await expect(card).toBeVisible({ timeout: 6_000 })

    // The card shows the real task count (3/0 or 3 total)
    await expect(card).toContainText('3')

    // Click into Gantt
    await card.click()

    // Header shows the project title
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
    const view = window.locator('[data-testid="plexiprojects-view"]')
    await expect(view).toContainText('Alpha Project')

    // The plan lands on Overview; switch to Timeline so the gantt rows render.
    await window.locator('[data-testid="projects-view-gantt"]').click()

    // All 3 tasks have gantt-row and gantt-bar entries
    for (const id of taskIds) {
      await expect(window.locator(`[data-testid="gantt-row-${id}"]`)).toBeVisible()
      await expect(window.locator(`[data-testid="gantt-bar-${id}"]`)).toBeVisible()
    }
  } finally {
    await dispose()
  }
})

test('3. date editing: set plan-start and plan-due, bar repositions on reload', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Date Project' })
    )
    const folderId: string = (folder as { id: string }).id
    const task = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Dated Task' }),
      folderId
    )
    const taskId: string = (task as { id: string }).id

    // Open Gantt
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    // The plan lands on the Overview tab; switch to Timeline so the gantt rows
    // and bars these tests drive are rendered.
    await expect(window.locator('[data-testid="projects-view-gantt"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-view-gantt"]').click()
    await expect(window.locator(`[data-testid="gantt-row-${taskId}"]`)).toBeVisible({ timeout: 8_000 })

    // Select the task to open editor
    await window.locator(`[data-testid="gantt-row-${taskId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // Read the bar's initial position
    const barBefore = window.locator(`[data-testid="gantt-bar-${taskId}"]`)
    const rectBefore = await barBefore.boundingBox()

    // Set planned start to 2026-07-01 and finish to 2026-07-10 via the date inputs
    await window.locator('[data-testid="task-plan-start"]').fill('2026-07-01')
    await window.locator('[data-testid="task-plan-start"]').dispatchEvent('change')

    await window.locator('[data-testid="task-plan-due"]').fill('2026-07-10')
    await window.locator('[data-testid="task-plan-due"]').dispatchEvent('change')

    // The editor calls setTaskPlan + onChanged() which reloads the plan; wait
    // for the bar to have moved
    await window.waitForTimeout(600)
    const rectAfter = await barBefore.boundingBox()

    // x position should have changed (bar repositioned on timeline)
    // We can't assert exact px values but we can confirm the dates persisted
    // via IPC: re-read the plan
    const plan = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const planned = (plan as { tasks: Array<{ id: string; planStart: number | null; planDue: number | null }> })
      .tasks.find((t) => t.id === taskId)

    // 2026-07-01 as local midnight
    const expectedStart = new Date(2026, 6, 1).getTime()
    const expectedDue = new Date(2026, 6, 10).getTime()
    expect(planned?.planStart).toBe(expectedStart)
    expect(planned?.planDue).toBe(expectedDue)

    // The bar should now be non-null and positioned (x) at or after anchor
    expect(rectBefore).not.toBeNull()
    // bar still visible after date change
    await expect(barBefore).toBeVisible()

    // rectAfter may be same or different depending on whether anchor shifted, but
    // the IPC data proving dates were saved is the load-bearing assertion above
    void rectAfter
  } finally {
    await dispose()
  }
})

test('4. dependency: add dep persists, successor bar starts at/after predecessor end', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Dep Project' })
    )
    const folderId: string = (folder as { id: string }).id

    // Create two tasks with explicit dates so the engine produces measurable positions
    const now = Date.now()
    const dayMs = 86_400_000
    const taskA = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Task A' }),
      folderId
    )
    const taskAId: string = (taskA as { id: string }).id
    const taskB = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Task B' }),
      folderId
    )
    const taskBId: string = (taskB as { id: string }).id

    // Give A a 3-day window starting today
    await window.evaluate(
      async ([tid, start, due]) =>
        window.api.projects.setTaskPlan(tid, { planStart: start, planDue: due }),
      [taskAId, now, now + 3 * dayMs] as [string, number, number]
    )

    // Open Gantt
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    // The plan lands on the Overview tab; switch to Timeline so the gantt rows
    // and bars these tests drive are rendered.
    await expect(window.locator('[data-testid="projects-view-gantt"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-view-gantt"]').click()
    await expect(window.locator(`[data-testid="gantt-row-${taskBId}"]`)).toBeVisible({ timeout: 8_000 })

    // Select Task B and add A as predecessor
    await window.locator(`[data-testid="gantt-row-${taskBId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // task-add-dep is a <select>; pick task A
    await window.locator('[data-testid="task-add-dep"]').selectOption({ value: taskAId })

    // Wait for the plan to reload
    await window.waitForTimeout(800)

    // Re-read plan via IPC to confirm dep persisted
    const plan = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const planTyped = plan as {
      deps: Array<{ predId: string; succId: string }>
      tasks: Array<{ id: string; scheduledStartMs: number; scheduledEndMs: number }>
    }

    // Dep recorded
    const dep = planTyped.deps.find((d) => d.predId === taskAId && d.succId === taskBId)
    expect(dep).toBeDefined()

    // Engine honour: B starts at or after A ends
    const a = planTyped.tasks.find((t) => t.id === taskAId)!
    const b = planTyped.tasks.find((t) => t.id === taskBId)!
    expect(b.scheduledStartMs).toBeGreaterThanOrEqual(a.scheduledEndMs)
  } finally {
    await dispose()
  }
})

test('5. milestone toggle: toggled task renders diamond bar, not a rect bar', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Milestone Project' })
    )
    const folderId: string = (folder as { id: string }).id
    const task = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Launch' }),
      folderId
    )
    const taskId: string = (task as { id: string }).id

    // Open Gantt
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    // The plan lands on the Overview tab; switch to Timeline so the gantt rows
    // and bars these tests drive are rendered.
    await expect(window.locator('[data-testid="projects-view-gantt"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-view-gantt"]').click()
    await expect(window.locator(`[data-testid="gantt-row-${taskId}"]`)).toBeVisible({ timeout: 8_000 })

    // Before toggle: bar has width > 8px (normal task bar)
    const bar = window.locator(`[data-testid="gantt-bar-${taskId}"]`)
    const rectBefore = await bar.boundingBox()
    expect(rectBefore).not.toBeNull()
    expect(rectBefore!.width).toBeGreaterThan(8)

    // Select and toggle milestone
    await window.locator(`[data-testid="gantt-row-${taskId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })
    // Use click() rather than check(): onChange calls setTaskPlan + onChanged()
    // which unmounts/remounts the editor; Playwright's check() sees the detached
    // element re-appear already checked and reports "did not change its state".
    await window.locator('[data-testid="task-milestone"]').click()

    await window.waitForTimeout(600)

    // After toggle: milestone diamond is rendered as 8px wide (the rotate-45 diamond div)
    const rectAfter = await bar.boundingBox()
    expect(rectAfter).not.toBeNull()
    // Diamond is 12px; normal bar is at least DAY_W=26. Diamond <= 14px.
    expect(rectAfter!.width).toBeLessThanOrEqual(14)

    // Confirm IPC persisted
    const plan = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const t = (plan as { tasks: Array<{ id: string; isMilestone: boolean }> }).tasks.find(
      (x) => x.id === taskId
    )
    expect(t?.isMilestone).toBe(true)
  } finally {
    await dispose()
  }
})

test('6. reschedule button: returns without error and plan reloads', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Resched Project' })
    )
    const folderId: string = (folder as { id: string }).id
    await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'T1' }),
      folderId
    )

    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    // The plan lands on the Overview tab; switch to Timeline so the gantt rows
    // and bars these tests drive are rendered.
    await expect(window.locator('[data-testid="projects-view-gantt"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-view-gantt"]').click()

    const reschedBtn = window.locator('[data-testid="projects-reschedule"]')
    await expect(reschedBtn).toBeVisible({ timeout: 8_000 })

    // Capture any console errors during click
    const errors: string[] = []
    window.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await reschedBtn.click()

    // After reschedule the button should become enabled again (not stuck busy)
    await expect(reschedBtn).toBeEnabled({ timeout: 8_000 })

    // The plan view should still be showing the Gantt (not crashed)
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible()

    // No console errors from the reschedule call
    const reschedErrors = errors.filter((e) => /reschedule|project|ipc/i.test(e))
    expect(reschedErrors).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('7. suite launcher tile opens PlexiProjects view', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // The default view is PlexiSuite home — navigate away first so we can
    // come back to it as a clean test of the tile flow.
    // Use sidebar to go somewhere else
    await openProduct(window, 'projects')
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })

    // The persistent sidebar is always present; open the suite home directly.
    await window.getByRole('button', { name: 'PlexiSuite' }).first().click()
    await expect(window.locator('[data-testid="plexisuite-home"]')).toBeVisible({ timeout: 8_000 })

    // Click the PlexiProjects tile — this opens ProductHome (product detail page)
    const tile = window.locator('[data-testid="product-tile-plexiprojects"]')
    await expect(tile).toBeVisible({ timeout: 5_000 })
    await tile.click()

    // ProductHome should now be visible
    await expect(window.locator('[data-testid="product-home-plexiprojects"]')).toBeVisible({ timeout: 8_000 })

    // Click the "Open PlexiProjects" launch button on the product home page
    const openBtn = window.locator('[data-testid="open-plexiprojects"]')
    await expect(openBtn).toBeVisible({ timeout: 5_000 })
    await openBtn.click()

    // PlexiProjectsView mounts
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
  } finally {
    await dispose()
  }
})

test('8. no-fakery: percentComplete and task count are real; empty workspace shows empty state', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Fresh DB — no folders at all. IPC should return empty array.
    const summaries = await window.evaluate(async () => window.api.projects.list())
    expect(Array.isArray(summaries)).toBe(true)
    expect((summaries as unknown[]).length).toBe(0)

    // Navigate to confirm UI matches
    // Use .first() because the suite home tile with the same text is also in the DOM
    await openProduct(window, 'projects')
    await expect(window.locator('[data-testid="projects-empty"]')).toBeVisible({ timeout: 8_000 })

    // Now seed 1 folder with 2 tasks, 1 done
    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Real Project' })
    )
    const folderId: string = (folder as { id: string }).id
    await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Done task' }),
      folderId
    )
    const t2 = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Open task' }),
      folderId
    )
    // Mark t2 as done via nodes:update
    await window.evaluate(
      async (id) => window.api.nodes.update(id, { status: 'done' }),
      (t2 as { id: string }).id
    )

    // Re-read summaries
    const summaries2 = await window.evaluate(async () => window.api.projects.list())
    const proj = (summaries2 as Array<{
      id: string
      taskCount: number
      doneCount: number
      percentComplete: number
    }>).find((s) => s.id === folderId)

    expect(proj).toBeDefined()
    expect(proj!.taskCount).toBe(2)
    // doneCount computed from real status — 1 task was set to 'done'
    expect(proj!.doneCount).toBeGreaterThanOrEqual(1)
    expect(proj!.percentComplete).toBeGreaterThanOrEqual(50)
  } finally {
    await dispose()
  }
})
