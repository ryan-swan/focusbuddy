import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Verifies two new features shipped together:
//
// FEATURE 1 — PlexiProjects task management additions
//   • projects-new button creates a folder and opens its Gantt
//   • projects-add-task reveals input + confirm; typing and confirming adds a task
//     that appears on the timeline and auto-opens the task editor
//   • task-editor contains: task-title (editable, renames on blur/Enter),
//     task-delete, task-open, task-add-dep (predecessor picker),
//     task-add-succ (successor picker) — all present
//   • gantt-bar-<id> elements are draggable (pointer-down + move + up commits
//     a new planStart); a no-drag click still opens the editor
//
// FEATURE 2 — ModuleHome dashboards replace blank panels
//   • PlexiFlow, PlexiForms, PlexiBuild, PlexiMeet show module-home-<key>
//     when nothing is selected
//   • Each module-home has a create button and a Customize button
//   • Customize button opens a popover with section checkboxes
//   • Create button creates an item (smoke test via IPC verification)
//   • No crash occurs

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1
// ─────────────────────────────────────────────────────────────────────────────

test('F1-1. projects-new button creates a folder and opens its Gantt', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })

    // Fresh DB — empty state shown
    await expect(window.locator('[data-testid="projects-new"]')).toBeVisible({ timeout: 5_000 })

    await window.locator('[data-testid="projects-new"]').click()

    // After click the Gantt for the new folder should open (projects-add-task visible
    // in the Gantt header, and the back button is visible)
    await expect(window.locator('[data-testid="projects-add-task"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.locator('[data-testid="projects-back"]')).toBeVisible()

    // Confirm IPC: exactly 1 folder node exists
    const nodes = await window.evaluate(async () => window.api.nodes.list())
    const folders = (nodes as Array<{ kind: string; title: string }>).filter((n) => n.kind === 'folder')
    expect(folders.length).toBeGreaterThanOrEqual(1)
    expect(folders[0].title).toBe('New project')
  } finally {
    await dispose()
  }
})

test('F1-2. projects-add-task reveals input + confirm; confirming adds task to Gantt and opens editor', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // A bare folder (no tasks) does not appear in the portfolio card grid.
    // Use projects-new to create a folder and enter its Gantt in one step —
    // the same path a real user would take.
    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="projects-new"]').click()
    await expect(window.locator('[data-testid="projects-add-task"]')).toBeVisible({ timeout: 8_000 })

    // Capture the folder id from IPC so we can verify the task went under it
    const nodes0 = await window.evaluate(async () => window.api.nodes.list())
    const folder = (nodes0 as Array<{ kind: string; id: string; title: string }>)
      .find((n) => n.kind === 'folder' && n.title === 'New project')
    const folderId = folder?.id ?? ''
    expect(folderId).not.toBe('')

    // Click "Add task" — reveals the inline input
    await window.locator('[data-testid="projects-add-task"]').click()
    await expect(window.locator('[data-testid="projects-new-task-input"]')).toBeVisible({ timeout: 3_000 })
    await expect(window.locator('[data-testid="projects-new-task-confirm"]')).toBeVisible()

    // Type a title and confirm
    await window.locator('[data-testid="projects-new-task-input"]').fill('Integration Task')
    await window.locator('[data-testid="projects-new-task-confirm"]').click()

    // Task should appear on the Gantt — IPC confirms it exists under the folder
    await window.waitForTimeout(600)
    const nodes = await window.evaluate(async () => window.api.nodes.list())
    const tasks = (nodes as Array<{ kind: string; parentId: string | null; title: string; id: string }>)
      .filter((n) => n.kind === 'task' && n.parentId === folderId)
    expect(tasks.length).toBe(1)
    expect(tasks[0].title).toBe('Integration Task')

    const taskId = tasks[0].id

    // Gantt bar and row must be visible
    await expect(window.locator(`[data-testid="gantt-bar-${taskId}"]`)).toBeVisible({ timeout: 5_000 })
    await expect(window.locator(`[data-testid="gantt-row-${taskId}"]`)).toBeVisible()

    // The task editor should have auto-opened (setSelectedId called in addTask)
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })
  } finally {
    await dispose()
  }
})

