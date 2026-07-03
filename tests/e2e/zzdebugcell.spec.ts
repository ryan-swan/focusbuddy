import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('debug range select', async () => {
  const { window, dispose } = await launchApp()
  await waitForReady(window)
  const seed = await window.evaluate(async () => {
    const api = (window as any).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'DebugTable' })
    const table = await api.tables.create({
      title: 'DT',
      schema: { columns: [
        { id: 'c-name', type: 'text-short', label: 'Name', config: {} },
        { id: 'c-status', type: 'single-select', label: 'Status', config: { options: [{id:'o1',label:'Todo',color:'#f59e0b'}] } }
      ]}
    })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Alpha' } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Beta' } })
    const widget = await api.widgets.create({ taskId: task.id, kind: 'table', title: 'DT', content: table.id, x: 100, y:100, width:640, height:420 })
    return { taskId: task.id, widgetId: widget.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /DebugTable/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForSelector(`[data-widget-id="${seed.widgetId}"] [data-testid="table-cell-0-0"]`)

  const c00 = window.locator(`[data-widget-id="${seed.widgetId}"] [data-testid="table-cell-0-0"]`)
  const c10 = window.locator(`[data-widget-id="${seed.widgetId}"] [data-testid="table-cell-1-0"]`)
  console.log('c00 text', await c00.innerText())
  console.log('c10 text', await c10.innerText())
  const b00 = await c00.boundingBox()
  const b10 = await c10.boundingBox()
  console.log('c00 box', b00)
  console.log('c10 box', b10)

  await c00.click()
  await window.keyboard.down('Shift')
  // click via mouse directly at center of c10's box, bypass locator actionability re-check
  const box = (await c10.boundingBox())!
  await window.mouse.click(box.x + box.width/2, box.y + box.height/2)
  await window.keyboard.up('Shift')
  console.log('after manual shift mouse click, c00 class:', await c00.getAttribute('class'))
  console.log('after manual shift mouse click, c10 class:', await c10.getAttribute('class'))
  await dispose()
})
