import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Living Doc widget — a read-only AI-maintained document keyed on a
// user-supplied brief stored as widget.livingQuery.
//
// The real regenerate IPC makes a live Anthropic call that needs an API key.
// We mock it in the MAIN process (app.evaluate + ipcMain.removeHandler +
// ipcMain.handle) so the full render path executes deterministically.
// The mock returns a two-block Tiptap doc that we assert on in the body.
//
// Tests:
//  1. Fresh widget renders the SETUP state (no brief yet).
//  2. Typing a brief and clicking Start sets livingQuery and renders the body.
//  3. Header controls (brief display, pause toggle, regenerate) work.
//  4. The inline input proves window.prompt is NOT involved.
//  5. The body editor is read-only (editable=false on the Tiptap instance).
//  6. typecheck + unit suite stay green (asserted by the CI harness; the spec
//     itself only exercises the E2E layer).

const MOCK_DOC = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Desk summary' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Two notes and a table on this desk.' }]
    }
  ]
})

const MOCK_RESPONSE = {
  ok: true as const,
  content: MOCK_DOC,
  generatedAt: Date.now()
}

// Install the mock in the MAIN process. Uses the same ipcMain.removeHandler
// + ipcMain.handle pattern as markdownWidget.spec.ts and updaterBanner.spec.ts.
// Also initialises a call counter in globalThis so we can assert it.
async function installRegenerateMock(l: LaunchedApp): Promise<void> {
  await l.app.evaluate(({ ipcMain }, mockResponse) => {
    interface G {
      __fb_living_regen_calls: number
    }
    const g = globalThis as unknown as G
    g.__fb_living_regen_calls = 0
    ipcMain.removeHandler('livingPage:regenerate')
    ipcMain.handle('livingPage:regenerate', (_e, _widgetId: string) => {
      g.__fb_living_regen_calls++
      return mockResponse
    })
  }, MOCK_RESPONSE)
}

async function regenCallCount(l: LaunchedApp): Promise<number> {
  return l.app.evaluate(() => {
    interface G {
      __fb_living_regen_calls: number
    }
    return ((globalThis as unknown as G).__fb_living_regen_calls) ?? 0
  })
}

// Seed: create a task with a single living-doc widget. Returns taskId and
// widgetId. livingQuery starts null (no brief yet — renders SETUP).
//
// NOTE: createWidget's INSERT does not include the living_query column, so
// passing livingQuery at creation time has no effect. When an initialLivingQuery
// is supplied we do a follow-up update() call to set it correctly.
async function seedLivingDoc(
  window: LaunchedApp['window'],
  initialLivingQuery?: string
): Promise<{ taskId: string; widgetId: string }> {
  return window.evaluate(async (q: string | undefined) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Living Doc task' })
    const widget = await api.widgets.create({
      taskId: task.id,
      kind: 'living-doc',
      title: 'Living Doc',
      content: '',
      x: 200,
      y: 200,
      width: 500,
      height: 400
    })
    if (q !== undefined) {
      await api.widgets.update(widget.id, { livingQuery: q })
    }
    return { taskId: task.id, widgetId: widget.id }
  }, initialLivingQuery)
}

// Collapse the assistant panel so it doesn't intercept pointer events on the
// right side of the canvas. Same helper used in deskAgents.spec.ts.
async function hideAssistant(window: LaunchedApp['window']): Promise<void> {
  const btn = window.getByRole('button', { name: 'Hide assistant panel' })
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await window.waitForTimeout(150)
}

