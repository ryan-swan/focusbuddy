import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Verify PlexiFlow event triggers: task-completed and row-added fire matching
// flows; non-matching events do not; the loop guard prevents a flow's own
// mutations from re-triggering. All checks go through the IPC surface so
// we don't depend on a UI click to complete a task (which is a pointer-gesture
// limitation). The step log and lastStatus on the flow record are the ground
// truth for "the flow ran".

// Helper: wait up to maxMs, polling every 200 ms, for the flow to show lastRunAt.
// The dispatcher fires async (void) so we must give the microtask queue time to
// flush after the triggering mutation.
async function waitForFlowRun(
  window: import('@playwright/test').Page,
  flowId: string,
  previousLastRunAt: number | null,
  maxMs = 5000
): Promise<{ id: string; lastRunAt: number | null; lastStatus: string | null; lastLog: unknown[] }> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const flow = await window.evaluate(
      async (id) => window.api.flows.get(id),
      flowId
    ) as { id: string; lastRunAt: number | null; lastStatus: string | null; lastLog: unknown[] }
    if (flow.lastRunAt !== null && flow.lastRunAt !== previousLastRunAt) return flow
    await window.waitForTimeout(200)
  }
  // Return current state even if not updated — the assertion will fail with a
  // clear message.
  return window.evaluate(async (id) => window.api.flows.get(id), flowId) as Promise<{
    id: string; lastRunAt: number | null; lastStatus: string | null; lastLog: unknown[]
  }>
}

test('ET-1: task-completed trigger fires when a task is set to done', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Create a flow with trigger {kind:'event', event:'task-completed'} and a
    // create-task action so we can confirm the flow actually RAN.
    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-1 Flow' })
    ) as { id: string; lastRunAt: number | null }
    const flowId = flow.id

    await window.evaluate(
      async (id) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'task-completed' },
          actions: [{ id: 'et1-a1', type: 'create-task', title: 'ET1 Triggered Task' }]
        }),
      flowId
    )

    // Create a task, then complete it via IPC.
    const task = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'task', title: 'Source Task ET1' })
    ) as { id: string }
    const taskId = task.id

    const priorLastRunAt = (await window.evaluate(async (id) => window.api.flows.get(id), flowId) as { lastRunAt: number | null }).lastRunAt

    // Transition to done — this is the emit point.
    await window.evaluate(
      async (id) => window.api.nodes.update(id, { status: 'done' }),
      taskId
    )

    // Wait for the async flow to run.
    const updatedFlow = await waitForFlowRun(window, flowId, priorLastRunAt)

    expect(updatedFlow.lastRunAt).not.toBeNull()
    expect(updatedFlow.lastStatus).toBe('ok')

    // Confirm the create-task action produced a real task.
    const nodes = await window.evaluate(async () => window.api.nodes.list()) as Array<{ title: string; kind: string }>
    const triggered = nodes.find((n) => n.title === 'ET1 Triggered Task' && n.kind === 'task')
    expect(triggered).toBeDefined()
  } finally {
    await dispose()
  }
})

test('ET-2: task-completed trigger does NOT fire when task is set to in_progress', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-2 Flow' })
    ) as { id: string }
    const flowId = flow.id

    await window.evaluate(
      async (id) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'task-completed' },
          actions: [{ id: 'et2-a1', type: 'create-task', title: 'ET2 Should Not Appear' }]
        }),
      flowId
    )

    const task = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'task', title: 'Source Task ET2' })
    ) as { id: string }

    // Set to in_progress — must NOT emit task-completed.
    await window.evaluate(
      async (id) => window.api.nodes.update(id, { status: 'in_progress' }),
      task.id
    )

    // Give any potential (incorrect) async fire time to complete.
    await window.waitForTimeout(1000)

    const flowState = await window.evaluate(async (id) => window.api.flows.get(id), flowId) as {
      lastRunAt: number | null
    }

    // The flow must never have run.
    expect(flowState.lastRunAt).toBeNull()

    const nodes = await window.evaluate(async () => window.api.nodes.list()) as Array<{ title: string }>
    const shouldNotExist = nodes.find((n) => n.title === 'ET2 Should Not Appear')
    expect(shouldNotExist).toBeUndefined()
  } finally {
    await dispose()
  }
})

