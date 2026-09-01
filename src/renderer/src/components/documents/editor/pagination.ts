import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

// True page pagination for the document editor's Page view. It measures the laid-
// out blocks and inserts a transparent spacer widget before each block that would
// spill past the bottom of a page, pushing that block onto the next sheet. The
// spacer is real vertical space, so a genuine gap opens between one sheet and the
// next (the white sheets + grey gap are drawn by PageSheet, aligned to these
// spacers). The plugin NEVER changes the document — it only adds decorations — so
// editing is unaffected even if a measurement is imperfect.
//
// The config is shared module-level and set by the active DocEditor. When
// disabled (continuous view / focus mode) the plugin produces no decorations.

interface PagCfg {
  enabled: boolean
  pageContentPx: number // usable content height per page (paper height minus top+bottom margins)
  gapPx: number // the visible gap drawn between two sheets
  mTop: number // top margin in px
  mBottom: number // bottom margin in px
  onPages: ((count: number) => void) | null
}

const cfg: PagCfg = { enabled: false, pageContentPx: 0, gapPx: 0, mTop: 0, mBottom: 0, onPages: null }

// The active plugin's re-measure hook, so a config change from React re-runs it.
let repaginate: (() => void) | null = null

export function setPaginationConfig(next: Partial<PagCfg>): void {
  Object.assign(cfg, next)
  repaginate?.()
}

export const paginationKey = new PluginKey<DecorationSet>('pagePagination')

/**
 * A spacer that is valid INSIDE a table. A <div> between rows is not: the browser
 * will not lay it out as a block in a <tbody>, so a table break has to be a real
 * row whose single cell carries the height.
 */
function rowSpacerDom(px: number, cols: number): HTMLElement {
  const tr = document.createElement('tr')
  tr.className = 'fb-page-spacer'
  tr.style.height = `${px}px`
  tr.setAttribute('contenteditable', 'false')
  tr.setAttribute('aria-hidden', 'true')
  const td = document.createElement('td')
  td.colSpan = Math.max(1, cols)
  td.style.height = `${px}px`
  td.style.padding = '0'
  td.style.border = '0'
  td.style.background = 'transparent'
  tr.appendChild(td)
  return tr
}

/** Widest row's cell count, so a spacer row spans the whole table. */
function countColumns(table: PMNode): number {
  let cols = 1
  table.forEach((row) => {
    let n = 0
    row.forEach((cell) => {
      n += (cell.attrs.colspan as number) || 1
    })
    if (n > cols) cols = n
  })
  return cols
}

/**
 * An inert clone of the table's header row, drawn at the top of a continuation
 * page when the table opts in. Cloned from the live DOM so it inherits the
 * table's real column widths and cell styling — a hand-built row would drift
 * from the original the moment a column is resized.
 */
function repeatHeaderDom(headerDom: HTMLElement): HTMLElement {
  const tr = headerDom.cloneNode(true) as HTMLElement
  tr.className = `${tr.className} fb-repeat-header`.trim()
  tr.setAttribute('contenteditable', 'false')
  tr.setAttribute('aria-hidden', 'true')
  // A clone is a copy of content that already exists in the document; it must
  // never be selectable or land in the copy buffer as a duplicate row.
  tr.style.userSelect = 'none'
  tr.style.pointerEvents = 'none'
  return tr
}

function spacerDom(px: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'fb-page-spacer'
  el.style.height = `${px}px`
  // Force a full-width block so the spacer reliably ends the current line and
  // opens the gap even when inserted mid-paragraph (a within-block page break).
  el.style.display = 'block'
  el.style.width = '100%'
  el.style.flexBasis = '100%'
  el.style.userSelect = 'none'
  el.style.pointerEvents = 'none'
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  return el
}

// One visual line box (screen coordinates) inside a block.
interface LineBox {
  top: number
  bottom: number
  left: number
}