// Navigate to the task canvas and wait for the widget to mount.
async function openTask(
  window: LaunchedApp['window'],
  widgetId: string
): Promise<void> {
  await window.getByRole('button', { name: /Living Doc task/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)
  await window.waitForSelector(`[data-widget-id="${widgetId}"]`, { timeout: 5_000 })
}

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── Test 1: SETUP state ───────────────────────────────────────────────────────

test('1 — fresh living-doc widget renders the SETUP state with an inline brief input', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { widgetId } = await seedLivingDoc(window)

  await window.reload()
  await waitForReady(window)
  await openTask(window, widgetId)

  // Must show the inline input and the Start button — NOT a native dialog.
  await expect(window.locator('[data-testid="livingdoc-brief-input"]')).toBeVisible()
  await expect(window.locator('[data-testid="livingdoc-start"]')).toBeVisible()

  // The body-only controls must not be present yet.
  await expect(window.locator('[data-testid="livingdoc-brief"]')).not.toBeVisible()
  await expect(window.locator('[data-testid="livingdoc-pause"]')).not.toBeVisible()
  await expect(window.locator('[data-testid="livingdoc-regenerate"]')).not.toBeVisible()
  await expect(window.locator('[data-testid="livingdoc-body"]')).not.toBeVisible()
})

// ── Test 2: Start flow — brief + mock regenerate ──────────────────────────────

test('2 — typing a brief and clicking Start sets livingQuery and renders mocked body', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, widgetId } = await seedLivingDoc(window)

  await window.reload()
  await waitForReady(window)

  // Install the mock BEFORE we trigger the regenerate call.
  await installRegenerateMock(launched)

  await openTask(window, widgetId)

  const briefInput = window.locator('[data-testid="livingdoc-brief-input"]')
  await briefInput.click()
  await briefInput.fill('summary of this desk')

  await window.locator('[data-testid="livingdoc-start"]').click()

  // Poll until livingQuery is persisted to the store/DB.
  await expect
    .poll(
      async () => {
        const widgets = await window.evaluate(async (tid: string) => {
          const api = (window as unknown as { api: typeof window.api }).api
          return api.widgets.listByTask(tid)
        }, taskId)
        return (widgets as Array<{ id: string; livingQuery: string | null }>).find(
          (w) => w.id === widgetId
        )?.livingQuery
      },
      { timeout: 8_000, intervals: [300, 500, 800] }
    )
    .toBe('summary of this desk')

  // The mock regenerate must have been called at least once. Poll because the
  // component fires it on a 50ms setTimeout after the store update resolves,
  // so the call may arrive just after livingQuery is visible in the DB.
  await expect
    .poll(() => regenCallCount(launched!), { timeout: 5_000, intervals: [200, 400, 600] })
    .toBeGreaterThanOrEqual(1)

  // The body must now render the mocked content.
  const body = window.locator('[data-testid="livingdoc-body"]')
  await expect(body).toBeVisible({ timeout: 6_000 })
  await expect(body).toContainText('Desk summary', { timeout: 6_000 })
  await expect(body).toContainText('Two notes and a table on this desk.', { timeout: 6_000 })
})

// ── Test 3: Header controls ───────────────────────────────────────────────────

test('3 — header controls render when living; pause toggle and regenerate button work', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed with an existing brief so the widget boots straight into the living state.
  const { taskId, widgetId } = await seedLivingDoc(window, 'summary of this desk')

  await window.reload()
  await waitForReady(window)
  await installRegenerateMock(launched)
  await openTask(window, widgetId)

  // Give the editor time to render the header (content may be empty initially —
  // that's fine; we just need the header controls to be present).
  await expect(window.locator('[data-testid="livingdoc-brief"]')).toBeVisible({ timeout: 5_000 })
  await expect(window.locator('[data-testid="livingdoc-brief"]')).toContainText('summary of this desk')
  await expect(window.locator('[data-testid="livingdoc-pause"]')).toBeVisible()
  await expect(window.locator('[data-testid="livingdoc-regenerate"]')).toBeVisible()

  // Pause toggle: click once and assert livingPaused flips to true.
  await window.locator('[data-testid="livingdoc-pause"]').click()
  await expect
    .poll(
      async () => {
        const widgets = await window.evaluate(async (tid: string) => {
          const api = (window as unknown as { api: typeof window.api }).api
          return api.widgets.listByTask(tid)
        }, taskId)
        return (widgets as Array<{ id: string; livingPaused: boolean }>).find(
          (w) => w.id === widgetId
        )?.livingPaused
      },
      { timeout: 5_000, intervals: [200, 400, 600] }
    )
    .toBe(true)

  // Regenerate button: click and assert the mock IPC fires again.
  const countBefore = await regenCallCount(launched)
  await window.locator('[data-testid="livingdoc-regenerate"]').click()
  await expect
    .poll(() => regenCallCount(launched!), { timeout: 5_000, intervals: [200, 400, 600] })
    .toBeGreaterThan(countBefore)
})

