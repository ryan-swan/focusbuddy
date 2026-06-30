/**
 * Verifies the deeper PlexiFlow delete-while-editing fix:
 * - unmount-flush removed entirely
 * - Remove button has onMouseDown preventDefault (no blur-commit before remove)
 * - removeAction filters by action.id, not index
 *
 * Main case: delete-while-editing yields exactly ["ALPHA","CHARLIE"].
 * Sanity 1: normal blur-persist still works.
 * Sanity 2: switching flows without explicit blur persists the edit (blur fires on navigation).
 * Sanity 3: add-table-row select commits immediately on change.
 */
import { test, expect } from '@playwright/test'
import { openProduct, launchApp, waitForReady } from './_helpers'

async function openFlow(window: import('@playwright/test').Page): Promise<void> {
  await openProduct(window, 'flow')
  const openBtn = window.locator('[data-testid="open-plexiflow"]')
  if (await openBtn.isVisible({ timeout: 2000 }).catch(() => false)) await openBtn.click()
  await expect(window.locator('[data-testid="plexiflow-view"]')).toBeVisible({ timeout: 8000 })
}

// ---------------------------------------------------------------------------
// Main case: delete-while-editing
// ---------------------------------------------------------------------------

test('delete-while-editing: remaining actions are exactly ["ALPHA","CHARLIE"]', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openFlow(window)

    // Create one flow
    await window.locator('[data-testid="flow-new"]').click()
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 4000 })

    const flows = await window.evaluate(async () => window.api.flows.list()) as Array<{ id: string }>
    const flowId = flows[0].id

    // Add three create-task actions
    await window.locator('[data-testid="flow-add-create-task"]').click()
    await expect(window.locator('[data-testid="flow-action-0"]')).toBeVisible({ timeout: 4000 })
    await window.locator('[data-testid="flow-add-create-task"]').click()
    await expect(window.locator('[data-testid="flow-action-1"]')).toBeVisible({ timeout: 4000 })
    await window.locator('[data-testid="flow-add-create-task"]').click()
    await expect(window.locator('[data-testid="flow-action-2"]')).toBeVisible({ timeout: 4000 })

    // Set and commit each title by blurring to the flow-title input
    await window.locator('[data-testid="flow-action-0"] input').first().fill('ALPHA')
    await window.locator('[data-testid="flow-title"]').click()
    await window.waitForTimeout(300)

    await window.locator('[data-testid="flow-action-1"] input').first().fill('BRAVO')
    await window.locator('[data-testid="flow-title"]').click()
    await window.waitForTimeout(300)

    await window.locator('[data-testid="flow-action-2"] input').first().fill('CHARLIE')
    await window.locator('[data-testid="flow-title"]').click()
    await window.waitForTimeout(300)

    // Confirm all three committed
    const committed = await window.evaluate(
      async (id: string) => window.api.flows.get(id), flowId
    ) as { actions: Array<{ title?: string }> } | null
    expect(committed?.actions.map((a) => a.title)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE'])

    // Focus action 1's input and type BRAVO_EDITED without blurring
    const input1 = window.locator('[data-testid="flow-action-1"] input').first()
    await input1.click()
    await input1.fill('BRAVO_EDITED')
    // Do NOT blur — go straight to the Remove button.
    // onMouseDown preventDefault stops the blur event before remove fires.
    await window.locator('[data-testid="flow-action-1"] button[aria-label="Remove step"]').click()

    // Wait for the IPC round-trip to settle
    await window.waitForTimeout(800)

    // Verify exact result
    const afterDelete = await window.evaluate(
      async (id: string) => window.api.flows.get(id), flowId
    ) as { actions: Array<{ title?: string }> } | null

    const titles = afterDelete?.actions.map((a) => a.title)
    // Exact actions array observed (logged for the coordinator):
    console.log('OBSERVED actions after delete-while-editing:', JSON.stringify(titles))

    expect(titles).toEqual(['ALPHA', 'CHARLIE'])
  } finally {
    await dispose()
  }
})

// ---------------------------------------------------------------------------
// Sanity 1: normal blur-persist
// ---------------------------------------------------------------------------

