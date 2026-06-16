import { useEffect, useState } from 'react'
import type { Slide, SlidesBody } from '@shared/types'
import Icon from '../Icon'

// Slides editor — a deck you can edit and present. The left rail lists slides
// (add, reorder, delete); the centre edits the selected slide's title, body
// bullets, layout and speaker notes; "Present" runs a full-screen slideshow
// with keyboard navigation. Bullets are edited as one line each.

interface Props {
  body: SlidesBody
  onChange: (body: SlidesBody) => void
}

function newSlide(): Slide {
  return { id: crypto.randomUUID(), title: 'New slide', bullets: [], notes: '', layout: 'bullets' }
}

// A single rendered slide face, shared by the thumbnail, the preview and the
// present overlay (scaled by font sizing).
function SlideFace({ slide, scale = 1 }: { slide: Slide; scale?: number }): JSX.Element {
  const center = slide.layout === 'title' || slide.layout === 'section'
  return (
    <div
      className={`w-full h-full flex flex-col ${center ? 'items-center justify-center text-center' : 'justify-start'} bg-white text-stone-900 overflow-hidden`}
      style={{ padding: `${6 * scale}%` }}
    >
      <h2 style={{ fontSize: `${(center ? 5 : 4) * scale}vh` }} className="font-bold leading-tight mb-[2%]">
        {slide.title}
      </h2>
      {slide.layout !== 'title' && slide.bullets.filter((b) => b.trim()).length > 0 && (
        <ul className="list-disc pl-[5%] space-y-[1.5%]">
          {slide.bullets
            .filter((b) => b.trim())
            .map((b, i) => (
              <li key={i} style={{ fontSize: `${2.6 * scale}vh` }} className="text-stone-700">
                {b}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

export default function SlidesEditor({ body, onChange }: Props): JSX.Element {
  const slides = body.slides
  const [sel, setSel] = useState(0)
  const [presenting, setPresenting] = useState(false)
  const [presentIdx, setPresentIdx] = useState(0)

  const current = slides[Math.min(sel, slides.length - 1)] ?? null

  function patchSlide(idx: number, patch: Partial<Slide>): void {
    onChange({ slides: slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)) })
  }

  function addSlide(): void {
    onChange({ slides: [...slides, newSlide()] })
    setSel(slides.length)
  }

  function deleteSlide(idx: number): void {
    if (slides.length <= 1) return
    onChange({ slides: slides.filter((_, i) => i !== idx) })
    setSel(Math.max(0, idx - 1))
  }

  function move(idx: number, dir: -1 | 1): void {
    const j = idx + dir
    if (j < 0 || j >= slides.length) return
    const next = [...slides]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange({ slides: next })
    setSel(j)
  }

  // Present-mode keyboard navigation.
  useEffect(() => {
    if (!presenting) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'ArrowRight' || e.key === ' ') setPresentIdx((i) => Math.min(slides.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setPresentIdx((i) => Math.max(0, i - 1))
      else if (e.key === 'Escape') setPresenting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, slides.length])

  return (
    <div className="h-full flex">
      {/* Slide rail */}
      <div className="w-44 shrink-0 border-r border-stone-200 dark:border-stone-800 flex flex-col">
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => setSel(i)}
                className={`block w-full aspect-video rounded-md overflow-hidden border-2 ${
                  i === sel ? 'border-accent' : 'border-stone-200 dark:border-stone-700'
                }`}
              >
                <SlideFace slide={s} scale={0.5} />
              </button>
              <span className="absolute top-1 left-1 text-[9px] font-semibold text-white bg-black/40 rounded px-1">
                {i + 1}
              </span>
              <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 flex flex-col gap-0.5">
                <button onClick={() => move(i, -1)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5" title="Move up">
                  <Icon name="keyboard_arrow_up" size={12} />
                </button>
                <button onClick={() => move(i, 1)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5" title="Move down">
                  <Icon name="keyboard_arrow_down" size={12} />
                </button>
                <button onClick={() => deleteSlide(i)} className="bg-white/90 dark:bg-stone-900/90 rounded p-0.5 text-red-500" title="Delete">
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addSlide}
            className="w-full aspect-video rounded-md border-2 border-dashed border-stone-300 dark:border-stone-600 text-stone-400 hover:text-accent hover:border-accent flex items-center justify-center"
          >
            <Icon name="add" size={20} />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto min-w-0">
        <div className="px-6 py-4 flex items-center justify-between border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-stone-500">Slide {sel + 1} of {slides.length}</span>
            <select
              value={current?.layout ?? 'bullets'}
              onChange={(e) => patchSlide(sel, { layout: e.target.value as Slide['layout'] })}
              className="text-[12px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-2 py-1"
            >
              <option value="title">Title</option>
              <option value="bullets">Bullets</option>
              <option value="section">Section</option>
            </select>
          </div>
          <button
            onClick={() => {
              setPresentIdx(sel)
              setPresenting(true)
            }}
            className="btn-primary text-[12px] px-3 py-1.5"
          >
            <Icon name="play_arrow" size={14} /> Present
          </button>
        </div>

        {current && (
          <div className="p-6 space-y-4 max-w-2xl">
            {/* Live preview */}
            <div className="aspect-video rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm">
              <SlideFace slide={current} />
            </div>

            <input
              value={current.title}
              onChange={(e) => patchSlide(sel, { title: e.target.value })}
              placeholder="Slide title"
              className="w-full bg-transparent text-lg font-semibold text-stone-900 dark:text-stone-100 focus:outline-none border-b border-stone-200 dark:border-stone-700 pb-1"
            />

            <div>
              <label className="block text-[12px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                Bullets (one per line)
              </label>
              <textarea
                value={current.bullets.join('\n')}
                onChange={(e) => patchSlide(sel, { bullets: e.target.value.split('\n') })}
                rows={5}
                placeholder="One point per line"
                className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                Speaker notes
              </label>
              <textarea
                value={current.notes}
                onChange={(e) => patchSlide(sel, { notes: e.target.value })}
                rows={3}
                placeholder="What to actually say on this slide"
                className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Present overlay */}
      {presenting && slides[presentIdx] && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-6xl aspect-video shadow-2xl">
              <SlideFace slide={slides[presentIdx]} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 pb-6 text-white/80">
            <button onClick={() => setPresentIdx((i) => Math.max(0, i - 1))} className="p-2 hover:text-white" disabled={presentIdx === 0}>
              <Icon name="chevron_left" size={28} />
            </button>
            <span className="text-[13px] tabular-nums">
              {presentIdx + 1} / {slides.length}
            </span>
            <button
              onClick={() => setPresentIdx((i) => Math.min(slides.length - 1, i + 1))}
              className="p-2 hover:text-white"
              disabled={presentIdx === slides.length - 1}
            >
              <Icon name="chevron_right" size={28} />
            </button>
            <button onClick={() => setPresenting(false)} className="p-2 hover:text-white ml-6" title="Exit (Esc)">
              <Icon name="close" size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
