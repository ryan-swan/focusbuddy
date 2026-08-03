import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// New desk-agent capability: `generate-document` lets an agent propose a
// populated slides/sheet/map/doc, not just plain text or table edits. This
// spec pushes a generate-document proposal directly into useAgentRunStore
// (API-driven, same store a real model run writes into — see
// deskAgentProposals.spec.ts for the established pattern) and drives the
// review-before-apply card through the real ProposalCards -> actionExecutor
// chain. No Anthropic key is configured in this isolated test profile, so
// applying is expected to surface an honest "needs API key" message rather
// than crashing or faking success.

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

test('a pushed generate-document proposal renders a labeled card and honestly degrades without an API key', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Gendoc task' })
    const agent = await api.widgets.create({
      taskId: task.id,
      kind: 'agent',
      title: 'Agent',
      content: JSON.stringify({ instruction: 'make a deck', trigger: 'manual', enabled: true }),
      x: 600,
      y: 200,
      width: 340,
      height: 320
    })
    return { taskId: task.id, agentId: agent.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Gendoc task/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  await expect(window.locator('text=Something went wrong')).toHaveCount(0)
  await expect(window.locator('[data-testid="agent-widget"]')).toBeVisible()

  // Push a generate-document proposal (create-new branch, no widgetId) into
  // the SAME store a real desk-agent run writes into.
  await window.evaluate(({ agentId }: { agentId: string }) => {
    const store = (
      window as unknown as {
        __fbAgentRun?: { getState: () => { setProposals: (id: string, proposals: unknown[]) => void } }
      }
    ).__fbAgentRun
    if (!store) throw new Error('__fbAgentRun hook missing')
    store.getState().setProposals(agentId, [
      {
        id: 'gd1',
        kind: 'generate-document',
        docType: 'slides',
        title: 'Test deck',
        prompt: 'a short test deck',
        reason: 'user asked for a presentation'
      }
    ])
  }, ids)

  // Card renders with a sensible label.
  await expect(window.locator('[data-testid="agent-proposals"]')).toBeVisible()
  const card = window.locator('[data-testid="proposal-card-gd1"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText(/generate deck/i)
  await expect(card).toContainText('Test deck')

  // Applying it must not crash the renderer, and without an API key must
  // surface an honest degradation message rather than a fake success.
  await card.click()
  const errorText = window.locator('[data-testid="proposal-card-gd1"]')
  await expect(errorText).toContainText(/API key/i, { timeout: 8_000 })

  // No error boundary, and the card is NOT marked applied (no fake success).
  await expect(window.locator('text=Something went wrong')).toHaveCount(0)
  await expect(window.locator('[data-testid="proposal-card-applied-gd1"]')).toHaveCount(0)
})
