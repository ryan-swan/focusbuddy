// Full-screen present mode with a presenter view: the current slide large, the
// next slide preview, speaker notes and an elapsed timer. Arrow / space / N / P
// navigate, Esc exits, B blacks out the current slide.

import { useEffect, useState } from 'react'
import type { DeckTheme, Slide } from '@shared/types'
import SlideFace from './SlideFace'
import Icon from '../../Icon'

interface Props {
  slides: Slide[]
  theme: DeckTheme
  startIndex: number
  onClose: () => void
}

export default function PresentOverlay({ slides, theme, startIndex, onClose }: Props): JSX.Element {
  const [idx, setIdx] = useState(startIndex)
  const [blank, setBlank] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'n') setIdx((i) => Math.min(slides.length - 1, i + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'p') setIdx((i) => Math.max(0, i - 1))
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'b') setBlank((b) => !b)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length, onClose])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const mainW = Math.min(window.innerWidth - 380, 1180)
  const current = slides[idx]
  const next = slides[idx + 1]

  return (
    <div className="fixed inset-0 z-[200] bg-black text-white flex" data-testid="present-overlay">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {blank ? (
          <div className="w-full max-w-6xl aspect-video bg-black" />
        ) : (
          <div className="shadow-2xl">
            <SlideFace slide={current} theme={theme} width={mainW} />
          </div>
        )}
        <div className="mt-4 flex items-center gap-4 text-white/70 text-[13px]">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="p-1 hover:text-white disabled:opacity-30"><Icon name="chevron_left" size={26} /></button>
          <span className="tabular-nums">{idx + 1} / {slides.length}</span>
          <button onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1} className="p-1 hover:text-white disabled:opacity-30"><Icon name="chevron_right" size={26} /></button>
        </div>
      </div>

      <div className="w-[340px] shrink-0 border-l border-white/10 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] uppercase tracking-wide text-white/50">Presenter</span>
          <span className="tabular-nums text-[15px] font-semibold">{mm}:{ss}</span>
        </div>
        <div>
          <div className="text-[11px] text-white/50 mb-1">Next</div>
          {next ? (
            <div className="rounded overflow-hidden border border-white/10">
              <SlideFace slide={next} theme={theme} width={300} />
            </div>
          ) : (
            <div className="text-[12px] text-white/40">End of deck</div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="text-[11px] text-white/50 mb-1">Notes</div>
          <p className="text-[13px] whitespace-pre-wrap text-white/85">{current?.notes || 'No notes for this slide.'}</p>
        </div>
        <button onClick={onClose} className="text-[12px] text-white/60 hover:text-white inline-flex items-center gap-1"><Icon name="close" size={14} /> Exit (Esc)</button>
      </div>
    </div>
  )
}