// The visual line boxes of a block, top to bottom. For a text block we ask the
// DOM for the real line fragments via a Range (getClientRects returns one rect
// per line fragment) and merge fragments that share a line, so a long paragraph
// can be broken between its own lines — the way Word paginates. Blocks that must
// not be split mid-content (tables, images, rules, code blocks) report a single
// box so they move whole, overflowing only if taller than a page.
function lineBoxesOf(dom: HTMLElement): LineBox[] {
  const tag = dom.tagName
  // PRE is deliberately NOT atomic. A pasted code fence is routinely taller than
  // a sheet, and an atomic block "overflows only if taller than a page" means it
  // paints straight through the bottom margin, the gap and the sheets below
  // (measured: a 90-line fence ran 1085px past its page band). Code lines are
  // real lines, so they break like prose — the reader gets the rest of the
  // listing on the next page instead of a block that ignores the paper.
  //
  // TABLE stays out of this list too, but for a different reason: it breaks at
  // ROW boundaries, handled in computeDecorations where the row positions are
  // known. Anything that genuinely cannot be split — an image, a figure, a rule
  // — remains atomic and moves whole.
  const atomic =
    tag === 'TABLE' ||
    tag === 'IMG' ||
    tag === 'HR' ||
    tag === 'FIGURE' ||
    dom.classList.contains('tableWrapper') ||
    !!dom.querySelector('table, img')
  if (atomic) {
    const r = dom.getBoundingClientRect()
    return [{ top: r.top, bottom: r.bottom, left: r.left }]
  }
  // Measure the block's TEXT lines only. Ranging over the element's contents
  // would also return the rect of any spacer we already inserted inside it (a
  // within-block break), and a tall spacer rect measured as a "line" would
  // trigger a runaway extra break. Walking text nodes skips element children
  // (spacers, widgets) entirely while still capturing every line fragment,
  // including text inside inline spans (bold, links, code).
  let raw: DOMRect[] = []
  try {
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      if (node.nodeValue && node.nodeValue.trim()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of Array.from(range.getClientRects())) {
          if (r.width > 0.5 && r.height > 0.5) raw.push(r)
        }
      }
      node = walker.nextNode()
    }
  } catch {
    /* fall through to the bounding box */
  }
  if (!raw.length) {
    const r = dom.getBoundingClientRect()
    return [{ top: r.top, bottom: r.bottom, left: r.left }]
  }
  const lines: LineBox[] = []
  for (const r of raw.slice().sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = lines[lines.length - 1]
    // A fragment belongs to the current line when it overlaps it vertically.
    if (last && r.top < last.bottom - 2) {
      last.top = Math.min(last.top, r.top)
      last.bottom = Math.max(last.bottom, r.bottom)
      last.left = Math.min(last.left, r.left)
    } else {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left })
    }
  }
  return lines
}

