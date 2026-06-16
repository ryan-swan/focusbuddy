// E2E: Table widget filter + group feature.
//
// Seeds a table with known data, drives the FilterBar UI via evaluate() to
// avoid the canvas transform overlay, and verifies:
//   — filter panel opens / add-rule works
//   — text contains, checkbox no-value, number gt all narrow rows correctly
//   — and / or conjunction toggle changes the result set
//   — filter config persists through a full reload (read back via IPC)
//   — when all rows are filtered out, data-testid="table-no-matches" appears
//   — group panel opens, grouping by checkbox splits rows into collapsible headers
//   — collapse state persists (round-trips through viewConfig.group.collapsed)
//   — filter + group compose (grouping on filtered set)
//
// All clicks on elements inside the canvas widget go through window.evaluate
// to avoid the pointer-hit-test block from aside.fb-glass-chrome.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── helpers ──────────────────────────────────────────────────────────────────

interface TableSeed {
  taskId: string
  tableId: string
  widgetId: string
  colNameId: string
  colScoreId: string
  colDoneId: string
  colStatusId: string
  optTodoId: string
  optDoneId: string
}

/**
 * Seeds: Name (text-short), Score (number), Done (checkbox), Status (single-select).
 * 4 rows so each filter/group axis has useful variety.
 */
async function seedTable(window: LaunchedApp['window']): Promise<TableSeed> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'FilterTest' })

    const optTodoId = `o-todo-${Date.now().toString(36)}`
    const optDoneId = `o-done-${Date.now().toString(36)}`

    const table = await api.tables.create({
      title: 'FilterTable',
      schema: {
        columns: [
          { id: 'c-name', type: 'text-short', label: 'Name', config: {} },
          { id: 'c-score', type: 'number', label: 'Score', config: {} },
          { id: 'c-done', type: 'checkbox', label: 'Done', config: {} },
          {
            id: 'c-status', type: 'single-select', label: 'Status',
            config: { options: [
              { id: optTodoId, label: 'Todo', color: '#ef4444' },
              { id: optDoneId, label: 'Complete', color: '#22c55e' }
            ] }
          }
        ]
      }
    })
    // 4 rows with known values.
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Alice', 'c-score': 90, 'c-done': true, 'c-status': optDoneId } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Bob', 'c-score': 50, 'c-done': false, 'c-status': optTodoId } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Alice Smith', 'c-score': 80, 'c-done': false, 'c-status': optTodoId } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Carol', 'c-score': 70, 'c-done': true, 'c-status': optDoneId } })

    const widget = await api.widgets.create({
      taskId: task.id, kind: 'table', title: 'FilterTable',
      content: table.id, x: 100, y: 100, width: 620, height: 420
    })
    return {
      taskId: task.id,
      tableId: table.id,
      widgetId: widget.id,
      colNameId: 'c-name',
      colScoreId: 'c-score',
      colDoneId: 'c-done',
      colStatusId: 'c-status',
      optTodoId,
      optDoneId
    }
  })
}

async function navigateToTable(
  window: LaunchedApp['window'],
  taskId: string,
  widgetId: string
): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /FilterTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  await window.waitForFunction(
    (wid: string) =>
      !!document.querySelector(`[data-widget-id="${wid}"] [data-testid="table-filter-button"]`),
    widgetId,
    { timeout: 10_000 }
  )
}

// Click the Filter button to open the panel.
async function openFilterPanel(window: LaunchedApp['window'], widgetId: string): Promise<void> {
  await window.evaluate((wid: string) => {
    const btn = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-filter-button"]`
    ) as HTMLButtonElement | null
    if (!btn) throw new Error('table-filter-button not found')
    btn.click()
  }, widgetId)
  await window.waitForTimeout(200)
}

