import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

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

function spacerDom(px: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'fb-page-spacer'
  el.style.height = `${px}px`
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  return el
}

// Place a spacer before every top-level block that would cross a page bottom, so
// no block straddles the grey gap. Correctness hinges on using the blocks' REAL
// laid-out positions rather than summing per-block heights: CSS collapses the
// margin between adjacent blocks, so summing marginTop+marginBottom drifts from
// reality and makes spacers land short (text spilling into the gap). Instead we
// read each block's actual top/bottom from the DOM and subtract the heights of
// the spacers already inserted above it, which recovers the natural (un-
// paginated) flow position exactly, margin-collapse included. Measuring against
// the natural flow means the result is stable: re-measuring with the spacers in
// place reproduces the same natural positions and therefore the same breaks.
function computeDecorations(view: EditorView): { set: DecorationSet; pages: number; sig: string } {
  if (!cfg.enabled || cfg.pageContentPx <= 0) return { set: DecorationSet.empty, pages: 1, sig: 'off' }
  const { pageContentPx, gapPx, mTop, mBottom } = cfg
  const decos: Decoration[] = []
  const parts: string[] = []
  const doc = view.state.doc

  const contentTop = (view.dom as HTMLElement).getBoundingClientRect().top
  // Heights + tops of spacers already in the DOM, so we can subtract the ones
  // sitting above any given block to get its natural (un-spacered) position.
  const spacerRects = Array.from(
    (view.dom as HTMLElement).querySelectorAll('.fb-page-spacer')
  ).map((el) => {
    const r = (el as HTMLElement).getBoundingClientRect()
    return { top: r.top, h: r.height }
  })
  const spacerAbove = (domTop: number): number =>
    spacerRects.reduce((sum, s) => (s.top < domTop - 0.5 ? sum + s.h : sum), 0)

  // pageTop is the natural-flow Y at which the current page's content begins.
  // It rebaselines to a pushed block's own natural top so subsequent blocks are
  // measured against the page they actually land on.
  let pageTop = 0
  doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || typeof dom.getBoundingClientRect !== 'function') return
    const r = dom.getBoundingClientRect()
    const above = spacerAbove(r.top)
    const nTop = r.top - contentTop - above
    const nBottom = r.bottom - contentTop - above
    // Push when this block's box would cross the page bottom, unless it is the
    // first block on the page (a block taller than a whole page simply overflows,
    // as it does in every word processor).
    if (nBottom > pageTop + pageContentPx + 0.5 && nTop > pageTop + 0.5) {
      // Fill the rest of this page, cross the bottom margin, the gap, and the
      // next page's top margin, so the block starts exactly at the next page's
      // content top.
      const spacerPx = pageTop + pageContentPx - nTop + mBottom + gapPx + mTop
      const px = Math.max(0, Math.round(spacerPx))
      decos.push(Decoration.widget(offset, () => spacerDom(px), { side: -1, key: `pb-${offset}-${px}` }))
      parts.push(`${offset}:${px}`)
      // The pushed block now begins a fresh page at its own natural top.
      pageTop = nTop
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
