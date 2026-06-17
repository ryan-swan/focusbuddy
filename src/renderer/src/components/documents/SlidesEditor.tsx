import { useEffect, useRef, useState } from 'react'
import type { DeckTheme, Slide, SlideElement, SlideLayout, SlidesBody, SlideTransition } from '@shared/types'
import { resolveTheme, layoutElements, applyThemeToDeck } from '@shared/slideThemes'
import { migrateSlidesBody } from '@shared/slidesMigrate'
import SlideFace from './slides/SlideFace'
import SlideCanvas from './slides/SlideCanvas'
import ElementInspector from './slides/ElementInspector'
import SlidesToolbar from './slides/SlidesToolbar'
import PresentOverlay from './slides/PresentOverlay'
import AiSlidePanel from './slides/AiSlidePanel'
import {
  addElement,
  updateElement,
  deleteElement,
  duplicateElement,
  reorderZ,
  setElementText,
  styleTextElement,
  setParagraphAlign,
  elementId
} from './slides/slideOps'
import Icon from '../Icon'

// PowerPoint-class slides editor. The deck is held as v2 (element-based) in local
// state; legacy decks migrate on mount. The rail manages slides, the canvas edits
// the selected slide's elements, the inspector edits the selection, and Present
// runs the deck. Edits flow to onChange (debounced autosave).

interface Props {
  body: SlidesBody
  title: string
  onChange: (body: SlidesBody) => void
}