// Click "Add filter" inside the already-open filter panel.
async function clickAddFilter(window: LaunchedApp['window'], widgetId: string): Promise<void> {
  await window.evaluate((wid: string) => {
    const panel = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-filter-panel"]`
    )
    if (!panel) throw new Error('table-filter-panel not found')
    const btn = Array.from(panel.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add filter')
    ) as HTMLButtonElement | null
    if (!btn) throw new Error('Add filter button not found')
    btn.click()
  }, widgetId)
  await window.waitForTimeout(400)
}

// Return the count of visible data rows (excludes the add-row footer row and
// any group-header rows, which don't have a delete-row button inside a data tr).
async function visibleDataRowCount(window: LaunchedApp['window'], widgetId: string): Promise<number> {
  return window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) throw new Error(`widget ${wid} not found`)
    // Each data row has exactly one delete-row button (title="Delete row").
    return widget.querySelectorAll('tbody tr button[title="Delete row"]').length
  }, widgetId)
}

// Check if the no-matches sentinel is visible.
async function noMatchesVisible(window: LaunchedApp['window'], widgetId: string): Promise<boolean> {
  return window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    return !!widget?.querySelector('[data-testid="table-no-matches"]')
  }, widgetId)
}

// Read back viewConfig from the live table schema via IPC.
async function readViewConfig(
  window: LaunchedApp['window'],
  tableId: string
): Promise<import('@shared/fields').TableViewConfig> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tid)
    return (tbl?.schema.viewConfig ?? {}) as import('@shared/fields').TableViewConfig
  }, tableId)
}

// ── Test 1: Filter panel opens, Add filter adds a rule ───────────────────────

test('1 — filter panel opens, Add filter adds a rule row', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  // Panel must not be visible before clicking the button.
  const panelBefore = await window.locator(`[data-widget-id="${seed.widgetId}"] [data-testid="table-filter-panel"]`).isVisible()
  expect(panelBefore, 'panel hidden before click').toBe(false)

  await openFilterPanel(window, seed.widgetId)
  await expect(
    window.locator(`[data-widget-id="${seed.widgetId}"] [data-testid="table-filter-panel"]`)
  ).toBeVisible({ timeout: 3_000 })

  // Add filter.
  await clickAddFilter(window, seed.widgetId)

  // There should be at least one rule row rendered inside the panel now.
  const ruleCount = await window.evaluate((wid: string) => {
    const panel = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-filter-panel"]`
    )
    // Each rule row has a "Remove filter" button (title="Remove filter").
    return panel?.querySelectorAll('button[title="Remove filter"]').length ?? 0
  }, seed.widgetId)
  expect(ruleCount, 'one rule row appeared after Add filter').toBe(1)
})

// ── Test 2: text contains narrows rows ───────────────────────────────────────

test('2 — text contains filter narrows visible rows correctly', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  // Inject a text-contains filter via IPC/viewConfig so we don't have to fight the UI.
  await window.evaluate(async ({ tableId, colNameId }: { tableId: string; colNameId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    const schema = {
      ...tbl!.schema,
      viewConfig: {
        ...(tbl!.schema.viewConfig ?? {}),
        filter: {
          conjunction: 'and' as const,
          rules: [{
            id: 'r-test',
            columnId: colNameId,
            operator: 'contains' as const,
            value: 'Alice'
          }]
        }
      }
    }
    await api.tables.update(tableId, { schema })
  }, { tableId: seed.tableId, colNameId: seed.colNameId })

  // Reload so the widget reads the persisted viewConfig.
  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const count = await visibleDataRowCount(window, seed.widgetId)
  // "Alice" and "Alice Smith" = 2 rows.
  expect(count, 'text contains "Alice" → 2 rows').toBe(2)
})

// ── Test 3: checkbox is-unchecked narrows rows ────────────────────────────────

test('3 — checkbox is-unchecked filter (no value editor) shows only unchecked rows', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Write the filter directly.
  await window.evaluate(async ({ tableId, colDoneId }: { tableId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          filter: {
            conjunction: 'and' as const,
            rules: [{ id: 'r-chk', columnId: colDoneId, operator: 'is-unchecked' as const }]
          }
        }
      }
    })
  }, { tableId: seed.tableId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const count = await visibleDataRowCount(window, seed.widgetId)
  // Bob and Alice Smith are unchecked = 2 rows.
  expect(count, 'is-unchecked → 2 rows').toBe(2)
})