test('sanity 1: edit action title, blur normally, edit persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openFlow(window)

    await window.locator('[data-testid="flow-new"]').click()
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 4000 })

    const flows = await window.evaluate(async () => window.api.flows.list()) as Array<{ id: string }>
    const flowId = flows[0].id

    await window.locator('[data-testid="flow-add-create-task"]').click()
    await expect(window.locator('[data-testid="flow-action-0"]')).toBeVisible({ timeout: 4000 })

    await window.locator('[data-testid="flow-action-0"] input').first().fill('BLUR_PERSIST_TITLE')
    // Explicit blur via clicking the flow title
    await window.locator('[data-testid="flow-title"]').click()
    await window.waitForTimeout(400)

    const flow = await window.evaluate(
      async (id: string) => window.api.flows.get(id), flowId
    ) as { actions: Array<{ title?: string }> } | null
    expect(flow?.actions[0]?.title).toBe('BLUR_PERSIST_TITLE')
  } finally {
    await dispose()
  }
})

// ---------------------------------------------------------------------------
// Sanity 2: switch flows without explicit blur — blur fires on click-away
// ---------------------------------------------------------------------------

test('sanity 2: switch to different flow without blur, edit persists via blur on navigate', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openFlow(window)

    // Create two flows
    await window.locator('[data-testid="flow-new"]').click()
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 4000 })
    await window.locator('[data-testid="flow-new"]').click()
    await window.waitForTimeout(300)

    const flows = await window.evaluate(async () => window.api.flows.list()) as Array<{ id: string }>
    expect(flows.length).toBe(2)
    const [flowA, flowB] = flows

    // Select flowA, add a create-task action
    await window.locator(`[data-testid="flow-card-${flowA.id}"]`).click()
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 4000 })
    await window.locator('[data-testid="flow-add-create-task"]').click()
    await expect(window.locator('[data-testid="flow-action-0"]')).toBeVisible({ timeout: 4000 })

    // Type into the action field — no explicit blur
    const actionInput = window.locator('[data-testid="flow-action-0"] input').first()
    await actionInput.fill('SWITCH_FLOW_EDIT')

    // Click flowB card — clicking it blurs the input first (browser default),
    // which triggers onBlur -> commit(). The onMouseDown-preventDefault is only
    // on the Remove button, not on flow cards.
    await window.locator(`[data-testid="flow-card-${flowB.id}"]`).click()
    await window.waitForTimeout(500)

    // Confirm flowA's action persisted
    const updatedA = await window.evaluate(
      async (id: string) => window.api.flows.get(id), flowA.id
    ) as { actions: Array<{ title?: string }> } | null
    expect(updatedA?.actions[0]?.title).toBe('SWITCH_FLOW_EDIT')
  } finally {
    await dispose()
  }
})

// ---------------------------------------------------------------------------
// Sanity 3: add-table-row select commits immediately on change
// ---------------------------------------------------------------------------

test('sanity 3: add-table-row select picks a table and tableId persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Seed a table so the select has an option
    const table = await window.evaluate(async () =>
      window.api.tables.create({ taskId: null, title: 'SelectTestTable' })
    ) as { id: string; title: string }

    await openFlow(window)

    await window.locator('[data-testid="flow-new"]').click()
    await expect(window.locator('[data-testid="flow-title"]')).toBeVisible({ timeout: 4000 })

    const flows = await window.evaluate(async () => window.api.flows.list()) as Array<{ id: string }>
    const flowId = flows[0].id

    // Add an add-table-row action
    await window.locator('[data-testid="flow-add-add-table-row"]').click()
    await expect(window.locator('[data-testid="flow-action-0"]')).toBeVisible({ timeout: 4000 })

    // Pick the seeded table from the select (commits immediately on change)
    const select = window.locator('[data-testid="flow-action-0"] select')
    await select.selectOption({ label: 'SelectTestTable' })
    await window.waitForTimeout(400)

    // Confirm tableId persisted
    const flow = await window.evaluate(
      async (id: string) => window.api.flows.get(id), flowId
    ) as { actions: Array<{ type: string; tableId?: string }> } | null
    expect(flow?.actions[0]?.type).toBe('add-table-row')
    expect(flow?.actions[0]?.tableId).toBe(table.id)
  } finally {
    await dispose()
  }
})