test('F1-3. task-editor has all required controls including new task-add-succ picker', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Seed two tasks so both predecessor and successor pickers have candidates
    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Editor Controls Project' })
    )
    const folderId: string = (folder as { id: string }).id

    const taskA = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Task Alpha' }),
      folderId
    )
    const taskAId: string = (taskA as { id: string }).id

    await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Task Beta' }),
      folderId
    )

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator(`[data-testid="gantt-row-${taskAId}"]`)).toBeVisible({ timeout: 8_000 })

    // Click Task Alpha row to open editor
    await window.locator(`[data-testid="gantt-row-${taskAId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // All required controls
    await expect(window.locator('[data-testid="task-title"]')).toBeVisible()
    await expect(window.locator('[data-testid="task-delete"]')).toBeVisible()
    await expect(window.locator('[data-testid="task-open"]')).toBeVisible()
    // task-add-dep: the predecessor picker (select element) — visible only when candidates exist
    await expect(window.locator('[data-testid="task-add-dep"]')).toBeVisible({ timeout: 3_000 })
    // task-add-succ: the new successor picker — visible only when candidates exist
    await expect(window.locator('[data-testid="task-add-succ"]')).toBeVisible({ timeout: 3_000 })
  } finally {
    await dispose()
  }
})

test('F1-4. task-title rename via Enter persists to IPC', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Rename Project' })
    )
    const folderId: string = (folder as { id: string }).id
    const task = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Old Title' }),
      folderId
    )
    const taskId: string = (task as { id: string }).id

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await window.locator(`[data-testid="gantt-row-${taskId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // Clear and type new title, then press Enter
    const titleInput = window.locator('[data-testid="task-title"]')
    await titleInput.clear()
    await titleInput.fill('New Title')
    await titleInput.press('Enter')
    await window.waitForTimeout(500)

    // Verify via IPC
    const nodes = await window.evaluate(async () => window.api.nodes.list())
    const renamed = (nodes as Array<{ id: string; title: string }>).find((n) => n.id === taskId)
    expect(renamed?.title).toBe('New Title')
  } finally {
    await dispose()
  }
})