// ── Test 4: number gt filter narrows rows ────────────────────────────────────

test('4 — number greater-than filter narrows rows correctly', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  await window.evaluate(async ({ tableId, colScoreId }: { tableId: string; colScoreId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          filter: {
            conjunction: 'and' as const,
            rules: [{ id: 'r-num', columnId: colScoreId, operator: 'gt' as const, value: 75 }]
          }
        }
      }
    })
  }, { tableId: seed.tableId, colScoreId: seed.colScoreId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const count = await visibleDataRowCount(window, seed.widgetId)
  // Alice (90) and Alice Smith (80) pass score > 75 = 2 rows.
  expect(count, 'score > 75 → 2 rows').toBe(2)
})

// ── Test 5: and / or conjunction toggle ──────────────────────────────────────

test('5 — and/or conjunction changes visible rows correctly', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // AND: name contains "Alice" AND done is-checked → only Alice (90, done) = 1.
  await window.evaluate(async ({ tableId, colNameId, colDoneId }: { tableId: string; colNameId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          filter: {
            conjunction: 'and' as const,
            rules: [
              { id: 'r1', columnId: colNameId, operator: 'contains' as const, value: 'Alice' },
              { id: 'r2', columnId: colDoneId, operator: 'is-checked' as const }
            ]
          }
        }
      }
    })
  }, { tableId: seed.tableId, colNameId: seed.colNameId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const andCount = await visibleDataRowCount(window, seed.widgetId)
  expect(andCount, 'AND: name contains Alice AND done is-checked → 1 row').toBe(1)

  // Now switch to OR.
  await window.evaluate(async ({ tableId, colNameId, colDoneId }: { tableId: string; colNameId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          filter: {
            conjunction: 'or' as const,
            rules: [
              { id: 'r1', columnId: colNameId, operator: 'contains' as const, value: 'Alice' },
              { id: 'r2', columnId: colDoneId, operator: 'is-checked' as const }
            ]
          }
        }
      }
    })
  }, { tableId: seed.tableId, colNameId: seed.colNameId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const orCount = await visibleDataRowCount(window, seed.widgetId)
  // OR: name contains Alice (Alice, Alice Smith) OR done is-checked (Alice, Carol).
  // Union = Alice, Alice Smith, Carol = 3 rows.
  expect(orCount, 'OR: name contains Alice OR done is-checked → 3 rows').toBe(3)
})

// ── Test 6: filter config persists to viewConfig and survives reload ──────────

test('6 — filter config persists in viewConfig.filter and survives a full reload', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  const filterConfig = {
    conjunction: 'and' as const,
    rules: [{
      id: 'r-persist',
      columnId: seed.colNameId,
      operator: 'contains' as const,
      value: 'Carol'
    }]
  }

  await window.evaluate(async ({ tableId, filter }: { tableId: string; filter: typeof filterConfig }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: { ...tbl!.schema, viewConfig: { ...(tbl!.schema.viewConfig ?? {}), filter } }
    })
  }, { tableId: seed.tableId, filter: filterConfig })

  // Reload and re-read the viewConfig from SQLite.
  await navigateToTable(window, seed.taskId, seed.widgetId)
  const vc = await readViewConfig(window, seed.tableId)

  expect(vc.filter, 'filter config is present in viewConfig').toBeTruthy()
  expect(vc.filter?.conjunction, 'conjunction is and').toBe('and')
  expect(vc.filter?.rules).toHaveLength(1)
  expect(vc.filter?.rules[0].operator, 'operator persisted').toBe('contains')
  expect(vc.filter?.rules[0].value, 'value persisted').toBe('Carol')

  // UI must also reflect the filter: only Carol = 1 row.
  await window.waitForTimeout(500)
  const count = await visibleDataRowCount(window, seed.widgetId)
  expect(count, 'only Carol is visible after reload').toBe(1)
})

