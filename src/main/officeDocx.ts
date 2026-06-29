// Office interop for the document editor: import a real .docx, export to .docx
// and PDF, and pick an image for insertion. All file dialogs and conversions
// run here in the main process. Conversions are best-effort and lossy by nature
// (Word's full feature set does not map onto a web editor), which the renderer
// communicates to the user; what we keep, we keep faithfully.

import { dialog, BrowserWindow } from 'electron'
import { basename, extname } from 'path'
import { readFile, writeFile } from 'fs/promises'
// mammoth and @turbodocx/html-to-docx are imported lazily inside the functions
// that use them. They are heavy and have packaging-sensitive transitive deps, so
// keeping them out of this module's load path means a missing dependency can only
// ever degrade docx import/export to an error, never crash app startup.

export interface OfficeImportResult {
  ok: boolean
  html?: string
  fileName?: string
  error?: string
}
export interface OfficeExportResult {
  ok: boolean
  path?: string
  error?: string
}
export interface OfficePickImageResult {
  ok: boolean
  dataUrl?: string
  error?: string
}

// The document's page setup, mirrored from the renderer's PageSetup. Margins are
// in inches; size and orientation drive the .docx/PDF page geometry so the export
// matches the on-screen sheet.
export interface PageSetupInput {
  size: 'letter' | 'a4'
  orientation: 'portrait' | 'landscape'
  margin: { top: number; right: number; bottom: number; left: number }
}

const DEFAULT_PAGE: PageSetupInput = { size: 'letter', orientation: 'portrait', margin: { top: 1, right: 1, bottom: 1, left: 1 } }

// Paper dimensions in twips (1 inch = 1440 twips), portrait orientation.
function paperTwips(size: 'letter' | 'a4'): { width: number; height: number } {
  return size === 'a4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 }
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// Open a .docx and convert it to HTML with mammoth. The renderer turns the HTML
// into editor JSON. Images come through as base64 data URIs.
export async function importDocx(): Promise<OfficeImportResult> {
  const win = focusedWindow()
  const res = await dialog.showOpenDialog(win!, {
    title: 'Import Word document',
    properties: ['openFile'],
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false }
  const path = res.filePaths[0]
  if (extname(path).toLowerCase() !== '.docx') {
    return { ok: false, error: 'Only .docx files can be imported (legacy .doc is not supported).' }
  }
  try {
    const mammoth = (await import('mammoth')).default
    const buffer = await readFile(path)
    const out = await mammoth.convertToHtml({ buffer })
    return { ok: true, html: out.value, fileName: basename(path) }
  } catch (e) {
    return { ok: false, error: `Could not read that document: ${(e as Error).message}` }
  }
}

// Save the editor's HTML as a .docx via html-to-docx, honouring the document's
// own page setup (size, orientation, per-side margins) so Word opens the file
// with the same pages the writer set on screen.
export async function exportDocx(input: { html: string; title: string; page?: PageSetupInput }): Promise<OfficeExportResult> {
  const win = focusedWindow()
  const safe = (input.title || 'document').replace(/[/\\?%*:|"<>]/g, '-')
  const res = await dialog.showSaveDialog(win!, {
    title: 'Export as Word document',
    defaultPath: `${safe}.docx`,
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }
  try {
    const HTMLtoDOCX = (await import('@turbodocx/html-to-docx')).default
    const page = input.page ?? DEFAULT_PAGE
    const inch = (n: number): number => Math.round(n * 1440)
    const paper = paperTwips(page.size)
    const landscape = page.orientation === 'landscape'
    // Give tables a visible default border so a Plexi table doesn't arrive in Word
    // as an invisible grid, and wrap the body with a base font so the document
    // reads like a real Word file rather than browser default.
    const styledHtml = `<style>table,th,td{border:1px solid #999;border-collapse:collapse;padding:4px}</style>${input.html}`
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safe}</title></head><body>${styledHtml}</body></html>`
    const fileBuffer = (await HTMLtoDOCX(fullHtml, undefined, {
      title: safe,
      font: 'Calibri',
      fontSize: 22, // half-points = 11pt
      orientation: page.orientation,
      pageSize: landscape ? { width: paper.height, height: paper.width } : paper,
      margins: {
        top: inch(page.margin.top),
        right: inch(page.margin.right),
        bottom: inch(page.margin.bottom),
        left: inch(page.margin.left)
      },
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true
    })) as Buffer | ArrayBuffer
    const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer as ArrayBuffer)
    await writeFile(res.filePath, buf)
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: `Could not export: ${(e as Error).message}` }
  }
}

// Render the editor's HTML to a PDF using an offscreen window and Chromium's
// print engine, so the PDF matches what the user sees.
export async function exportPdf(input: { html: string; title: string; page?: PageSetupInput }): Promise<OfficeExportResult> {
  const win = focusedWindow()
  const safe = (input.title || 'document').replace(/[/\\?%*:|"<>]/g, '-')
  const res = await dialog.showSaveDialog(win!, {
    title: 'Export as PDF',
    defaultPath: `${safe}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }

  const setup = input.page ?? DEFAULT_PAGE
  const landscape = setup.orientation === 'landscape'
  const sizeName = setup.size === 'a4' ? 'A4' : 'Letter'
  const m = setup.margin
  // A print stylesheet that gives the PDF the document's own page geometry and
  // reuses basic prose typography. Kept self-contained so it needs no app CSS.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { size: ${sizeName} ${setup.orientation}; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.5; color: #1c1917; }
    h1 { font-size: 22pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #999; padding: 4px 8px; }
    pre { background: #f5f5f4; padding: 10px; border-radius: 4px; white-space: pre-wrap; }
    img { max-width: 100%; }
    blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 12px; color: #555; }
  </style></head><body>${input.html}</body></html>`

  const offscreen = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await offscreen.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await offscreen.webContents.printToPDF({
      printBackground: true,
      pageSize: sizeName,
      landscape,
      margins: { marginType: 'custom', top: m.top, right: m.right, bottom: m.bottom, left: m.left }
    })
    await writeFile(res.filePath, pdf)
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: `Could not export PDF: ${(e as Error).message}` }
  } finally {
    offscreen.destroy()
  }
}

// Pick an image file and return it as a base64 data URL, which embeds cleanly in
// the document and survives .docx export.
export async function pickImage(): Promise<OfficePickImageResult> {
  const win = focusedWindow()
  const res = await dialog.showOpenDialog(win!, {
    title: 'Insert image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false }
  try {
    const path = res.filePaths[0]
    const buf = await readFile(path)
    const ext = extname(path).slice(1).toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
