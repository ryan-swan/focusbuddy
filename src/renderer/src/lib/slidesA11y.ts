// Accessibility checker for a PlexiSlides deck — the Slides counterpart to
// docA11y, so the "Check accessibility" feature spans apps. Pure: it inspects the
// deck's slides + elements and reports real issues (images with no alt text,
// slides with no title text) with the slide number. Honest — a clean deck returns
// an empty list, never a fabricated score.

import type { SlidesBody, Slide, SlideElement } from '@shared/types'
import type { A11yIssue } from './docA11y'

function slideHasTitle(slide: Slide): boolean {
  // A title is any non-empty text element, or the legacy title field.
  if (slide.title && slide.title.trim()) return true
  return (slide.elements ?? []).some(
    (el: SlideElement) =>
      el.type === 'text' && el.paragraphs.some((p) => p.runs.some((r) => (r.text ?? '').trim().length > 0))
  )
}

export function checkSlidesA11y(body: SlidesBody | undefined): A11yIssue[] {
  const issues: A11yIssue[] = []
  const slides = body?.slides ?? []
  let imagesMissingAlt = 0
  const titlelessSlides: number[] = []

  slides.forEach((slide, i) => {
    for (const el of slide.elements ?? []) {
      if (el.type === 'image' && !((el.alt ?? '').trim())) imagesMissingAlt++
    }
    if ((slide.elements?.length ?? 0) > 0 && !slideHasTitle(slide)) titlelessSlides.push(i + 1)
  })

  if (imagesMissingAlt > 0) {
    issues.push({
      severity: 'error',
      message: `${imagesMissingAlt} image${imagesMissingAlt === 1 ? '' : 's'} missing alt text — add a description in the inspector so screen readers can convey it.`
    })
  }
  if (titlelessSlides.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Slide${titlelessSlides.length === 1 ? '' : 's'} ${titlelessSlides.join(', ')} ${titlelessSlides.length === 1 ? 'has' : 'have'} no title text — a title helps navigation and screen-reader reading order.`
    })
  }
  return issues
}
