// Slides Office interop. Export to native .pptx via pptxgenjs (elements map to
// pptx text/shape/image/line), export to PDF by rendering each slide to an
// offscreen page and printing, and a best-effort .pptx import that extracts text
// (PowerPoint's full feature set does not round-trip; this is honest about that).

import { dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { readFile, writeFile } from 'fs/promises'
// pptxgenjs and fflate are imported lazily inside the functions that use them,
// so they stay out of the app's startup require path; a packaging gap can only
// degrade pptx export/import to an error, never crash launch.
import type { DeckTheme, Slide, SlidesBody, SlideTextElement } from '@shared/types'
import { resolveTheme, SLIDE_W, SLIDE_H } from '@shared/slideThemes'
import { migrateSlidesBody } from '@shared/slidesMigrate'

export interface SlidesExportResult {
  ok: boolean
  path?: string
  error?: string
}
export interface SlidesImportResult {
  ok: boolean
  body?: SlidesBody
  name?: string
  error?: string
}

function win(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}
const hex = (c: string | undefined, fallback = '000000'): string => (c ? c.replace('#', '') : fallback)
const IN_W = 13.333
const IN_H = 7.5
const px2inX = (px: number): number => (px / SLIDE_W) * IN_W
const px2inY = (px: number): number => (px / SLIDE_H) * IN_H
const px2pt = (px: number): number => px * 0.75

// ── PPTX export ───────────────────────────────────────────────────────────────
export async function exportPptx(body: SlidesBody, _title: string, outPath: string): Promise<SlidesExportResult> {
  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const deck = migrateSlidesBody(body)
    const theme = resolveTheme(deck.theme)
    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: 'WIDE', width: IN_W, height: IN_H })
    pptx.layout = 'WIDE'

    for (const slide of deck.slides) {
      const s = pptx.addSlide()
      const bg = slide.background?.type === 'solid' ? slide.background.color : theme.background
      s.background = { color: hex(bg, 'FFFFFF') }
      for (const el of (slide.elements ?? []).slice().sort((a, b) => a.z - b.z)) {
        const pos = { x: px2inX(el.x), y: px2inY(el.y), w: px2inX(el.w), h: px2inY(el.h) }
        if (el.type === 'text') {
          const runs = el.paragraphs.flatMap((p, pi) =>
            p.runs.map((r) => ({
              text: r.text + (pi < el.paragraphs.length - 1 ? '\n' : ''),
              options: {
                bold: r.bold,
                italic: r.italic,
                underline: r.underline ? { style: 'sng' as const } : undefined,
                color: hex(r.color, hex(theme.textColor)),
                fontSize: px2pt(r.fontSize ?? theme.bodyStyle.fontSize),
                align: p.align ?? 'left',
                bullet: p.listStyle === 'bullet' ? true : p.listStyle === 'number' ? { type: 'number' as const } : undefined,
                fontFace: el.fontFamily?.split(',')[0]?.replace(/["']/g, '')
              }
            }))
          )
          s.addText(runs.length ? runs : [{ text: '', options: {} }], { ...pos, valign: el.vAlign ?? 'top' })
        } else if (el.type === 'image') {
          s.addImage({ ...pos, data: el.src })
        } else if (el.type === 'shape') {
          const map: Record<string, string> = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle' }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.addShape((map[el.shape] ?? 'rect') as any, {
            ...pos,
            fill: el.fill?.type === 'solid' ? { color: hex(el.fill.color, hex(theme.accent)) } : { type: 'none' },
            line: el.border ? { color: hex(el.border.color), width: el.border.width } : undefined
          })
        } else if (el.type === 'line') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.addShape('line' as any, {
            ...pos,
            line: { color: hex(el.stroke, hex(theme.accent)), width: el.strokeWidth, endArrowType: el.arrowEnd ? 'triangle' : 'none' }
          })
        }
      }
      if (slide.notes) s.addNotes(slide.notes)
    }

    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
    await writeFile(outPath, buf)
    return { ok: true, path: outPath }
  } catch (e) {
    return { ok: false, error: `Could not export: ${(e as Error).message}` }
  }
}

