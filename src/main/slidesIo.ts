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
import { chartToSvg } from '@shared/chart'

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
        // Framing shared by every element type: rotation and a drop-shadow preset,
        // so a rotated or shadowed element survives into PowerPoint.
        const frame: Record<string, unknown> = {}
        if (el.rotation) frame.rotate = Math.round(el.rotation)
        if (el.shadow) {
          const blur = el.shadow === 'sm' ? 3 : el.shadow === 'md' ? 6 : 10
          const offset = el.shadow === 'sm' ? 2 : el.shadow === 'md' ? 4 : 7
          frame.shadow = { type: 'outer', blur, offset, angle: 45, color: '000000', opacity: 0.4 }
        }
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
          s.addText(runs.length ? runs : [{ text: '', options: {} }], { ...pos, ...frame, valign: el.vAlign ?? 'top' })
        } else if (el.type === 'image') {
          s.addImage({ ...pos, ...frame, data: el.src, rounding: !!el.cornerRadius })
        } else if (el.type === 'shape') {
          const isRound = el.shape === 'roundRect' || (el.shape === 'rect' && !!el.cornerRadius)
          const map: Record<string, string> = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle' }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.addShape((isRound ? 'roundRect' : (map[el.shape] ?? 'rect')) as any, {
            ...pos,
            ...frame,
            // Corner radius as a fraction of the shorter side (pptxgenjs convention).
            rectRadius: isRound && el.cornerRadius ? Math.min(0.5, el.cornerRadius / Math.min(el.w, el.h)) : undefined,
            fill: el.fill?.type === 'solid' ? { color: hex(el.fill.color, hex(theme.accent)) } : { type: 'none' },
            line: el.border ? { color: hex(el.border.color), width: el.border.width } : undefined
          })
        } else if (el.type === 'line') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.addShape('line' as any, {
            ...pos,
            ...frame,
            line: { color: hex(el.stroke, hex(theme.accent)), width: el.strokeWidth, endArrowType: el.arrowEnd ? 'triangle' : 'none' }
          })
        } else if (el.type === 'widget') {
          // A live desk-widget embed has no static form here; keep the frame in
          // the layout with an honest label rather than fake widget content.
          s.addText('Embedded desk widget', {
            ...pos,
            ...frame,
            fontSize: 10,
            color: 'A8A29E',
            align: 'center',
            valign: 'middle',
            line: { color: 'D6D3D1', width: 1 }
          })
        } else if (el.type === 'chart') {
          // A real, editable PowerPoint chart from the snapshot data. Scatter
          // maps to line (pptx scatter needs paired-axis data we don't carry).
          const c = el.chart
          const chartData = c.data.series.map((sr) => ({
            name: sr.name || 'Series',
            labels: c.data.categories,
            values: sr.values.map((v) => (Number.isFinite(v) ? v : 0))
          }))
          const t = c.type === 'pie' ? 'pie' : c.type === 'area' ? 'area' : c.type === 'line' || c.type === 'scatter' ? 'line' : 'bar'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opts: any = { ...pos, ...frame, showLegend: true, legendPos: 'b' }
          if (c.title) {
            opts.showTitle = true
            opts.title = c.title
          }
          if (t === 'bar') opts.barDir = 'col'
          if (c.stacked && (t === 'bar' || t === 'area')) opts.barGrouping = 'stacked'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.addChart(t as any, chartData, opts)
        } else if (el.type === 'table') {
          // A real, editable PowerPoint table.
          const accent = hex(el.accent, 'E2E8F0')
          const rows = el.cells.map((row, r) =>
            row.map((text) => ({
              text: text ?? '',
              options: el.headerRow && r === 0 ? { bold: true, fill: { color: accent } } : {}
            }))
          )
          s.addTable(rows, { ...pos, ...frame, border: { type: 'solid', pt: 1, color: accent }, fontSize: (el.fontSize ?? 16) * 0.6, valign: 'middle' })
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
      if (el.type === 'line')
        return `<svg style="position:absolute;left:${el.x}px;top:${el.y}px" width="${el.w}" height="${el.h}"><line x1="0" y1="0" x2="${el.w}" y2="${el.h}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/></svg>`
      if (el.type === 'chart')
        return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px">${chartToSvg(el.chart, el.w, el.h)}</div>`
      if (el.type === 'table') {
        const accent = el.accent ?? '#e2e8f0'
        const rows = el.cells
          .map(
            (row, r) =>
              `<tr>${row
                .map((cell) => `<td style="border:1px solid ${accent};padding:4px 8px;${el.headerRow && r === 0 ? `font-weight:700;background:${accent};` : ''}">${esc(cell)}</td>`)
                .join('')}</tr>`
          )
          .join('')
        return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:${el.fontSize ?? 16}px">${rows}</table></div>`
      }
      // widget: a live desk-widget embed cannot be rendered in a static export
      // (it resolves via renderer IPC), so print an honest labelled frame.
      return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;border:1px solid #d6d3d1;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#a8a29e;font-size:14px">Embedded desk widget</div>`
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

// ── PPTX import (best-effort: text + speaker notes) ────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Every run of text in a slide/notes XML sits in <a:t>…</a:t>, grouped by
// paragraph <a:p>. Returns one string per non-empty paragraph.
function paragraphs(xml: string): string[] {
  return xml
    .split(/<a:p[ >]/)
    .slice(1)
    .map((chunk) => [...chunk.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
    .filter((t) => t.trim() !== '')
}

// The speaker notes for a slide: follow the slide's .rels to its notesSlide part
// and read the body text, skipping the slide-number / date / footer placeholders
// (which PowerPoint stamps into every notes page and are not real notes).
function notesForSlide(
  files: Record<string, Uint8Array>,
  slideName: string,
  strFromU8: (u: Uint8Array) => string
): string {
  const n = slideName.match(/slide(\d+)\.xml$/)?.[1]
  if (!n) return ''
  const rels = files[`ppt/slides/_rels/slide${n}.xml.rels`]
  if (!rels) return ''
  const target = /Target="([^"]*notesSlide\d+\.xml)"/.exec(strFromU8(rels))?.[1]
  if (!target) return ''
  const key = target.replace(/^\.\.\//, 'ppt/').replace(/^\//, '')
  const notesXml = files[key]
  if (!notesXml) return ''
  const lines: string[] = []
  for (const sp of strFromU8(notesXml).split(/<p:sp>/).slice(1)) {
    const body = sp.split(/<\/p:sp>/)[0]
    if (/type="(sldNum|dt|ftr)"/.test(body)) continue // placeholder, not notes
    lines.push(...paragraphs(body))
  }
  return lines.join('\n')
}

// Pure .pptx → SlidesImportResult. Extracted so it can be unit-tested against a
// real (pptxgenjs-generated) buffer without a file dialog.
export async function parsePptx(data: Uint8Array, name: string): Promise<SlidesImportResult> {
  try {
    const { unzipSync, strFromU8 } = await import('fflate')
    const files = unzipSync(data) as Record<string, Uint8Array>
    const slideNames = Object.keys(files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10))
    if (!slideNames.length) return { ok: false, error: 'No slides found in that file.' }

    const slides: Slide[] = slideNames.map((sn, i) => {
      const paras = paragraphs(strFromU8(files[sn]))
      const title = paras[0] ?? `Slide ${i + 1}`
      const bullets = paras.slice(1)
      const notes = notesForSlide(files, sn, strFromU8)
      return { id: `imp-${i}`, title, bullets, notes, layout: bullets.length ? 'title-content' : 'title' }
    })

    return { ok: true, name, body: migrateSlidesBody({ slides }) }
  } catch (e) {
    return { ok: false, error: `Could not read that file: ${(e as Error).message}` }
  }
}

export async function importPptx(): Promise<SlidesImportResult> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Import PowerPoint',
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false }
  const path = res.filePaths[0]
  const buf = await readFile(path)
  return await parsePptx(new Uint8Array(buf), basename(path))
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
