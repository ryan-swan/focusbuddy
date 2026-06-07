import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Intelligent agent selection: as the user writes an agent's instruction, a
// non-intrusive suggestion offers a better-fitting role. They can switch this
// agent to it, or spin up a NEW agent with that role wired into the same flows.
// (Local heuristic path — no API key needed.)

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

const RESEARCH_INSTRUCTION =
  'research the open questions and knowledge gaps and find real sources for the findings'

test('a better-fitting role is suggested and can be switched in', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Recommend' })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent',
      content: JSON.stringify({ instruction: 'summarize', trigger: 'manual', enabled: true }),
      x: 120, y: 160, width: 360, height: 360
    })
    return { taskId: task.id, agentId: agent.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Recommend/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  await window.locator('[data-testid="agent-instruction"]').fill(RESEARCH_INSTRUCTION)
  const chip = window.locator('[data-testid="agent-suggestion"]')
  await expect(chip).toBeVisible({ timeout: 4_000 })
  const suggestedId = await chip.getAttribute('data-suggested-id')
  expect(suggestedId).toBeTruthy()

  await window.locator('[data-testid="agent-suggestion-switch"]').click()
  await window.waitForTimeout(700)

  const profileId = await window.evaluate(async (taskId: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const ws = await api.widgets.listByTask(taskId)
    const agent = ws.find((w) => w.kind === 'agent')
    return JSON.parse(agent?.content || '{}').profileId
  }, ids.taskId)
  expect(profileId).toBe(suggestedId)
})

test('"+ linked" creates a new agent with the role, wired into the same flows', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Linked' })
    const sticky = await api.widgets.create({
      taskId: task.id, kind: 'sticky', title: 'src', content: 'notes',
      x: 120, y: 540, width: 220, height: 160
    })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent',
      content: JSON.stringify({ instruction: 'summarize', trigger: 'manual', enabled: true }),
      x: 120, y: 160, width: 360, height: 360
    })
    // An input wired INTO the agent — the new linked agent should inherit it.
    await api.widgetLinks.create(sticky.id, agent.id, task.id)
    return { taskId: task.id, agentId: agent.id, stickyId: sticky.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Linked/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  await window.locator('[data-testid="agent-instruction"]').fill(RESEARCH_INSTRUCTION)
  const chip = window.locator('[data-testid="agent-suggestion"]')
  await expect(chip).toBeVisible({ timeout: 4_000 })
  const suggestedId = await chip.getAttribute('data-suggested-id')

  await window.locator('[data-testid="agent-suggestion-add"]').click()
  await window.waitForTimeout(1200)

  const result = await window.evaluate(
    async ({ taskId, agentId, stickyId }: { taskId: string; agentId: string; stickyId: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(taskId)
      const agents = ws.filter((w) => w.kind === 'agent')
      const fresh = agents.find((w) => w.id !== agentId)
      const links = await api.widgetLinks.listByTask(taskId)
      return {
        agentCount: agents.length,
        freshProfileId: fresh ? JSON.parse(fresh.content || '{}').profileId : null,
        inheritedWire: fresh ? links.some((l) => l.sourceWidgetId === stickyId && l.targetWidgetId === fresh.id) : false
      }
    },
    ids
  )
  expect(result.agentCount).toBe(2)
  expect(result.freshProfileId).toBe(suggestedId)
  expect(result.inheritedWire).toBe(true)
})