// ── PDF export (render each slide to an offscreen page and print) ──────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function textElHtml(el: SlideTextElement, theme: DeckTheme): string {
  const justify = el.vAlign === 'middle' ? 'center' : el.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
  const paras = el.paragraphs
    .map((p) => {
      const runs = p.runs
        .map(
          (r) =>
            `<span style="font-weight:${r.bold ? 700 : 400};font-style:${r.italic ? 'italic' : 'normal'};text-decoration:${r.underline ? 'underline' : 'none'};color:${r.color ?? theme.textColor};font-size:${r.fontSize ?? theme.bodyStyle.fontSize}px">${esc(r.text)}</span>`
        )
        .join('')
      const bullet = p.listStyle === 'bullet' ? '• ' : ''
      return `<div style="text-align:${p.align ?? 'left'}">${bullet}${runs}</div>`
    })
    .join('')
  return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;display:flex;flex-direction:column;justify-content:${justify};font-family:${el.fontFamily ?? theme.fontBody}">${paras}</div>`
}
function slideHtml(slide: Slide, theme: DeckTheme): string {
  const bg = slide.background?.type === 'solid' ? slide.background.color : theme.background
  const els = (slide.elements ?? [])
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((el) => {
      if (el.type === 'text') return textElHtml(el, theme)
      if (el.type === 'image') return `<img src="${el.src}" style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;object-fit:${el.fit ?? 'contain'}"/>`
      if (el.type === 'shape') {
        const radius = el.shape === 'ellipse' ? '50%' : el.shape === 'roundRect' ? '16px' : '0'
        const clip = el.shape === 'triangle' ? 'clip-path:polygon(50% 0,0 100%,100% 100%);' : ''
        return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.fill?.type === 'solid' ? el.fill.color : 'transparent'};border-radius:${radius};${clip}${el.border ? `border:${el.border.width}px ${el.border.style ?? 'solid'} ${el.border.color}` : ''}"></div>`
      }
      // line
      return `<svg style="position:absolute;left:${el.x}px;top:${el.y}px" width="${el.w}" height="${el.h}"><line x1="0" y1="0" x2="${el.w}" y2="${el.h}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/></svg>`
    })
    .join('')
  return `<div class="page" style="position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;background:${bg};overflow:hidden;color:${theme.textColor}">${els}</div>`
}

export async function exportSlidesPdf(body: SlidesBody, outPath: string): Promise<SlidesExportResult> {
  const deck = migrateSlidesBody(body)
  const theme = resolveTheme(deck.theme)
  const pages = deck.slides.map((s) => slideHtml(s, theme)).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .page { page-break-after: always; }
  </style></head><body>${pages}</body></html>`
  const offscreen = new BrowserWindow({ show: false, width: SLIDE_W, height: SLIDE_H, webPreferences: { offscreen: true } })
  try {
    await offscreen.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await offscreen.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, landscape: true })
    await writeFile(outPath, pdf)
    return { ok: true, path: outPath }
  } catch (e) {
    return { ok: false, error: `Could not export PDF: ${(e as Error).message}` }
  } finally {
    offscreen.destroy()
  }
}

// ── PPTX import (best-effort: text + basic structure) ──────────────────────────
export async function importPptx(): Promise<SlidesImportResult> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Import PowerPoint',
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false }
  const path = res.filePaths[0]
  try {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = await readFile(path)
    const files = unzipSync(new Uint8Array(buf))
    // Slide XML parts are ppt/slides/slideN.xml; order them numerically.
    const slideNames = Object.keys(files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => (parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10)))
    if (!slideNames.length) return { ok: false, error: 'No slides found in that file.' }

    const slides: Slide[] = slideNames.map((name, i) => {
      const xml = strFromU8(files[name])
      // Every run of text sits in an <a:t>…</a:t>. Group by paragraph <a:p>.
      const paras = xml
        .split(/<a:p[ >]/)
        .slice(1)
        .map((chunk) => {
          const texts = [...chunk.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
            m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          )
          return texts.join('')
        })
        .filter((t) => t.trim() !== '')
      const title = paras[0] ?? `Slide ${i + 1}`
      const bullets = paras.slice(1)
      return { id: `imp-${i}`, title, bullets, notes: '', layout: bullets.length ? 'title-content' : 'title' }
    })

    return { ok: true, name: basename(path), body: migrateSlidesBody({ slides }) }
  } catch (e) {
    return { ok: false, error: `Could not read that file: ${(e as Error).message}` }
  }
}

// Save-dialog wrappers used by IPC.
export async function exportSlides(input: { body: SlidesBody; title: string; format: 'pptx' | 'pdf' }): Promise<SlidesExportResult> {
  const safe = (input.title || 'presentation').replace(/[/\\?%*:|"<>]/g, '-')
  const res = await dialog.showSaveDialog(win()!, {
    title: `Export as ${input.format.toUpperCase()}`,
    defaultPath: `${safe}.${input.format}`,
    filters: [{ name: input.format.toUpperCase(), extensions: [input.format] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }
  return input.format === 'pptx' ? exportPptx(input.body, input.title, res.filePath) : exportSlidesPdf(input.body, res.filePath)
}
