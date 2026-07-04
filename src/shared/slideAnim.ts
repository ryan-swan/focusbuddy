// Pure helpers for slide transitions and element entrance animations, plus the
// keyframes CSS both share. Kept free of React/Electron so the timing logic is
// unit-testable and the same rules drive present mode and any preview.

import type { SlideTransition, SlideAnim, Slide, SlideElement } from './types'

const ENTRANCE_DEFAULT_MS = 450
const STAGGER_MS = 120
const EASE = 'cubic-bezier(0.22,1,0.36,1)'

const ENTRANCE_KEYFRAME: Record<SlideAnim['type'], string> = {
  fadeIn: 'plexiFadeIn',
  slideUp: 'plexiSlideUp',
  slideLeft: 'plexiSlideLeft',
  zoomIn: 'plexiZoomIn'
}

// The CSS `animation` shorthand for an element's entrance, or undefined when it
// has none. `index` provides a default stagger when the anim has no explicit order.
export function entranceAnimationCss(anim: SlideAnim | undefined, index: number): string | undefined {
  if (!anim) return undefined
  const name = ENTRANCE_KEYFRAME[anim.type]
  if (!name) return undefined
  const dur = Math.max(0, anim.durationMs ?? ENTRANCE_DEFAULT_MS)
  const delay = Math.max(0, (anim.order ?? index)) * STAGGER_MS
  return `${name} ${dur}ms ${delay}ms both ${EASE}`
}

// The CSS `animation` shorthand applied to the whole slide when it enters. Morph
// is handled by a dedicated component (matched-element tween), so it returns
// undefined here, as does 'none'.
export function slideTransitionCss(t: SlideTransition | undefined): string | undefined {
  switch (t) {
    case 'fade':
      return `plexiFadeIn 400ms both ease`
    case 'slide':
      return `plexiSlideLeft 420ms both ${EASE}`
    case 'zoom':
      return `plexiZoomIn 420ms both ${EASE}`
    default:
      return undefined
  }
}

// Ids present on BOTH slides — the elements a Morph transition tweens between.
export function morphPairs(prev: Slide | undefined, cur: Slide): Set<string> {
  if (!prev) return new Set()
  const prevIds = new Set((prev.elements ?? []).map((e) => e.id))
  const out = new Set<string>()
  for (const e of cur.elements ?? []) if (prevIds.has(e.id)) out.add(e.id)
  return out
}

// The geometry a morph interpolates for one element.
export interface MorphGeom {
  x: number
  y: number
  w: number
  h: number
  opacity?: number
  rotation?: number
}
export function geomOf(el: SlideElement): MorphGeom {
  return { x: el.x, y: el.y, w: el.w, h: el.h, opacity: el.opacity, rotation: el.rotation }
}

// The keyframes both entrance animations and slide transitions reference. Inject
// once where animations play (present mode).
export const ANIM_KEYFRAMES_CSS = `
@keyframes plexiFadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes plexiSlideUp { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: none } }
@keyframes plexiSlideLeft { from { opacity: 0; transform: translateX(44px) } to { opacity: 1; transform: none } }
@keyframes plexiZoomIn { from { opacity: 0; transform: scale(0.86) } to { opacity: 1; transform: none } }
`