test('ET-3: row-added trigger fires when a row is added to any table (no tableId scope)', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-3 Flow' })
    ) as { id: string }
    const flowId = flow.id

    // No tableId — any table addition must trigger.
    await window.evaluate(
      async (id) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'row-added' },
          actions: [{ id: 'et3-a1', type: 'create-task', title: 'ET3 Row Triggered Task' }]
        }),
      flowId
    )

    const table = await window.evaluate(async () =>
      window.api.tables.create({ title: 'ET3 Table' })
    ) as { id: string }

    const priorLastRunAt = (await window.evaluate(async (id) => window.api.flows.get(id), flowId) as { lastRunAt: number | null }).lastRunAt

    // Adding a row emits row-added.
    await window.evaluate(
      async (id) => window.api.tables.createRow({ tableId: id }),
      table.id
    )

    const updatedFlow = await waitForFlowRun(window, flowId, priorLastRunAt)

    expect(updatedFlow.lastRunAt).not.toBeNull()
    expect(updatedFlow.lastStatus).toBe('ok')

    const nodes = await window.evaluate(async () => window.api.nodes.list()) as Array<{ title: string; kind: string }>
    const triggered = nodes.find((n) => n.title === 'ET3 Row Triggered Task' && n.kind === 'task')
    expect(triggered).toBeDefined()
  } finally {
    await dispose()
  }
})

test('ET-4: row-added trigger with tableId scope: fires for matching table, silent for other table', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Create two tables.
    const tableA = await window.evaluate(async () =>
      window.api.tables.create({ title: 'ET4 Table A' })
    ) as { id: string }
    const tableB = await window.evaluate(async () =>
      window.api.tables.create({ title: 'ET4 Table B' })
    ) as { id: string }

    // Flow scoped to tableA only.
    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-4 Flow' })
    ) as { id: string }
    const flowId = flow.id

    await window.evaluate(
      async ([id, tid]) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'row-added', tableId: tid },
          actions: [{ id: 'et4-a1', type: 'create-task', title: 'ET4 Scoped Triggered Task' }]
        }),
      [flowId, tableA.id] as [string, string]
    )

    // First: add a row to tableB — flow must NOT fire.
    await window.evaluate(
      async (id) => window.api.tables.createRow({ tableId: id }),
      tableB.id
    )
    await window.waitForTimeout(1000)

    const flowStateMid = await window.evaluate(async (id) => window.api.flows.get(id), flowId) as {
      lastRunAt: number | null
    }
    expect(flowStateMid.lastRunAt).toBeNull()

    // Second: add a row to tableA — flow MUST fire.
    const priorLastRunAt = flowStateMid.lastRunAt
    await window.evaluate(
      async (id) => window.api.tables.createRow({ tableId: id }),
      tableA.id
    )

    const updatedFlow = await waitForFlowRun(window, flowId, priorLastRunAt)

    expect(updatedFlow.lastRunAt).not.toBeNull()
    expect(updatedFlow.lastStatus).toBe('ok')

    // Exactly one triggered task — not two (the tableB row must not have fired it).
    const nodes = await window.evaluate(async () => window.api.nodes.list()) as Array<{ title: string; kind: string }>
    const matches = nodes.filter((n) => n.title === 'ET4 Scoped Triggered Task' && n.kind === 'task')
    expect(matches).toHaveLength(1)
  } finally {
    await dispose()
  }
})

