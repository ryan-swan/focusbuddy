// Ad-hoc sweep spec (plexidesk-tester): REAL (not stubbed) office interop
// round trips, driven through the actual main-process conversion code
// (mammoth / @turbodocx/html-to-docx / exceljs / xlsx / pptxgenjs) with only
// the native save/open dialogs mocked to real temp files — same pattern as
// tests/e2e/mapExport.spec.ts and tests/e2e/mapImportVsdx.spec.ts.
import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'
import { readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let launched: LaunchedApp | null = null
const written: string[] = []
test.afterEach(async () => {
  for (const p of written) if (existsSync(p)) rmSync(p)
  written.length = 0
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('DOCX real round trip: export writes a real .docx, import reads real content back', async () => {
  launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)

  const path = join(tmpdir(), `plexi-sweep-doc-${process.pid}.docx`)
  written.push(path)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, path)

  const html = '<h1>Sweep Test Heading</h1><p>This paragraph proves a real docx round trip.</p>'
  const exportRes = await window.evaluate(async (h) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.office.exportDocx({ html: h, title: 'sweep-doc' })
  }, html)
  expect(exportRes.ok).toBe(true)
  expect(existsSync(path)).toBe(true)
  const buf = readFileSync(path)
  // .docx is a real zip (PK magic bytes) — proves html-to-docx actually ran, not a stub.
  expect(buf[0]).toBe(0x50)
  expect(buf[1]).toBe(0x4b)
  expect(buf.length).toBeGreaterThan(1000)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, path)
  const importRes = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.office.importDocx()
  })
  expect(importRes.ok).toBe(true)
  expect(importRes.html).toContain('Sweep Test Heading')
  expect(importRes.html).toContain('real docx round trip')
})

test('XLSX real round trip: export writes a real .xlsx, import reads real values + formula back', async () => {
  launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)

  const path = join(tmpdir(), `plexi-sweep-sheet-${process.pid}.xlsx`)
  written.push(path)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, path)

  const body = {
    version: 2,
    sheets: [
      {
        id: 'sh1',
        name: 'Sheet1',
        rows: [
          ['10', '20', '=SUM(A1:B1)'],
          ['Label', '', '']
        ]
      }
    ],
    activeSheet: 0
  }
  const exportRes = await window.evaluate(async (b) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.sheet.export({ body: b as never, format: 'xlsx', name: 'sweep-sheet' })
  }, body)
  expect(exportRes.ok).toBe(true)
  expect(existsSync(path)).toBe(true)
  const buf = readFileSync(path)
  expect(buf[0]).toBe(0x50)
  expect(buf[1]).toBe(0x4b)
  expect(buf.length).toBeGreaterThan(1000)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, path)
  const importRes = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.sheet.import()
  })
  expect(importRes.ok).toBe(true)
  const tab = importRes.body?.sheets?.[0]
  expect(tab?.rows?.[0]?.[0]).toBe('10')
  expect(tab?.rows?.[0]?.[1]).toBe('20')
  // The formula must survive as a live formula (or its computed value), not be dropped.
  const cell3 = tab?.rows?.[0]?.[2] ?? ''
  expect(cell3 === '30' || cell3 === '=SUM(A1:B1)' || cell3.includes('SUM')).toBe(true)
})

test('PPTX real round trip: export writes a real .pptx, import reads real slide text back', async () => {
  launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)

  const path = join(tmpdir(), `plexi-sweep-slides-${process.pid}.pptx`)
  written.push(path)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, path)

  const body = {
    schemaVersion: 2,
    theme: 'default',
    slides: [
      {
        id: 's1',
        schemaVersion: 2,
        layout: 'title-content',
        elements: [
          { id: 'e1', type: 'text', x: 40, y: 40, w: 600, h: 80, z: 1, styleRole: 'title', paragraphs: [{ runs: [{ text: 'Sweep Slide Title' }] }] },
          { id: 'e2', type: 'text', x: 40, y: 140, w: 600, h: 200, z: 2, styleRole: 'body', paragraphs: [{ runs: [{ text: 'Sweep bullet body text' }] }] }
        ]
      }
    ]
  }
  const exportRes = await window.evaluate(async (b) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.slides.export({ body: b as never, title: 'sweep-slides', format: 'pptx' })
  }, body)
  expect(exportRes.ok).toBe(true)
  expect(existsSync(path)).toBe(true)
  const buf = readFileSync(path)
  expect(buf[0]).toBe(0x50)
  expect(buf[1]).toBe(0x4b)
  expect(buf.length).toBeGreaterThan(1000)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, path)
  const importRes = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.slides.import()
  })
  expect(importRes.ok).toBe(true)
  const allText = JSON.stringify(importRes.body)
  expect(allText).toContain('Sweep Slide Title')
})

test('PlexiDesign PNG real export writes a real raster file (api.design.export)', async () => {
  launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)

  const path = join(tmpdir(), `plexi-sweep-design-${process.pid}.png`)
  written.push(path)

  await app.evaluate(async ({ dialog }, filePath) => {
    // @ts-expect-error test override
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, path)

  const design = {
    schemaVersion: 1,
    width: 400,
    height: 300,
    background: { type: 'solid', color: '#ffffff' },
    elements: [
      { id: 't1', type: 'text', x: 20, y: 20, w: 300, h: 60, z: 1, paragraphs: [{ runs: [{ text: 'Sweep design', fontSize: 32 }] }] }
    ]
  }
  const res = await window.evaluate(async (d) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.design.export({ design: d as never, title: 'sweep-design', format: 'png' })
  }, design)
  expect(res.ok).toBe(true)
  expect(existsSync(path)).toBe(true)
  const buf = readFileSync(path)
  expect(buf[0]).toBe(0x89)
  expect(buf[1]).toBe(0x50)
  expect(buf[2]).toBe(0x4e)
  expect(buf[3]).toBe(0x47)
})
