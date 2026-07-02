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

// Walk the top-level blocks using their laid-out heights (which do not depend on
// the spacers above them, so the result is stable and never oscillates) and place
// a spacer before every block that would cross a page bottom.
function computeDecorations(view: EditorView): { set: DecorationSet; pages: number; sig: string } {
  if (!cfg.enabled || cfg.pageContentPx <= 0) return { set: DecorationSet.empty, pages: 1, sig: 'off' }
  const { pageContentPx, gapPx, mTop, mBottom } = cfg
  const decos: Decoration[] = []
  const parts: string[] = []
  let flowY = 0
  let page = 0
  const doc = view.state.doc
  doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || typeof dom.getBoundingClientRect !== 'function') return
    const cs = window.getComputedStyle(dom)
    const h = dom.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0)
    const pageBottom = (page + 1) * pageContentPx
    // Push to the next page when this block would spill over — but never push the
    // first block on a page (a block taller than a whole page simply overflows,
    // as it does in every word processor).
    if (flowY + h > pageBottom + 0.5 && flowY > page * pageContentPx + 0.5) {
      const spacerPx = pageBottom - flowY + mBottom + gapPx + mTop
      const px = Math.max(0, Math.round(spacerPx))
      decos.push(Decoration.widget(offset, () => spacerDom(px), { side: -1, key: `pb-${page}-${px}` }))
      parts.push(`${offset}:${px}`)
      flowY = pageBottom
      page += 1
    }
    flowY += h
  })
  return { set: DecorationSet.create(doc, decos), pages: page + 1, sig: parts.join('|') }
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
