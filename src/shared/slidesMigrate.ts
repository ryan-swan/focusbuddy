// Convert a legacy (v1) slides body into the v2 element model.
//
// A v1 slide was a title, a list of bullets, speaker notes and a coarse layout.
// migrateSlidesBody turns each into positioned text elements (a title box and,
// when there are bullets, a body box whose paragraphs are the bullets), tagged
// with style roles so the theme system can restyle them. The old fields are kept
// so the conversion is lossless and idempotent. v2 bodies pass through unchanged.

import type {
  Slide,
  SlideElement,
  SlidesBody,
  SlideTextElement,
  SlideTextParagraph
} from './types'
import { BUILTIN_THEMES, resolveTheme, SLIDE_W, SLIDE_H } from './slideThemes'

function isV2(body: SlidesBody): boolean {
  return body.schemaVersion === 2
}

let seq = 0
function id(): string {
  seq += 1
  return `mig-${seq}`
}

function titleElement(text: string, layout: Slide['layout'], theme = BUILTIN_THEMES[0]): SlideTextElement {
  const centered = layout === 'title' || layout === 'section'
  return {
    id: id(),
    type: 'text',
    x: centered ? 140 : 80,
    y: centered ? 280 : 60,
    w: centered ? 1000 : 1120,
    h: 130,
    z: 1,
    styleRole: 'title',
    fontFamily: theme.fontHeading,
    vAlign: centered ? 'middle' : 'top',
    paragraphs: [
      {
        runs: [{ text: text || 'Untitled', bold: true, color: theme.titleStyle.color, fontSize: theme.titleStyle.fontSize }],
        align: centered ? 'center' : 'left'
      }
    ]
  }
}

function bodyElement(bullets: string[], theme = BUILTIN_THEMES[0]): SlideTextElement {
  const paragraphs: SlideTextParagraph[] = bullets
    .filter((b) => b.trim() !== '')
    .map((b) => ({
      runs: [{ text: b, color: theme.bodyStyle.color, fontSize: theme.bodyStyle.fontSize }],
      align: 'left',
      bulletLevel: 0,
      listStyle: 'bullet'
    }))
  return {
    id: id(),
    type: 'text',
    x: 80,
    y: 210,
    w: 1120,
    h: 450,
    z: 2,
    styleRole: 'body',
    fontFamily: theme.fontBody,
    vAlign: 'top',
    paragraphs: paragraphs.length ? paragraphs : [{ runs: [{ text: '', fontSize: theme.bodyStyle.fontSize }], align: 'left' }]
  }
}

export function migrateSlide(slide: Slide): Slide {
  if (slide.elements && slide.elements.length >= 0 && slide.schemaVersion === 2) return slide
  const theme = BUILTIN_THEMES[0]
  const layout = slide.layout ?? 'title-content'
  const elements: SlideElement[] = [titleElement(slide.title ?? '', layout, theme)]
  const hasBullets = (slide.bullets ?? []).some((b) => b.trim() !== '')
  if (layout !== 'title' && layout !== 'section' && hasBullets) {
    elements.push(bodyElement(slide.bullets ?? [], theme))
  }
  return {
    ...slide,
    layout: layout === 'bullets' ? 'title-content' : layout,
    elements,
    transition: slide.transition ?? 'none',
    background: slide.background ?? { type: 'solid', color: theme.background },
    schemaVersion: 2
  }
}

export function migrateSlidesBody(body: SlidesBody): SlidesBody {
  if (isV2(body) && body.slides.every((s) => s.schemaVersion === 2)) return body
  return {
    ...body,
    slides: (body.slides ?? []).map(migrateSlide),
    theme: body.theme ?? resolveTheme(body.theme).id,
    schemaVersion: 2,
    size: body.size ?? { w: SLIDE_W, h: SLIDE_H }
  }
}