test('ET-5 LOOP GUARD: row-added flow whose action is add-table-row runs exactly once, no cascade', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // We need a real table to add rows into.
    const table = await window.evaluate(async () =>
      window.api.tables.create({ title: 'ET5 Loop Guard Table' })
    ) as { id: string }
    const tableId = table.id

    // Create the potentially-looping flow.
    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-5 Loop Guard Flow' })
    ) as { id: string }
    const flowId = flow.id

    await window.evaluate(
      async ([id, tid]) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'row-added' },
          actions: [{ id: 'et5-a1', type: 'add-table-row', tableId: tid }]
        }),
      [flowId, tableId] as [string, string]
    )

    // Baseline: 0 rows.
    const rowsBefore = await window.evaluate(
      async (id) => window.api.tables.listRows(id),
      tableId
    ) as unknown[]
    expect(rowsBefore).toHaveLength(0)

    const priorLastRunAt = (await window.evaluate(async (id) => window.api.flows.get(id), flowId) as { lastRunAt: number | null }).lastRunAt

    // Manual trigger: add one row. This fires row-added, which runs the flow,
    // which tries to add another row — but withAutomationSuppressed must block
    // that second add from re-triggering the flow.
    await window.evaluate(
      async (id) => window.api.tables.createRow({ tableId: id }),
      tableId
    )

    // Wait for the one legitimate flow run to complete.
    await waitForFlowRun(window, flowId, priorLastRunAt)

    // Give any potential cascade extra time to surface.
    await window.waitForTimeout(1500)

    const flowFinal = await window.evaluate(async (id) => window.api.flows.get(id), flowId) as {
      lastRunAt: number | null
      lastStatus: string | null
      lastLog: Array<{ ok: boolean; message: string; type: string }>
    }

    // The flow must have run exactly once.
    expect(flowFinal.lastRunAt).not.toBeNull()
    expect(flowFinal.lastStatus).toBe('ok')

    // The table should have exactly 2 rows: the manual one + the one the flow added.
    // If the loop guard failed the table would grow unboundedly.
    const rowsAfter = await window.evaluate(
      async (id) => window.api.tables.listRows(id),
      tableId
    ) as unknown[]
    expect(rowsAfter).toHaveLength(2)

    // Confirm the flow's add-table-row step succeeded (it ran inside suppression).
    const addStep = flowFinal.lastLog.find((s) => s.type === 'add-table-row')
    expect(addStep).toBeDefined()
    expect(addStep!.ok).toBe(true)
    expect(addStep!.message).toContain('Added a row')
  } finally {
    await dispose()
  }
})

test('ET-6: dispatcher is wired at startup — importing flows.ts registers it before IPC calls begin', async () => {
  // This is exercised implicitly by ET-1/3/5, but we make it explicit: the very
  // first IPC call in a fresh app (no prior event) must result in a registered
  // dispatcher state. We verify by setting up a flow and immediately firing the
  // trigger without any warm-up. A non-registered dispatcher would silently drop
  // the event and lastRunAt would stay null.
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const flow = await window.evaluate(async () =>
      window.api.flows.create({ title: 'ET-6 Dispatcher Check' })
    ) as { id: string }
    const flowId = flow.id

    await window.evaluate(
      async (id) =>
        window.api.flows.update(id, {
          trigger: { kind: 'event', event: 'task-completed' },
          actions: [{ id: 'et6-a1', type: 'create-task', title: 'ET6 Dispatch Confirm' }]
        }),
      flowId
    )

    const task = await window.evaluate(async () =>
      window.api.nodes.create({ parentId: null, kind: 'task', title: 'ET6 Task' })
    ) as { id: string }

    const priorLastRunAt = (await window.evaluate(async (id) => window.api.flows.get(id), flowId) as { lastRunAt: number | null }).lastRunAt

    await window.evaluate(
      async (id) => window.api.nodes.update(id, { status: 'done' }),
      task.id
    )

    const updatedFlow = await waitForFlowRun(window, flowId, priorLastRunAt)

    // If lastRunAt is set, the dispatcher was wired before the event fired.
    expect(updatedFlow.lastRunAt).not.toBeNull()
    expect(updatedFlow.lastStatus).toBe('ok')
  } finally {
    await dispose()
  }
})