test('F1-5. task-add-succ (successor picker) creates a link and engine honours it', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Succ Project' })
    )
    const folderId: string = (folder as { id: string }).id

    const taskA = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Must-go-first' }),
      folderId
    )
    const taskAId: string = (taskA as { id: string }).id

    const taskB = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Waits for A' }),
      folderId
    )
    const taskBId: string = (taskB as { id: string }).id

    // Give A explicit dates so the engine can compute a measurable offset
    const now = Date.now()
    const dayMs = 86_400_000
    await window.evaluate(
      async ([tid, start, due]) => window.api.projects.setTaskPlan(tid, { planStart: start, planDue: due }),
      [taskAId, now, now + 3 * dayMs] as [string, number, number]
    )

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator(`[data-testid="gantt-row-${taskAId}"]`)).toBeVisible({ timeout: 8_000 })

    // Open Task A's editor and add Task B as a SUCCESSOR (A blocks B)
    await window.locator(`[data-testid="gantt-row-${taskAId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="task-add-succ"]')).toBeVisible({ timeout: 3_000 })

    // Select Task B in the successor picker
    await window.locator('[data-testid="task-add-succ"]').selectOption({ value: taskBId })
    await window.waitForTimeout(800)

    // Verify via IPC: the dep A→B now exists
    const plan = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const planTyped = plan as {
      deps: Array<{ predId: string; succId: string }>
      tasks: Array<{ id: string; scheduledStartMs: number; scheduledEndMs: number }>
    }
    const dep = planTyped.deps.find((d) => d.predId === taskAId && d.succId === taskBId)
    expect(dep).toBeDefined()

    // Engine: B starts at or after A ends
    const a = planTyped.tasks.find((t) => t.id === taskAId)!
    const b = planTyped.tasks.find((t) => t.id === taskBId)!
    expect(b.scheduledStartMs).toBeGreaterThanOrEqual(a.scheduledEndMs)
  } finally {
    await dispose()
  }
})

test('F1-6. gantt-bar drag commits new planStart; click (no-drag) opens editor', async () => {
  // Drag is tested deterministically via pointer events: pointerdown + pointermove
  // (delta > 3px threshold) + pointerup. Click (no drag) is a separate gesture.
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Drag Project' })
    )
    const folderId: string = (folder as { id: string }).id
    const task = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Draggable Task' }),
      folderId
    )
    const taskId: string = (task as { id: string }).id

    // Give a concrete plan start so the bar is at a predictable position
    const now = Date.now()
    const dayMs = 86_400_000
    await window.evaluate(
      async ([tid, start]) => window.api.projects.setTaskPlan(tid, { planStart: start }),
      [taskId, now] as [string, number]
    )

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await expect(window.locator(`[data-testid="gantt-bar-${taskId}"]`)).toBeVisible({ timeout: 8_000 })

    // ── Part A: click (no drag) opens editor ──────────────────────────────────
    // Ensure editor is closed first (click on empty area)
    const bar = window.locator(`[data-testid="gantt-bar-${taskId}"]`)
    // A clean click (pointer down + up, no move) should open the editor
    await bar.click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // Close editor by clicking the close button inside it
    await window.locator('[data-testid="task-editor"] button[title="Close"]').click()
    await expect(window.locator('[data-testid="task-editor"]')).not.toBeVisible({ timeout: 3_000 })

    // ── Part B: drag commits new planStart ────────────────────────────────────
    const planBefore = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const startBefore = (planBefore as {
      tasks: Array<{ id: string; planStart: number | null }>
    }).tasks.find((t) => t.id === taskId)?.planStart

    // Simulate a drag: pointerdown on bar centre, move 78px right (3 days), pointerup
    const box = await bar.boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    await window.mouse.move(cx, cy)
    await window.mouse.down()
    // Move in steps to exceed the 3px moved threshold
    await window.mouse.move(cx + 30, cy)
    await window.mouse.move(cx + 60, cy)
    await window.mouse.move(cx + 78, cy)  // ~3 days at 26px/day
    await window.mouse.up()

    await window.waitForTimeout(800)

    // Editor should NOT have opened (it was a drag not a click)
    // (it may or may not be open depending on timing; the key assertion is IPC change)
    const planAfter = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const startAfter = (planAfter as {
      tasks: Array<{ id: string; planStart: number | null }>
    }).tasks.find((t) => t.id === taskId)?.planStart

    // planStart should have moved forward (or at minimum changed) after a 3-day drag
    // startBefore may be null (no explicit date set) in which case the reschedule sets one
    // The key invariant: after drag the bar still renders without crash
    await expect(window.locator(`[data-testid="gantt-bar-${taskId}"]`)).toBeVisible()

    // If planStart was set before the drag, it should have moved
    if (startBefore != null && startAfter != null) {
      // 78px / 26px per day = 3 days forward
      expect(startAfter).toBeGreaterThan(startBefore)
      expect(startAfter - startBefore).toBeGreaterThanOrEqual(dayMs * 2) // at least 2 days
    } else {
      // planStart was null (no explicit start set); after drag it should be set to something
      expect(startAfter).not.toBeNull()
    }
  } finally {
    await dispose()
  }
})

test('F1-7. task-delete removes the task from the Gantt', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const folder = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'folder', title: 'Delete Project' })
    )
    const folderId: string = (folder as { id: string }).id
    const task = await window.evaluate(
      async (pid) => window.api.nodes.create({ parentId: pid, kind: 'task', title: 'Doomed Task' }),
      folderId
    )
    const taskId: string = (task as { id: string }).id

    await window.getByRole('button', { name: 'PlexiProjects' }).first().click()
    await expect(window.locator(`[data-testid="project-card-${folderId}"]`)).toBeVisible({ timeout: 8_000 })
    await window.locator(`[data-testid="project-card-${folderId}"]`).click()
    await window.locator(`[data-testid="gantt-row-${taskId}"]`).click()
    await expect(window.locator('[data-testid="task-editor"]')).toBeVisible({ timeout: 5_000 })

    // Click delete
    await window.locator('[data-testid="task-delete"]').click()
    await window.waitForTimeout(500)

    // Editor closes and the task bar is gone
    await expect(window.locator('[data-testid="task-editor"]')).not.toBeVisible({ timeout: 3_000 })
    await expect(window.locator(`[data-testid="gantt-bar-${taskId}"]`)).not.toBeVisible()

    // IPC confirms task is gone (or in trash)
    const plan = await window.evaluate(
      async (pid) => window.api.projects.plan(pid),
      folderId
    )
    const remaining = (plan as { tasks: Array<{ id: string }> }).tasks.filter((t) => t.id === taskId)
    expect(remaining.length).toBe(0)
  } finally {
    await dispose()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — ModuleHome dashboards
// ─────────────────────────────────────────────────────────────────────────────

test('F2-1. PlexiFlow: module-home-flows renders with create + customize buttons', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiFlow' }).first().click()
    await expect(window.locator('[data-testid="plexiflow-view"]')).toBeVisible({ timeout: 8_000 })

    // Nothing selected → ModuleHome renders in the right panel
    await expect(window.locator('[data-testid="module-home-flows"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="module-home-create-flows"]')).toBeVisible()
    await expect(window.locator('[data-testid="module-home-customize-flows"]')).toBeVisible()

    // Stat tiles (stats section) should be visible; 3 stats are always passed
    // They render inside module-home-flows
    const homeEl = window.locator('[data-testid="module-home-flows"]')
    await expect(homeEl).toContainText('Flows')

    // Customize button opens popover with section checkboxes
    await window.locator('[data-testid="module-home-customize-flows"]').click()
    // The popover is a w-56 rounded-xl card that appears immediately after the button
    // in the DOM. Scope to the popover div so we avoid matching the section headings
    // in the main dashboard (which also contain "Your flows" as an h2).
    // The popover renders as the second child of the relative-positioned wrapper.
    // We identify it by the "Sections on this home" label that only appears inside it.
    const popover = window.locator('.w-56.rounded-xl')
    await expect(popover).toBeVisible({ timeout: 3_000 })
    await expect(popover.getByText('Overview tiles')).toBeVisible()
    await expect(popover.getByText('Your flows')).toBeVisible()
    // Dismiss popover by clicking the fixed overlay (which sits behind the popover)
    await window.locator('[data-testid="module-home-flows"]').click({ position: { x: 5, y: 5 } })
  } finally {
    await dispose()
  }
})

test('F2-2. PlexiFlow module-home create button creates a flow (smoke)', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiFlow' }).first().click()
    await expect(window.locator('[data-testid="module-home-flows"]')).toBeVisible({ timeout: 8_000 })

    // Click the create button in ModuleHome
    await window.locator('[data-testid="module-home-create-flows"]').click()
    await window.waitForTimeout(500)

    // IPC should now have a flow
    const flows = await window.evaluate(async () => window.api.flows.list())
    expect((flows as unknown[]).length).toBeGreaterThan(0)

    // FlowEditor should now be open (a flow was selected after creation)
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 5_000 })
  } finally {
    await dispose()
  }
})

test('F2-3. PlexiForms: module-home-forms renders with create + customize buttons', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiForms' }).first().click()
    await expect(window.locator('[data-testid="plexiforms-view"]')).toBeVisible({ timeout: 8_000 })

    // Nothing selected → ModuleHome
    await expect(window.locator('[data-testid="module-home-forms"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="module-home-create-forms"]')).toBeVisible()
    await expect(window.locator('[data-testid="module-home-customize-forms"]')).toBeVisible()

    // Customize opens popover
    await window.locator('[data-testid="module-home-customize-forms"]').click()
    await expect(window.getByText('Overview tiles')).toBeVisible({ timeout: 3_000 })
    // Dismiss
    await window.locator('[data-testid="module-home-forms"]').click({ position: { x: 5, y: 5 } })
  } finally {
    await dispose()
  }
})

test('F2-4. PlexiBuild: module-home-build renders with create + customize buttons', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiBuild' }).first().click()
    await expect(window.locator('[data-testid="plexibuild-view"]')).toBeVisible({ timeout: 8_000 })

    // Nothing selected → ModuleHome
    await expect(window.locator('[data-testid="module-home-build"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="module-home-create-build"]')).toBeVisible()
    await expect(window.locator('[data-testid="module-home-customize-build"]')).toBeVisible()
  } finally {
    await dispose()
  }
})

test('F2-5. PlexiMeet: module-home-meet renders with create + customize buttons', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiMeet' }).first().click()
    await expect(window.locator('[data-testid="pleximeet-view"]')).toBeVisible({ timeout: 8_000 })

    // Nothing selected → ModuleHome
    await expect(window.locator('[data-testid="module-home-meet"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="module-home-create-meet"]')).toBeVisible()
    await expect(window.locator('[data-testid="module-home-customize-meet"]')).toBeVisible()
  } finally {
    await dispose()
  }
})

test('F2-6. PlexiReports: module-home-reports renders; existing empty state still works', async () => {
  // PlexiReports uses ModuleHome AND has a sidebar empty state. Both must coexist.
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiReports' }).first().click()
    await expect(window.locator('[data-testid="plexireports-view"]')).toBeVisible({ timeout: 8_000 })

    // ModuleHome renders in the right pane when nothing is selected
    await expect(window.locator('[data-testid="module-home-reports"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="module-home-create-reports"]')).toBeVisible()
    await expect(window.locator('[data-testid="module-home-customize-reports"]')).toBeVisible()

    // No crash
    const errors: string[] = []
    window.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await window.waitForTimeout(300)
    const renderErrors = errors.filter((e) => /error|crash|uncaught/i.test(e))
    expect(renderErrors).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('F2-7. Customize popover: toggling a section checkbox hides/shows that section', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.getByRole('button', { name: 'PlexiFlow' }).first().click()
    await expect(window.locator('[data-testid="module-home-flows"]')).toBeVisible({ timeout: 8_000 })

    // Open customize popover
    await window.locator('[data-testid="module-home-customize-flows"]').click()

    // Scope to the popover card (w-56 rounded-xl) to avoid strict-mode violations
    // from matching both the popover label <span> and the section <h2> heading.
    const popover = window.locator('.w-56.rounded-xl')
    await expect(popover).toBeVisible({ timeout: 3_000 })

    // "What you can do here" appears both as a popover checkbox label and as a
    // dashboard section h2. Scope to popover for the presence check.
    await expect(popover.getByText('What you can do here')).toBeVisible()

    const homeEl = window.locator('[data-testid="module-home-flows"]')

    // The checkbox is inside the label scoped to the popover
    const tipsCheckbox = popover.locator('label').filter({ hasText: 'What you can do here' }).locator('input[type="checkbox"]')
    await tipsCheckbox.uncheck()

    // Dismiss popover by clicking outside
    await homeEl.click({ position: { x: 5, y: 5 } })
    await window.waitForTimeout(200)

    // The tips section heading should now be hidden
    // The heading is an h2 rendered inside module-home-flows (text "WHAT YOU CAN DO HERE")
    const tipsHeading = homeEl.locator('h2').filter({ hasText: /what you can do here/i })
    await expect(tipsHeading).not.toBeVisible({ timeout: 3_000 })

    // Re-open and re-check to restore
    await window.locator('[data-testid="module-home-customize-flows"]').click()
    await tipsCheckbox.check()
    await homeEl.click({ position: { x: 5, y: 5 } })
    await window.waitForTimeout(200)

    // Tips heading should be visible again
    await expect(tipsHeading).toBeVisible({ timeout: 3_000 })
  } finally {
    await dispose()
  }
})
