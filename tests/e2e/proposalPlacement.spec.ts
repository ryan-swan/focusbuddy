/**
 * Feature: a flexible destination menu on every suggestion card. A content
 * proposal can be placed on this desk, another desk, a new desk, or (for a
 * document) into Files, via an inline chooser opened from the card's "choose
 * where" control — no dead-end when off a desk, and a real choice when on one.
 *
 * Proposals are injected the same way docAssistantConsolidation does: seed an
 * assistant turn + its proposals on the fresh ('__new__') thread with the API-key
 * gate lifted, so the card renders without a live model call.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

async function openAssistantChat(window: Page): Promise<void> {
  await window.locator('[data-testid="assistant-pill"]').click().catch(() => {})
  await window.locator('[data-testid="assistant-tab-chat"]').click()
}

// Seed one assistant turn carrying the given proposal on the fresh thread.
async function seedProposal(window: Page, proposal: Record<string, unknown>): Promise<void> {
  await window.evaluate((p) => {
    const chat = (window as unknown as {
      __fbChat?: {
        getState: () => { messagesByTask: Record<string, unknown[]>; proposalsByMessage: Record<string, unknown[]> }
        setState: (patch: unknown) => void
      }
    }).__fbChat
    if (!chat) return
    const ts = 1755000009000
    const s = chat.getState()
    chat.setState({
      hasApiKey: true,
      messagesByTask: { ...s.messagesByTask, __new__: [{ role: 'assistant', content: 'Here you go.', ts }] },
      proposalsByMessage: { ...s.proposalsByMessage, [String(ts)]: [p] }
    })
  }, proposal)
}

const TABLE = { id: 'p-tbl', kind: 'create-table', title: 'Tracker', columns: [{ label: 'Name', type: 'text-short' }], reason: 'test' }
const GENDOC = { id: 'p-doc', kind: 'generate-document', docType: 'doc', prompt: 'Write a short plan', title: 'Plan', reason: 'test' }

test.describe('placement chooser — off a desk', () => {
  let app: LaunchedApp
  let window: Page
  test.beforeAll(async () => { app = await launchApp(); window = app.window; await waitForReady(window) })
  test.afterAll(async () => { await app.dispose() })

  test('the card "choose where" control opens a desk chooser (no This-desk off a desk)', async () => {
    await openAssistantChat(window)
    await seedProposal(window, TABLE)
    await expect(window.locator('[data-testid="proposal-card-p-tbl"]')).toBeVisible({ timeout: 6_000 })
    await window.locator('[data-testid="proposal-place-p-tbl"]').click()
    await expect(window.locator('[data-testid="desk-offer"]')).toBeVisible({ timeout: 4_000 })
    await expect(window.locator('[data-testid="desk-offer-name"]')).toBeVisible()
    // Off a desk there is no current desk to add to, and a table can't go to Files.
    await expect(window.locator('[data-testid="place-this-desk"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="place-files"]')).toHaveCount(0)
  })
})

test.describe('placement chooser — a generated document offers Files', () => {
  let app: LaunchedApp
  let window: Page
  test.beforeAll(async () => { app = await launchApp(); window = app.window; await waitForReady(window) })
  test.afterAll(async () => { await app.dispose() })

  test('a generate-document card can be sent to Files', async () => {
    await openAssistantChat(window)
    await seedProposal(window, GENDOC)
    await expect(window.locator('[data-testid="proposal-card-p-doc"]')).toBeVisible({ timeout: 6_000 })
    await window.locator('[data-testid="proposal-place-p-doc"]').click()
    await expect(window.locator('[data-testid="desk-offer"]')).toBeVisible({ timeout: 4_000 })
    // A document can live in Files; a new/other desk is also offered.
    await expect(window.locator('[data-testid="place-files"]')).toBeVisible()
    await expect(window.locator('[data-testid="desk-offer-name"]')).toBeVisible()
  })
})

test.describe('placement chooser — on a desk offers This desk', () => {
  let app: LaunchedApp
  let window: Page
  test.beforeAll(async () => { app = await launchApp(); window = app.window; await waitForReady(window) })
  test.afterAll(async () => { await app.dispose() })

  test('on a desk, the chooser offers This desk', async () => {
    // Create a desk and navigate onto it, so there is a current desk.
    await window.evaluate(async () => {
      const nodes = (window as unknown as { __fbNodes?: { getState: () => { create: (d: unknown) => Promise<{ id: string }> } } }).__fbNodes
      const view = (window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }).__fbView
      const desk = await nodes?.getState().create({ parentId: null, kind: 'task', title: 'Placement desk' })
      if (desk) view?.getState().goTask(desk.id)
    })
    await window.waitForTimeout(400)
    await openAssistantChat(window)
    await seedProposal(window, TABLE)
    await expect(window.locator('[data-testid="proposal-card-p-tbl"]')).toBeVisible({ timeout: 6_000 })
    await window.locator('[data-testid="proposal-place-p-tbl"]').click()
    await expect(window.locator('[data-testid="desk-offer"]')).toBeVisible({ timeout: 4_000 })
    await expect(window.locator('[data-testid="place-this-desk"]')).toBeVisible()
  })
})
