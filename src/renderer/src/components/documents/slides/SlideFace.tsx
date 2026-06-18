// Renders a whole slide at an arbitrary display width by drawing a fixed
// 1280x720 logical stage and CSS-scaling it. One component serves the thumbnail
// rail, the editor preview, present mode and the export render, so everything
// looks identical. Falls back to the legacy title/bullets shape if a slide
// somehow has no elements.

import { useEffect } from 'react'
import type { DeckTheme, Slide } from '@shared/types'
import { SLIDE_W, SLIDE_H } from '@shared/slideThemes'
import SlideElementView from './SlideElementView'
import { loadGoogleFont, familyLabel } from '../../../lib/googleFonts'

interface Props {
  slide: Slide
  theme: DeckTheme
  width: number
}

export default function SlideFace({ slide, theme, width }: Props): JSX.Element {
  const scale = width / SLIDE_W
  const height = width * (SLIDE_H / SLIDE_W)
  const bg = slide.background?.type === 'solid' ? slide.background.color : theme.background
  const elements = (slide.elements ?? []).slice().sort((a, b) => a.z - b.z)

  // Load any Google fonts the slide's text elements (and the theme) use.
  useEffect(() => {
    loadGoogleFont(familyLabel(theme.fontHeading))
    loadGoogleFont(familyLabel(theme.fontBody))
    for (const el of elements) if (el.type === 'text' && el.fontFamily) loadGoogleFont(familyLabel(el.fontFamily))
  })

  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: bg }}>
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
        {elements.length > 0 ? (
          elements.map((el) => <SlideElementView key={el.id} el={el} />)
        ) : (
          // Legacy fallback for an unmigrated slide.
          <div style={{ padding: 80 }}>
            <div style={{ fontSize: theme.titleStyle.fontSize, fontWeight: 700 }}>{slide.title}</div>
            <ul style={{ marginTop: 24, fontSize: theme.bodyStyle.fontSize }}>
              {(slide.bullets ?? []).filter((b) => b.trim()).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
