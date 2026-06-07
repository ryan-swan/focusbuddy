import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Agent profiles: an agent can take on a "job description" that shapes how it
// works (built-in roles + user-created). Selecting one persists a profileId; a
// custom profile can be created by hand and is then selectable.

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

async function seedAndOpen(window: LaunchedApp['window']): Promise<{ taskId: string; agentId: string }> {
  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Profiles' })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent',
      content: JSON.stringify({ instruction: 'summarize', trigger: 'manual', enabled: true }),
      x: 120, y: 160, width: 340, height: 340
    })
    return { taskId: task.id, agentId: agent.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Profiles/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)
  return ids
}

async function agentProfileId(window: LaunchedApp['window'], taskId: string): Promise<string | undefined> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const ws = await api.widgets.listByTask(tid)
    const agent = ws.find((w) => w.kind === 'agent')
    try {
      return JSON.parse(agent?.content || '{}').profileId
    } catch {
      return undefined
    }
  }, taskId)
}

test('selecting a built-in profile persists on the agent', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await seedAndOpen(window)

  await window.locator('[data-testid="agent-profile-button"]').click()
  await window.locator('[data-testid="agent-profile-option-bi-researcher"]').click()
  await window.waitForTimeout(600)

  expect(await agentProfileId(window, ids.taskId)).toBe('bi-researcher')
  await expect(window.locator('[data-testid="agent-profile-button"]')).toContainText('Research Analyst')
})

test('a starter-kit library profile can be searched and selected', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await seedAndOpen(window)

  await window.locator('[data-testid="agent-profile-button"]').click()
  await window.locator('[data-testid="agent-profile-search"]').fill('research scout')
  await window.locator('[data-testid="agent-profile-option-lib-research-scout"]').click()
  await window.waitForTimeout(600)

  expect(await agentProfileId(window, ids.taskId)).toBe('lib-research-scout')
  await expect(window.locator('[data-testid="agent-profile-button"]')).toContainText('Research Scout')
})

test('a custom profile can be created and selected', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await seedAndOpen(window)

  await window.locator('[data-testid="agent-profile-button"]').click()
  await window.locator('[data-testid="agent-profile-create"]').click()
  await expect(window.locator('[data-testid="agent-profile-dialog"]')).toBeVisible()

  await window.locator('[data-testid="agent-profile-name"]').fill('Contract Reviewer')
  await window
    .locator('[data-testid="agent-profile-prompt"]')
    .fill('You review contracts and flag risky or unusual clauses with a short rationale.')
  await window.locator('[data-testid="agent-profile-save"]').click()
  await window.waitForTimeout(600)

  // Selected on the agent and shown on the button.
  await expect(window.locator('[data-testid="agent-profile-button"]')).toContainText('Contract Reviewer')
  expect(await agentProfileId(window, ids.taskId)).toMatch(/^cp-/)

  // Persisted to the profiles store.
  const stored = await window.evaluate(() => localStorage.getItem('fb.agent.profiles') || '[]')
  expect(stored).toContain('Contract Reviewer')
})
