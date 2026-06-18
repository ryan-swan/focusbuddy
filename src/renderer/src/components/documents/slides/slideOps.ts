// Pure element operations on a slide. Every function returns a new Slide so the
// editor can snapshot for undo and React diffs cheaply.

import type {
  Slide,
  SlideElement,
  SlideTextElement,
  SlideTextParagraph
} from '@shared/types'

let seq = 0
export function elementId(): string {
  seq += 1
  return `el-${Date.now().toString(36)}-${seq}`
}

export function addElement(slide: Slide, el: SlideElement): Slide {
  return { ...slide, elements: [...(slide.elements ?? []), el] }
}

export function updateElement(slide: Slide, id: string, patch: Partial<SlideElement>): Slide {
  return {
    ...slide,
    elements: (slide.elements ?? []).map((e) => (e.id === id ? ({ ...e, ...patch } as SlideElement) : e))
  }
}

export function deleteElement(slide: Slide, id: string): Slide {
  return { ...slide, elements: (slide.elements ?? []).filter((e) => e.id !== id) }
}

export function duplicateElement(slide: Slide, id: string): { slide: Slide; newId: string } {
  const el = (slide.elements ?? []).find((e) => e.id === id)
  if (!el) return { slide, newId: id }
  const newId = elementId()
  const copy = { ...el, id: newId, x: el.x + 20, y: el.y + 20 } as SlideElement
  return { slide: { ...slide, elements: [...(slide.elements ?? []), copy] }, newId }
}

// Bring an element forward or back by swapping z with its neighbour.
export function reorderZ(slide: Slide, id: string, dir: 'forward' | 'back' | 'front' | 'backmost'): Slide {
  const els = [...(slide.elements ?? [])].sort((a, b) => a.z - b.z)
  const i = els.findIndex((e) => e.id === id)
  if (i === -1) return slide
  if (dir === 'front') els[i].z = Math.max(...els.map((e) => e.z)) + 1
  else if (dir === 'backmost') els[i].z = Math.min(...els.map((e) => e.z)) - 1
  else {
    const j = dir === 'forward' ? i + 1 : i - 1
    if (j < 0 || j >= els.length) return slide
    const tmp = els[i].z
    els[i].z = els[j].z
    els[j].z = tmp
  }
  return { ...slide, elements: els }
}

// The plaintext of a text element, one paragraph per line.
export function elementText(el: SlideTextElement): string {
  return el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
}

// Replace a text element's text from plain lines, preserving the first run's
// styling and each paragraph's list/align settings where possible.
export function setElementText(el: SlideTextElement, text: string): SlideTextElement {
  const lines = text.split('\n')
  const sample = el.paragraphs[0]?.runs[0] ?? {}
  const paragraphs: SlideTextParagraph[] = lines.map((line, i) => ({
    runs: [{ ...sample, text: line }],
    align: el.paragraphs[i]?.align ?? el.paragraphs[0]?.align,
    bulletLevel: el.paragraphs[i]?.bulletLevel ?? el.paragraphs[0]?.bulletLevel,
    listStyle: el.paragraphs[i]?.listStyle ?? el.paragraphs[0]?.listStyle
  }))
  return { ...el, paragraphs: paragraphs.length ? paragraphs : [{ runs: [{ ...sample, text: '' }] }] }
}

// Apply a run-style patch (bold/italic/size/color) to every run of a text
// element. Element-level styling — mixed per-run styling is a later iteration.
export function styleTextElement(
  el: SlideTextElement,
  patch: Partial<{ bold: boolean; italic: boolean; underline: boolean; color: string; fontSize: number }>
): SlideTextElement {
  return {
    ...el,
    paragraphs: el.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, ...patch })) }))
  }
}

export function setParagraphAlign(el: SlideTextElement, align: 'left' | 'center' | 'right'): SlideTextElement {
  return { ...el, paragraphs: el.paragraphs.map((p) => ({ ...p, align })) }
}

export function setListStyle(el: SlideTextElement, listStyle: 'bullet' | 'number' | 'none'): SlideTextElement {
  return { ...el, paragraphs: el.paragraphs.map((p) => ({ ...p, listStyle })) }
}