// ── Test 4: No window.prompt ──────────────────────────────────────────────────

test('4 — the setup flow uses an inline input, not window.prompt (headless Electron proof)', async () => {
  // window.prompt returns null in Electron. If the component relied on
  // window.prompt the brief would never be set and Test 2 could not possibly
  // succeed (livingQuery would remain null). This test reinforces that by
  // verifying the inline input path works end-to-end in a headless environment
  // where native dialogs are not available.

  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Verify window.prompt is unavailable in this Electron environment. In
  // practice Electron throws "prompt() is not supported." rather than returning
  // null; either way the result is that native dialogs cannot gather user input.
  const promptResult = await window.evaluate(() => {
    try {
      // Attempt to call prompt — Electron throws synchronously.
      return window.prompt('test')
    } catch {
      // Thrown = definitely not a usable dialog; treat the same as null.
      return null
    }
  })
  // Whether null or caught-exception, the result confirms no native dialog.
  expect(promptResult).toBeNull()

  // Now confirm the inline path works regardless.
  const { taskId, widgetId } = await seedLivingDoc(window)
  await window.reload()
  await waitForReady(window)
  await installRegenerateMock(launched)
  await openTask(window, widgetId)

  await window.locator('[data-testid="livingdoc-brief-input"]').fill('prompt-less brief')
  await window.locator('[data-testid="livingdoc-start"]').click()

  await expect
    .poll(
      async () => {
        const widgets = await window.evaluate(async (tid: string) => {
          const api = (window as unknown as { api: typeof window.api }).api
          return api.widgets.listByTask(tid)
        }, taskId)
        return (widgets as Array<{ id: string; livingQuery: string | null }>).find(
          (w) => w.id === widgetId
        )?.livingQuery
      },
      { timeout: 8_000, intervals: [300, 500, 800] }
    )
    .toBe('prompt-less brief')
})

// ── Test 5: Body is read-only ─────────────────────────────────────────────────

test('5 — the body editor is read-only; typing does not change widget.content', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, widgetId } = await seedLivingDoc(window, 'summary of this desk')

  await window.reload()
  await waitForReady(window)
  await installRegenerateMock(launched)
  await openTask(window, widgetId)

  // Trigger a regenerate so the body has content to render.
  await window.locator('[data-testid="livingdoc-regenerate"]').click()
  await expect(window.locator('[data-testid="livingdoc-body"]')).toContainText('Desk summary', {
    timeout: 6_000
  })

  // Record the content before attempting to type.
  const contentBefore = await window.evaluate(
    async ({ tid, wid }: { tid: string; wid: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(tid)
      return (ws as Array<{ id: string; content: string }>).find((w) => w.id === wid)?.content
    },
    { tid: taskId, wid: widgetId }
  )

  // Try typing inside the body element.
  const body = window.locator('[data-testid="livingdoc-body"]')
  await body.click()
  await window.keyboard.type('SHOULD NOT APPEAR')
  await window.waitForTimeout(600)

  // Content must be unchanged — the editor is editable=false.
  const contentAfter = await window.evaluate(
    async ({ tid, wid }: { tid: string; wid: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(tid)
      return (ws as Array<{ id: string; content: string }>).find((w) => w.id === wid)?.content
    },
    { tid: taskId, wid: widgetId }
  )

  expect(contentAfter).toBe(contentBefore)

  // The body text must not contain our injected string.
  await expect(body).not.toContainText('SHOULD NOT APPEAR')
})
