import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('debug col width', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await window.evaluate(() => {
      const w = window as any
      w.__fbView?.getState().goDocuments()
    })
    await window.waitForTimeout(500)
    const blankRow = window.locator('text=Or start blank:').locator('..')
    await blankRow.locator('button', { hasText: 'Spreadsheet' }).first().click()
    await window.locator('input[placeholder*="Select a cell"]').waitFor({ timeout: 8000 })
    await window.waitForTimeout(500)
    const info = await window.evaluate(() => {
      const table = document.querySelector('[data-testid="sheet-grid"] table') as HTMLTableElement
      const cols = Array.from(table.querySelectorAll('colgroup col')).map((c) => (c as HTMLElement).style.width)
      const th0 = document.querySelector('[data-testid="col-header-0"]') as HTMLElement
      const rect = th0.getBoundingClientRect()
      const dpr = window.devicePixelRatio
      const bodyZoom = getComputedStyle(document.body).zoom
      const htmlFont = getComputedStyle(document.documentElement).fontSize
      return { cols, th0width: rect.width, dpr, bodyZoom, htmlFont, tableWidth: table.getBoundingClientRect().width }
    })
    console.log('DEBUG', JSON.stringify(info, null, 2))
  } finally {
    await dispose()
  }
})
