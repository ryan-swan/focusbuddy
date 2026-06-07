import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Format-aware delivery: when an agent/wire feeds a linked widget, the data is
// shaped for that widget kind — a card gets title/body, a page gets a real
// document, and a table is built via its AI (never overwritten with raw text).

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

async function widgetContent(
  window: LaunchedApp['window'],
  taskId: string,
  id: string
): Promise<string | undefined> {
  return window.evaluate(
    async ({ taskId, id }: { taskId: string; id: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(taskId)
      return ws.find((w) => w.id === id)?.content
    },
    { taskId, id }
  )
}

async function openAndTrigger(window: LaunchedApp['window'], taskTitle: RegExp): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: taskTitle }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)
  // Touch the agent so its content change fires its outgoing wire.
  await window.locator('[data-testid="agent-instruction"]').fill('go now')
}

const AGENT = (lastOutput: string): string =>
  JSON.stringify({ instruction: 'summarize', trigger: 'manual', enabled: true, lastOutput })

test('an agent feeds a card as title + body', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async (content: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Fmt card' })
    const card = await api.widgets.create({
      taskId: task.id, kind: 'card', title: 'out',
      content: JSON.stringify({ title: '', body: '', accent: '#10b981' }),
      x: 480, y: 200, width: 280, height: 200
    })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent', content,
      x: 120, y: 200, width: 340, height: 320
    })
    await api.widgetLinks.create(agent.id, card.id, task.id)
    return { taskId: task.id, cardId: card.id }
  }, AGENT('Project plan\nShip the MVP this week.'))

  await openAndTrigger(window, /Fmt card/)
  await expect
    .poll(async () => {
      const c = await widgetContent(window, ids.taskId, ids.cardId)
      try {
        return JSON.parse(c || '{}') as { title?: string; body?: string; accent?: string }
      } catch {
        return {}
      }
    }, { timeout: 8_000, intervals: [400, 700] })
    .toMatchObject({ title: 'Project plan', accent: '#10b981' })
  const card = JSON.parse((await widgetContent(window, ids.taskId, ids.cardId)) || '{}')
  expect(card.body).toContain('Ship the MVP')
})

test('an agent feeds a page as a real document', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async (content: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Fmt page' })
    const page = await api.widgets.create({
      taskId: task.id, kind: 'page', title: 'Doc', content: '',
      x: 480, y: 200, width: 360, height: 300
    })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent', content,
      x: 120, y: 200, width: 340, height: 320
    })
    await api.widgetLinks.create(agent.id, page.id, task.id)
    return { taskId: task.id, pageId: page.id }
  }, AGENT('# Heading\nSome body text\n- item one'))

  await openAndTrigger(window, /Fmt page/)
  await expect
    .poll(async () => widgetContent(window, ids.taskId, ids.pageId), { timeout: 8_000, intervals: [400, 700] })
    .toContain('"type":"doc"')
  const doc = JSON.parse((await widgetContent(window, ids.taskId, ids.pageId)) || '{}')
  const flat = JSON.stringify(doc)
  expect(flat).toContain('Heading')
  expect(flat).toContain('Some body text')
  expect(flat).toContain('item one')
})

test('an agent feeding a table never overwrites the table id with text', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async (content: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Fmt table' })
    const tbl = await api.tables.create({
      taskId: task.id, title: 'Tasks',
      schema: { columns: [{ id: 'c_name', label: 'Name', type: 'text-short', config: {} }] }
    } as never)
    const table = await api.widgets.create({
      taskId: task.id, kind: 'table', title: 'Tasks', content: tbl.id,
      x: 480, y: 200, width: 420, height: 280
    })
    const agent = await api.widgets.create({
      taskId: task.id, kind: 'agent', title: 'Agent', content,
      x: 120, y: 200, width: 340, height: 320
    })
    await api.widgetLinks.create(agent.id, table.id, task.id)
    return { taskId: task.id, tableId: tbl.id, tableWidgetId: table.id }
  }, AGENT('Buy milk\nEmail Dana\nShip the build'))

  await openAndTrigger(window, /Fmt table/)
  await window.waitForTimeout(2500) // let the (no-key) build attempt run + settle

  // The widget's content is STILL the backing table id — not the agent's text.
  const content = await widgetContent(window, ids.taskId, ids.tableWidgetId)
  expect(content).toBe(ids.tableId)
  const stillReal = await window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return !!(await api.tables.get(tid))
  }, ids.tableId)
  expect(stillReal).toBe(true)
})