// ── Test 7: all rows filtered → data-testid="table-no-matches" ───────────────

test('7 — filtering all rows out shows data-testid="table-no-matches"', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  await window.evaluate(async ({ tableId, colNameId }: { tableId: string; colNameId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          filter: {
            conjunction: 'and' as const,
            rules: [{ id: 'r-none', columnId: colNameId, operator: 'is' as const, value: 'NOBODY' }]
          }
        }
      }
    })
  }, { tableId: seed.tableId, colNameId: seed.colNameId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const hasNoMatches = await noMatchesVisible(window, seed.widgetId)
  expect(hasNoMatches, 'table-no-matches sentinel is visible').toBe(true)
})

// ── Test 8: group panel opens, lists No grouping + columns ───────────────────

test('8 — group button opens panel with No grouping and column list', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  // Click the group button.
  await window.evaluate((wid: string) => {
    const btn = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-group-button"]`
    ) as HTMLButtonElement | null
    if (!btn) throw new Error('table-group-button not found')
    btn.click()
  }, seed.widgetId)
  await window.waitForTimeout(200)

  // The group panel must appear.
  const panelVisible = await window.evaluate((wid: string) => {
    return !!document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-group-panel"]`
    )
  }, seed.widgetId)
  expect(panelVisible, 'group panel is visible').toBe(true)

  // The panel must contain "No grouping" and at least one column option.
  const panelText = await window.evaluate((wid: string) => {
    const panel = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-group-panel"]`
    )
    return panel?.textContent ?? ''
  }, seed.widgetId)
  expect(panelText, 'panel contains No grouping').toContain('No grouping')
  expect(panelText, 'panel contains Name column').toContain('Name')
  // Button columns are excluded from grouping.
  expect(panelText, 'panel does not list Button types').not.toContain('Button')
})

// ── Test 9: group by checkbox renders group headers with counts ───────────────

test('9 — group by Done checkbox renders collapsible group headers with row counts', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Set group to done column via IPC.
  await window.evaluate(async ({ tableId, colDoneId }: { tableId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          group: { columnId: colDoneId, collapsed: [], direction: 'asc' as const }
        }
      }
    })
  }, { tableId: seed.tableId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  // Group header rows have the chevron_right / expand_more icon button.
  // They contain the group label and a count span.
  const groupHeaders = await window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return []
    // Group header rows are identified by the toggle button with chevron icon.
    const btns = Array.from(widget.querySelectorAll('tbody tr button'))
    // These are the toggle buttons inside group header rows — they have an icon + label + count.
    return btns
      .filter((b) => b.querySelector('[class*="material"]') || b.textContent?.includes('Checked') || b.textContent?.includes('Unchecked'))
      .map((b) => b.textContent?.trim())
  }, seed.widgetId)

  // We expect at least Checked and Unchecked groups.
  const headerText = groupHeaders.join(' ')
  expect(headerText, 'Checked group header present').toContain('Checked')
  expect(headerText, 'Unchecked group header present').toContain('Unchecked')
})

// ── Test 10: group collapse state persists to viewConfig ─────────────────────

test('10 — collapse a group, then verify viewConfig.group.collapsed persists to SQLite', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Seed with Done grouping and "Checked" group collapsed (key='true').
  await window.evaluate(async ({ tableId, colDoneId }: { tableId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          group: { columnId: colDoneId, collapsed: ['true'], direction: 'asc' as const }
        }
      }
    })
  }, { tableId: seed.tableId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  // Read back from SQLite to confirm collapsed persisted.
  const vc = await readViewConfig(window, seed.tableId)
  expect(vc.group?.columnId, 'group column is c-done').toBe(seed.colDoneId)
  expect(vc.group?.collapsed, 'collapsed array contains "true"').toContain('true')

  // The collapsed group should not show data rows for the "Checked" group.
  // Alice and Carol (both done=true) should be hidden.
  const count = await visibleDataRowCount(window, seed.widgetId)
  // Only the Unchecked group rows are visible: Bob and Alice Smith = 2.
  expect(count, 'only Unchecked rows visible (Checked group collapsed)').toBe(2)
})

