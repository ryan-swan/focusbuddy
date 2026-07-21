import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// "Agents that act" — a desk agent wired to a table can propose concrete
// workspace changes (set-cell, add-table-row, etc.) that surface as
// review-before-apply cards on the agent widget. Nothing auto-applies.
//
// Running a real model call needs an Anthropic key, so this spec proves the
// structural + rendering + apply contract without one:
//   1. An agent wired to a table renders cleanly (no crash) and shows the
//      "Quick jobs" row with the "Enrich a table" job in its empty state.
//   2. A proposal set pushed into useAgentRunStore (the same store runAgent
//      writes into after a real run) renders as data-testid="agent-proposals"
//      with a clickable card.
//   3. Clicking the card actually applies it via the real apply chain — the
//      table cell changes for real, proving the wiring from AgentWidget →
//      ProposalCards → actionExecutor.applySetCell is intact end to end.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function hideAssistant(window: LaunchedApp['window']): Promise<void> {
  const btn = window.getByRole('button', { name: 'Hide assistant panel' })
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await window.waitForTimeout(150)
}

test('agent wired to a table shows quick jobs incl. "Enrich a table" and renders without error', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Agent proposal task' })
    const table = await api.tables.create({
      taskId: task.id,
      title: 'Leads',
      schema: { columns: [{ id: 'c1', type: 'text-short', label: 'Company', config: {} }] }
    })
    const row = await api.tables.createRow({ tableId: table.id, cells: { c1: 'Acme' } })
    const tableWidget = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'Leads',
      content: table.id,
      x: 120,
      y: 200,
      width: 420,
      height: 300
    })
    const agent = await api.widgets.create({
      taskId: task.id,
      kind: 'agent',
      title: 'Agent',
      content: '',
      x: 600,
      y: 200,
      width: 340,
      height: 320
    })
    await api.widgetLinks.create(tableWidget.id, agent.id, task.id)
    return { taskId: task.id, agentId: agent.id, tableWidgetId: tableWidget.id, tableId: table.id, rowId: row.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Agent proposal task/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  // No crash / error boundary.
  await expect(window.locator('text=Something went wrong')).toHaveCount(0)
  await expect(window.locator('[data-testid="agent-widget"]')).toBeVisible()

  // Wired input shows.
  await expect(window.locator('[data-testid="agent-input-count"]')).toContainText(/1 input/i)

  // Empty-state quick jobs, including the table-oriented one.
  await expect(window.locator('[data-testid="agent-jobs"]')).toBeVisible()
  await expect(window.locator('[data-testid="agent-job-enrich"]')).toBeVisible()
  await expect(window.locator('[data-testid="agent-job-enrich"]')).toContainText('Enrich a table')

  // Clicking it fills the instruction box.
  await window.locator('[data-testid="agent-job-enrich"]').click()
  await expect(window.locator('[data-testid="agent-instruction"]')).toHaveValue(/fill in the empty fields/i)

  // Quick jobs disappear once the instruction is non-empty.
  await expect(window.locator('[data-testid="agent-jobs"]')).toHaveCount(0)
})

test('a pushed proposal renders a review card and applying it changes the real table cell', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Agent apply task' })
    const table = await api.tables.create({
      taskId: task.id,
      title: 'Leads',
      schema: { columns: [{ id: 'c1', type: 'text-short', label: 'Company', config: {} }] }
    })
    const row = await api.tables.createRow({ tableId: table.id, cells: { c1: 'Acme' } })
    const tableWidget = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'Leads',
      content: table.id,
      x: 120,
      y: 200,
      width: 420,
      height: 300
    })
    const agent = await api.widgets.create({
      taskId: task.id,
      kind: 'agent',
      title: 'Agent',
      content: JSON.stringify({ instruction: 'enrich the leads table', trigger: 'manual', enabled: true }),
      x: 600,
      y: 200,
      width: 340,
      height: 320
    })
    await api.widgetLinks.create(tableWidget.id, agent.id, task.id)
    return { taskId: task.id, agentId: agent.id, tableId: table.id, rowId: row.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Agent apply task/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  await expect(window.locator('[data-testid="agent-widget"]')).toBeVisible()

  // Push a proposal set directly into the SAME store a real run writes into
  // (API-driven — bypasses the live model call, which needs a key).
  await window.evaluate(
    ({ agentId, tableId, rowId }: { agentId: string; tableId: string; rowId: string }) => {
      const store = (window as unknown as {
        __fbAgentRun?: {
          getState: () => {
            setProposals: (id: string, proposals: unknown[]) => void
          }
        }
      }).__fbAgentRun
      if (!store) throw new Error('__fbAgentRun hook missing')
      store.getState().setProposals(agentId, [
        {
          id: 'p1',
          kind: 'set-cell',
          tableId,
          rowId,
          cells: { Company: 'TestCo Enriched' },
          reason: 'test-driven proposal'
        }
      ])
    },
    { agentId: ids.agentId, tableId: ids.tableId, rowId: ids.rowId }
  )

  // The proposal card renders.
  await expect(window.locator('[data-testid="agent-proposals"]')).toBeVisible()
  const card = window.locator('[data-testid="proposal-card-p1"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Set cells')
  await expect(card).toContainText('Company = TestCo Enriched')

  // Applying it actually changes the table cell for real.
  await card.click()
  await expect(window.locator('[data-testid="proposal-card-applied-p1"]')).toBeVisible({ timeout: 5_000 })

  const cellValue = await window.evaluate(async (tableId: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const rows = await api.tables.listRows(tableId)
    return rows[0]?.cells?.c1
  }, ids.tableId)
  expect(cellValue).toBe('TestCo Enriched')
})
