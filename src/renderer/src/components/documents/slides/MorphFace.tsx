// The Morph transition: render the incoming slide, but any element that also
// existed on the previous slide (matched by id) starts at its previous geometry
// and CSS-tweens to its new one, so shared objects glide/resize/rotate between
// slides. New elements fade in. This is the PowerPoint "Morph" effect, and it is
// pure DOM (no library) so it works in present mode and export-preview alike.

import { useEffect, useState } from 'react'
import type { DeckTheme, Slide } from '@shared/types'
import { SLIDE_W, SLIDE_H } from '@shared/slideThemes'
import { morphPairs, geomOf } from '@shared/slideAnim'
import SlideElementView from './SlideElementView'

const MORPH_MS = 600

export default function MorphFace({
  prev,
  cur,
  theme,
  width
}: {
  prev: Slide
  cur: Slide
  theme: DeckTheme
  width: number
}): JSX.Element {
  // Two frames: mount at the "from" geometry, then flip to "to" so CSS transitions.
  const [phase, setPhase] = useState<'from' | 'to'>('from')
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('to')))
    return () => cancelAnimationFrame(id)
  }, [])

  const scale = width / SLIDE_W
  const height = width * (SLIDE_H / SLIDE_W)
  const bg = cur.background?.type === 'solid' ? cur.background.color : theme.background
  const pairs = morphPairs(prev, cur)
  const prevById = new Map((prev.elements ?? []).map((e) => [e.id, e]))
  const els = (cur.elements ?? []).slice().sort((a, b) => a.z - b.z)

  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: bg }} data-testid="slide-morph">
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          color: theme.textColor
        }}
      >
        {els.map((el) => {
          if (pairs.has(el.id)) {
            const g = phase === 'from' ? geomOf(prevById.get(el.id)!) : geomOf(el)
            return (
              <SlideElementView
                key={el.id}
                el={{ ...el, x: g.x, y: g.y, w: g.w, h: g.h, opacity: g.opacity, rotation: g.rotation }}
                transitionMs={MORPH_MS}
              />
            )
          }
          // An element unique to the incoming slide fades in.
          const opacity = phase === 'from' ? 0 : el.opacity ?? 1
          return <SlideElementView key={el.id} el={{ ...el, opacity }} transitionMs={MORPH_MS} />
        })}
      </div>
    </div>
  )
}