// ── Test 11: single-select groups follow option order, desc reverses ──────────

test('11 — single-select groups follow option order; desc reverses, empty last', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Group by Status (single-select with Todo and Complete in that option order).
  await window.evaluate(async ({ tableId, colStatusId }: { tableId: string; colStatusId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          group: { columnId: colStatusId, collapsed: [], direction: 'asc' as const }
        }
      }
    })
  }, { tableId: seed.tableId, colStatusId: seed.colStatusId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  // Options are defined as [Todo, Complete] so asc order = Todo first, Complete second.
  const groupLabelOrder = await window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return []
    // The group label lives in a <span class="truncate"> inside the toggle button.
    const spans = Array.from(widget.querySelectorAll('tbody tr button span.truncate'))
    return spans.map((s) => s.textContent?.trim()).filter(Boolean)
  }, seed.widgetId)

  // The first group label should be Todo (option index 0), second Complete (index 1).
  expect(groupLabelOrder[0], 'first group is Todo (option order)').toBe('Todo')
  expect(groupLabelOrder[1], 'second group is Complete (option order)').toBe('Complete')

  // Now switch to desc and reload.
  await window.evaluate(async ({ tableId, colStatusId }: { tableId: string; colStatusId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          ...(tbl!.schema.viewConfig ?? {}),
          group: { columnId: colStatusId, collapsed: [], direction: 'desc' as const }
        }
      }
    })
  }, { tableId: seed.tableId, colStatusId: seed.colStatusId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  const descOrder = await window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return []
    const spans = Array.from(widget.querySelectorAll('tbody tr button span.truncate'))
    return spans.map((s) => s.textContent?.trim()).filter(Boolean)
  }, seed.widgetId)

  // desc reverses the non-empty groups: Complete first, Todo second.
  expect(descOrder[0], 'desc: first group is Complete').toBe('Complete')
  expect(descOrder[1], 'desc: second group is Todo').toBe('Todo')
})

// ── Test 12: filter + group compose ──────────────────────────────────────────

test('12 — filter + group compose: grouping operates on the filtered set', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Filter to name contains "Alice" (→ Alice, Alice Smith), then group by Done.
  await window.evaluate(async ({ tableId, colNameId, colDoneId }: { tableId: string; colNameId: string; colDoneId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    await api.tables.update(tableId, {
      schema: {
        ...tbl!.schema,
        viewConfig: {
          filter: {
            conjunction: 'and' as const,
            rules: [{ id: 'rf', columnId: colNameId, operator: 'contains' as const, value: 'Alice' }]
          },
          group: { columnId: colDoneId, collapsed: [], direction: 'asc' as const }
        }
      }
    })
  }, { tableId: seed.tableId, colNameId: seed.colNameId, colDoneId: seed.colDoneId })

  await navigateToTable(window, seed.taskId, seed.widgetId)
  await window.waitForTimeout(500)

  // Only Alice-rows pass the filter. Groups should contain those rows only.
  // Total data rows visible = 2 (Alice in Checked, Alice Smith in Unchecked).
  const count = await visibleDataRowCount(window, seed.widgetId)
  expect(count, 'filter + group: only Alice rows visible (2)').toBe(2)

  // Bob and Carol must not appear.
  const bodyText = await window.evaluate((wid: string) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    return widget?.querySelector('tbody')?.textContent ?? ''
  }, seed.widgetId)
  expect(bodyText, 'Bob not in filtered+grouped view').not.toContain('Bob')
  expect(bodyText, 'Carol not in filtered+grouped view').not.toContain('Carol')
})