export default function SlidesEditor({ body: rawBody, title, onChange }: Props): JSX.Element {
  const [body, setBody] = useState<SlidesBody>(() => migrateSlidesBody(rawBody))
  const [sel, setSel] = useState(0)
  const [selectedElId, setSelectedElId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [canvasW, setCanvasW] = useState(720)

  const undo = useRef<SlidesBody[]>([])
  const canvasWrap = useRef<HTMLDivElement | null>(null)

  const theme = resolveTheme(body.theme)
  const slides = body.slides
  const slideIdx = Math.min(sel, slides.length - 1)
  const slide = slides[slideIdx]
  const selectedEl = (slide?.elements ?? []).find((e) => e.id === selectedElId) ?? null

  // Measure the canvas column so the slide scales to fit.
  useEffect(() => {
    const el = canvasWrap.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setCanvasW(Math.max(320, Math.min(w - 32, 1100)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function commit(next: SlidesBody): void {
    undo.current.push(body)
    if (undo.current.length > 80) undo.current.shift()
    setBody(next)
    onChange(next)
  }
  function setSlides(slidesNext: Slide[], extra?: Partial<SlidesBody>): void {
    commit({ ...body, slides: slidesNext, ...extra })
  }
  function mutateSlide(fn: (s: Slide) => Slide): void {
    setSlides(slides.map((s, i) => (i === slideIdx ? fn(s) : s)))
  }
  function updateEl(id: string, patch: Partial<SlideElement>): void {
    mutateSlide((s) => updateElement(s, id, patch))
  }

  function undoLast(): void {
    const prev = undo.current.pop()
    if (!prev) return
    setBody(prev)
    onChange(prev)
  }

  // Deck-level undo on Cmd/Ctrl+Z, except while editing text in an input or
  // textarea (where the browser's own text undo should win). A document listener
  // rather than a div handler so it fires regardless of which child has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      e.preventDefault()
      undoLast()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  // ── Slide rail ops ────────────────────────────────────────────────────────
  function addSlide(): void {
    const s: Slide = {
      id: `sl-${Date.now().toString(36)}`,
      notes: '',
      layout: 'title-content',
      elements: layoutElements('title-content', theme),
      transition: 'none',
      background: { type: 'solid', color: theme.background },
      schemaVersion: 2
    }
    commit({ ...body, slides: [...slides, s] })
    setSel(slides.length)
    setSelectedElId(null)
  }
  function deleteSlide(i: number): void {
    if (slides.length <= 1) return
    setSlides(slides.filter((_, si) => si !== i))
    setSel(Math.max(0, i - 1))
    setSelectedElId(null)
  }
  function moveSlide(i: number, dir: -1 | 1): void {
    const j = i + dir
    if (j < 0 || j >= slides.length) return
    const next = [...slides]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSlides(next)
    setSel(j)
  }

  // ── Insert elements ───────────────────────────────────────────────────────
  function insertText(): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'text',
      x: 240,
      y: 300,
      w: 800,
      h: 140,
      z: 10,
      fontFamily: theme.fontBody,
      vAlign: 'top',
      paragraphs: [{ runs: [{ text: 'Text', fontSize: theme.bodyStyle.fontSize, color: theme.textColor }], align: 'left' }]
    }
    mutateSlide((s) => addElement(s, el))
    setSelectedElId(el.id)
  }
  function insertShape(shape: 'rect' | 'ellipse' | 'roundRect' | 'triangle'): void {
    const el: SlideElement = { id: elementId(), type: 'shape', shape, x: 440, y: 240, w: 400, h: 240, z: 10, fill: { type: 'solid', color: theme.accent } }
    mutateSlide((s) => addElement(s, el))
    setSelectedElId(el.id)
  }
  function insertLine(): void {
    const el: SlideElement = { id: elementId(), type: 'line', x: 300, y: 320, w: 680, h: 0, z: 10, x2: 980, y2: 320, stroke: theme.accent, strokeWidth: 4, arrowEnd: true }
    mutateSlide((s) => addElement(s, el))
    setSelectedElId(el.id)
  }
  async function insertImage(): Promise<void> {
    const res = await window.api.office.pickImage()
    if (res.ok && res.dataUrl) {
      const el: SlideElement = { id: elementId(), type: 'image', src: res.dataUrl, fit: 'contain', x: 340, y: 180, w: 600, h: 360, z: 10 }
      mutateSlide((s) => addElement(s, el))
      setSelectedElId(el.id)
    }
  }
  function applyLayout(layout: SlideLayout): void {
    mutateSlide((s) => ({ ...s, layout, elements: layoutElements(layout, theme) }))
    setSelectedElId(null)
  }
  function applyTheme(t: DeckTheme): void {
    commit(applyThemeToDeck(body, t))
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  function applyAi(mode: 'deck' | 'append' | 'redesign', aiBody: SlidesBody): void {
    const migrated = migrateSlidesBody(aiBody)
    if (mode === 'deck') {
      commit(migrated)
      setSel(0)
    } else if (mode === 'append') {
      commit({ ...body, slides: [...slides, ...migrated.slides] })
      setSel(slides.length)
    } else {
      const redesigned = migrated.slides[0]
      if (redesigned) mutateSlide((s) => ({ ...s, elements: redesigned.elements, background: redesigned.background ?? s.background }))
    }
    setAiOpen(false)
    setSelectedElId(null)
  }

  // ── Import / export ───────────────────────────────────────────────────────
  async function exportFile(format: 'pptx' | 'pdf'): Promise<void> {
    setStatus('Exporting…')
    try {
      const res = await window.api.slides.export({ body, title, format })
      setStatus(res.ok ? `Saved ${res.path}` : res.error ?? null)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  async function importFile(): Promise<void> {
    setStatus('Importing…')
    try {
      const res = await window.api.slides.import()
      if (res.ok && res.body) {
        const migrated = migrateSlidesBody(res.body)
        undo.current.push(body)
        setBody(migrated)
        onChange(migrated)
        setSel(0)
        setStatus('Imported. PowerPoint import is best-effort: text and basic layout only.')
      } else if (res.error) setStatus(res.error)
      else setStatus(null)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  if (!slide) return <div className="p-6 text-stone-400">Empty deck.</div>

  return (
    <div className="h-full flex flex-col">
      <SlidesToolbar
        onInsertText={insertText}
        onInsertImage={() => void insertImage()}
        onInsertShape={insertShape}
        onInsertLine={insertLine}
        onApplyLayout={applyLayout}
        onPresent={() => setPresenting(true)}
        onAi={() => setAiOpen((v) => !v)}
        onImport={() => void importFile()}
        onExport={(f) => void exportFile(f)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Rail */}
        <div className="w-40 shrink-0 border-r border-stone-200 dark:border-stone-800 overflow-auto p-2 space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => { setSel(i); setSelectedElId(null) }}
                className={`block w-full rounded-md overflow-hidden border-2 ${i === slideIdx ? 'border-accent' : 'border-stone-200 dark:border-stone-700'}`}
              >
                <SlideFace slide={s} theme={theme} width={140} />
              </button>
              <span className="absolute top-1 left-1 text-[9px] font-semibold text-white bg-black/40 rounded px-1">{i + 1}</span>
              <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 flex flex-col gap-0.5">
                <button onClick={() => moveSlide(i, -1)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5" title="Move up"><Icon name="keyboard_arrow_up" size={12} /></button>
                <button onClick={() => moveSlide(i, 1)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5" title="Move down"><Icon name="keyboard_arrow_down" size={12} /></button>
                <button onClick={() => deleteSlide(i)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5 text-red-500" title="Delete"><Icon name="close" size={12} /></button>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="w-full aspect-video rounded-md border-2 border-dashed border-stone-300 dark:border-stone-600 text-stone-400 hover:text-accent hover:border-accent flex items-center justify-center" data-testid="slides-add">
            <Icon name="add" size={20} />
          </button>
        </div>

        {/* Canvas column */}
        <div ref={canvasWrap} className="flex-1 min-w-0 overflow-auto bg-stone-100 dark:bg-stone-950/40 p-4">
          {status && (
            <div className="mb-2 text-[12px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5" data-testid="slides-status">
              <span>{status}</span>
              <button onClick={() => setStatus(null)} className="text-stone-400 hover:text-stone-600"><Icon name="close" size={12} /></button>
            </div>
          )}
          {aiOpen && <AiSlidePanel theme={theme} onApply={applyAi} onClose={() => setAiOpen(false)} />}
          <div className="flex justify-center">
            <SlideCanvas
              slide={slide}
              theme={theme}
              width={canvasW}
              selectedId={selectedElId}
              onSelect={setSelectedElId}
              onUpdateElement={updateEl}
              onSetText={(id, text) =>
                mutateSlide((s) => updateElement(s, id, (() => {
                  const e = (s.elements ?? []).find((x) => x.id === id)
                  return e && e.type === 'text' ? setElementText(e, text) : {}
                })()))
              }
            />
          </div>
          {/* Speaker notes */}
          <div className="max-w-3xl mx-auto mt-3">
            <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">Speaker notes</div>
            <textarea
              value={slide.notes}
              onChange={(e) => mutateSlide((s) => ({ ...s, notes: e.target.value }))}
              rows={2}
              placeholder="What to actually say on this slide"
              className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        {/* Inspector */}
        <ElementInspector
          slide={slide}
          selected={selectedEl}
          currentThemeId={theme.id}
          onUpdateElement={updateEl}
          onStyleText={(id, patch) =>
            mutateSlide((s) => updateElement(s, id, (() => {
              const e = (s.elements ?? []).find((x) => x.id === id)
              return e && e.type === 'text' ? styleTextElement(e, patch) : {}
            })()))
          }
          onAlign={(id, align) =>
            mutateSlide((s) => updateElement(s, id, (() => {
              const e = (s.elements ?? []).find((x) => x.id === id)
              return e && e.type === 'text' ? setParagraphAlign(e, align) : {}
            })()))
          }
          onDelete={(id) => { mutateSlide((s) => deleteElement(s, id)); setSelectedElId(null) }}
          onDuplicate={(id) => {
            const { slide: ns, newId } = duplicateElement(slide, id)
            mutateSlide(() => ns)
            setSelectedElId(newId)
          }}
          onReorderZ={(id, dir) => mutateSlide((s) => reorderZ(s, id, dir))}
          onSetTransition={(t: SlideTransition) => mutateSlide((s) => ({ ...s, transition: t }))}
          onSetBackground={(color) => mutateSlide((s) => ({ ...s, background: { type: 'solid', color } }))}
          onApplyTheme={applyTheme}
        />
      </div>

      {presenting && <PresentOverlay slides={slides} theme={theme} startIndex={slideIdx} onClose={() => setPresenting(false)} />}
    </div>
  )
}