// Insert a transparent spacer wherever a LINE would cross a page bottom, so no
// line straddles the grey gap — between blocks AND within a long paragraph. A
// pasted wall of text is one giant paragraph, so between-block breaks alone left
// it flowing continuously through every gap; breaking at line boundaries binds it
// to the content zone the way Word does.
//
// Correctness hinges on using the REAL laid-out line positions rather than summed
// heights, and on subtracting the spacers already inserted above a line to
// recover its natural (un-paginated) flow position. Measuring against the natural
// flow makes the result stable: re-measuring with the spacers in place reproduces
// the same natural positions and therefore the same breaks, so the
// measure -> dispatch -> update loop settles.
function computeDecorations(view: EditorView): { set: DecorationSet; pages: number; sig: string } {
  if (!cfg.enabled || cfg.pageContentPx <= 0) return { set: DecorationSet.empty, pages: 1, sig: 'off' }
  const { pageContentPx, gapPx, mTop, mBottom } = cfg
  const decos: Decoration[] = []
  const parts: string[] = []
  const doc = view.state.doc

  const contentTop = (view.dom as HTMLElement).getBoundingClientRect().top
  // Repeated headers are inserted height exactly like spacers are, so they must
  // be subtracted when recovering a line's natural (un-paginated) position —
  // otherwise every break after the first drifts and the measure loop never
  // settles.
  const spacerRects = Array.from(
    (view.dom as HTMLElement).querySelectorAll('.fb-page-spacer, .fb-repeat-header')
  ).map((el) => {
    const r = (el as HTMLElement).getBoundingClientRect()
    return { top: r.top, h: r.height }
  })
  const spacerAbove = (domTop: number): number =>
    spacerRects.reduce((sum, s) => (s.top < domTop - 0.5 ? sum + s.h : sum), 0)

  // pageTop is the natural-flow Y at which the current page's content begins. It
  // rebaselines to the pushed line's own natural top so subsequent lines are
  // measured against the page they actually land on.
  let pageTop = 0
  const addBreak = (pos: number, nTop: number, key: string): void => {
    // Fill the rest of this page, its bottom margin, the gap and the next page's
    // top margin, so the pushed line starts exactly at the next content top.
    const px = Math.max(0, Math.round(pageTop + pageContentPx - nTop + mBottom + gapPx + mTop))
    decos.push(Decoration.widget(pos, () => spacerDom(px), { side: -1, key: `pb-${key}-${px}` }))
    parts.push(`${key}:${px}`)
    pageTop = nTop
  }

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || typeof dom.getBoundingClientRect !== 'function') return

    // A table breaks between ROWS. Treating it as one atom meant a table taller
    // than a sheet painted straight through the bottom margin, the gap and the
    // sheets below (measured: 3781px past its band). Rows are the only place a
    // table can be cut without mangling it, and unlike a text line the row's
    // document position is known exactly, so the spacer goes between rows
    // instead of inside a cell.
    if (node.type.name === 'table') {
      const cols = countColumns(node)
      // Opt-in per table, set from the table's right-click menu. Only meaningful
      // when the first row is actually a header row.
      const first = node.firstChild
      const hasHeader = !!first && first.childCount > 0 && first.child(0).type.name === 'tableHeader'
      const repeatHeader = node.attrs.headerRepeat === true && hasHeader
      const headerDom = repeatHeader
        ? (view.nodeDOM(offset + 1) as HTMLElement | null)
        : null
      let rowPos = offset + 1
      let firstOnPage = true
      // A repeated header eats the top of every continuation page, so those pages
      // hold less. Without this the rows are measured against a full-height band
      // they no longer have, and the shortfall compounds: each page starts one
      // header lower than the last.
      let bandLoss = 0
      node.forEach((row) => {
        const rowDom = view.nodeDOM(rowPos)
        if (rowDom instanceof HTMLElement) {
          const r = rowDom.getBoundingClientRect()
          const above = spacerAbove(r.top)
          const nTop = r.top - contentTop - above
          const nBottom = r.bottom - contentTop - above
          if (nBottom > pageTop + pageContentPx - bandLoss + 0.5 && nTop > pageTop + 0.5 && !firstOnPage) {
            // The spacer's job is unchanged by the repeat: it must still carry
            // the break all the way TO the next page's content top. The repeated
            // header then occupies the first band of that page and the data rows
            // follow it. Subtracting the header height here put the header one
            // header-height ABOVE the band — drawn in the top margin.
            // Its added height is already accounted for, because
            // .fb-repeat-header is counted alongside spacers in spacerAbove.
            const px = Math.max(
              0,
              Math.round(pageTop + pageContentPx - bandLoss - nTop + mBottom + gapPx + mTop)
            )
            decos.push(
              // side -2 so the spacer is drawn BEFORE the repeated header at the
              // same position. Reversed, the header lands at the foot of the
              // page being left rather than the top of the one being started.
              Decoration.widget(rowPos, () => rowSpacerDom(px, cols), {
                side: -2,
                key: `pb-row-${rowPos}-${px}`
              })
            )
            if (repeatHeader && headerDom) {
              const hd = headerDom
              decos.push(
                Decoration.widget(rowPos, () => repeatHeaderDom(hd), {
                  side: -1,
                  key: `pb-hdr-${rowPos}`
                })
              )
            }
            parts.push(`row${rowPos}:${px}${repeatHeader ? '+h' : ''}`)
            pageTop = nTop
            if (repeatHeader && headerDom) bandLoss = Math.round(headerDom.getBoundingClientRect().height)
            firstOnPage = true
          } else {
            firstOnPage = false
          }
        }
        rowPos += row.nodeSize
      })
      return
    }

    const lines = lineBoxesOf(dom)
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      const above = spacerAbove(ln.top)
      const nTop = ln.top - contentTop - above
      const nBottom = ln.bottom - contentTop - above
      // Break when this line's box would cross the page bottom, unless it is the
      // first line on the page (a single line taller than a page just overflows).
      if (nBottom > pageTop + pageContentPx + 0.5 && nTop > pageTop + 0.5) {
        if (i === 0) {
          // The whole block moves to the next page — spacer before the block.
          addBreak(offset, nTop, `${offset}`)
        } else {
          // Break inside the block, before the line that would spill. Map the
          // line's start point to a document position for the spacer.
          const coord = view.posAtCoords({ left: ln.left + 2, top: ln.top + 1 })
          if (coord && typeof coord.pos === 'number') addBreak(coord.pos, nTop, `${coord.pos}`)
          else addBreak(offset, nTop, `${offset}`)
        }
      }
    }
  })
  const pages = parts.length + 1
  return { set: DecorationSet.create(doc, decos), pages, sig: parts.join('|') }
}

export const PagePagination = Extension.create({
  name: 'pagePagination',
  addProseMirrorPlugins() {
    let lastSig = ''
    let raf = 0
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(paginationKey) as DecorationSet | undefined
            if (meta) return meta
            // Keep decoration positions valid across edits until the next measure.
            return old.map(tr.mapping, tr.doc)
          }
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state) ?? DecorationSet.empty
          }
        },
        view: (view) => {
          const measure = (): void => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
              raf = 0
              try {
                const { set, pages, sig } = computeDecorations(view)
                cfg.onPages?.(pages)
                // Only dispatch when the break layout actually changed, so the
                // measure->dispatch->update cycle settles instead of looping.
                if (sig === lastSig) return
                lastSig = sig
                view.dispatch(view.state.tr.setMeta(paginationKey, set).setMeta('addToHistory', false))
              } catch {
                /* measurement is best-effort; never break the editor */
              }
            })
          }
          repaginate = measure
          const ro = new ResizeObserver(() => measure())
          ro.observe(view.dom as HTMLElement)
          measure()
          return {
            update: () => measure(),
            destroy: () => {
              if (repaginate === measure) repaginate = null
              ro.disconnect()
              if (raf) cancelAnimationFrame(raf)
            }
          }
        }
      })
    ]
  }
})
