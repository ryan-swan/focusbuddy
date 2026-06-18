// Starter slide templates. Unlike the bare layout presets in slideThemes.ts
// (which only drop empty title/body placeholders), a template is a fully
// composed slide: headings, body copy, accent shapes and placeholders arranged
// in the 1280x720 logical space and coloured from the active theme. Text that
// maps to the theme's title/body roles is tagged with styleRole so a later
// theme change restyles it; bespoke text (a big stat, a quote) is left untagged
// so it keeps its deliberate look.

import type { DeckTheme, SlideElement, SlideShapeElement, SlideTextElement, SlideTextParagraph, SlideTextRun } from './types'

let seq = 0
function tid(): string {
  seq += 1
  return `tpl-${seq}-${seq.toString(36)}`
}

interface TextOpts {
  z?: number
  role?: 'title' | 'body'
  font?: string
  align?: 'left' | 'center' | 'right'
  vAlign?: 'top' | 'middle' | 'bottom'
  listStyle?: 'bullet' | 'number' | 'none'
}

function text(x: number, y: number, w: number, h: number, runs: SlideTextRun[], opts: TextOpts = {}): SlideTextElement {
  return {
    id: tid(),
    type: 'text',
    x,
    y,
    w,
    h,
    z: opts.z ?? 2,
    styleRole: opts.role,
    fontFamily: opts.font,
    vAlign: opts.vAlign ?? 'top',
    paragraphs: [{ runs, align: opts.align ?? 'left', listStyle: opts.listStyle }]
  }
}

function bullets(x: number, y: number, w: number, h: number, items: string[], theme: DeckTheme, listStyle: 'bullet' | 'number'): SlideTextElement {
  const paragraphs: SlideTextParagraph[] = items.map((t) => ({
    runs: [{ text: t, fontSize: theme.bodyStyle.fontSize, color: theme.bodyStyle.color }],
    align: 'left',
    listStyle
  }))
  return { id: tid(), type: 'text', x, y, w, h, z: 2, styleRole: 'body', fontFamily: theme.fontBody, vAlign: 'top', paragraphs }
}

function rect(x: number, y: number, w: number, h: number, color: string, z = 1, round = false): SlideShapeElement {
  return { id: tid(), type: 'shape', shape: round ? 'roundRect' : 'rect', x, y, w, h, z, fill: { type: 'solid', color } }
}

function titleEl(theme: DeckTheme, x: number, y: number, w: number, h: number, t: string, vAlign: 'top' | 'middle' = 'top'): SlideTextElement {
  return text(x, y, w, h, [{ text: t, bold: theme.titleStyle.bold, fontSize: theme.titleStyle.fontSize, color: theme.titleStyle.color }], {
    role: 'title',
    font: theme.fontHeading,
    vAlign,
    z: 3
  })
}

export interface SlideTemplate {
  id: string
  name: string
  description: string
  build: (theme: DeckTheme) => SlideElement[]
}

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  {
    id: 'cover',
    name: 'Cover',
    description: 'Big title with an accent bar and a subtitle',
    build: (t) => [
      rect(140, 232, 84, 10, t.accent),
      titleEl(t, 140, 256, 1000, 130, 'Presentation title', 'middle'),
      text(140, 402, 1000, 70, [{ text: 'Subtitle, author or date', fontSize: t.bodyStyle.fontSize, color: t.bodyStyle.color }], { role: 'body', font: t.fontBody })
    ]
  },
  {
    id: 'section',
    name: 'Section',
    description: 'A divider between parts of the deck',
    build: (t) => [rect(120, 300, 16, 140, t.accent), titleEl(t, 156, 300, 1000, 140, 'Section title', 'middle')]
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'A numbered list of what is coming',
    build: (t) => [
      titleEl(t, 80, 60, 1120, 100, 'Agenda'),
      bullets(80, 190, 1120, 460, ['Where we are today', 'The opportunity', 'Our approach', 'What we need from you'], t, 'number')
    ]
  },
  {
    id: 'bullets',
    name: 'Title + bullets',
    description: 'A heading with a bulleted body',
    build: (t) => [
      titleEl(t, 80, 60, 1120, 110, 'Slide title'),
      bullets(80, 200, 1120, 460, ['First key point', 'Second key point', 'Third key point'], t, 'bullet')
    ]
  },
  {
    id: 'comparison',
    name: 'Comparison',
    description: 'Two columns side by side',
    build: (t) => [
      titleEl(t, 80, 50, 1120, 90, 'Compare the options'),
      rect(80, 170, 540, 64, t.accent, 1, true),
      text(80, 170, 540, 64, [{ text: 'Option A', bold: true, fontSize: 24, color: '#ffffff' }], { align: 'center', vAlign: 'middle', font: t.fontHeading, z: 4 }),
      bullets(96, 256, 508, 384, ['Benefit one', 'Benefit two', 'Benefit three'], t, 'bullet'),
      rect(660, 170, 540, 64, t.accent, 1, true),
      text(660, 170, 540, 64, [{ text: 'Option B', bold: true, fontSize: 24, color: '#ffffff' }], { align: 'center', vAlign: 'middle', font: t.fontHeading, z: 4 }),
      bullets(676, 256, 508, 384, ['Benefit one', 'Benefit two', 'Benefit three'], t, 'bullet')
    ]
  },
  {
    id: 'bignumber',
    name: 'Big number',
    description: 'A single statistic with a caption',
    build: (t) => [
      text(140, 180, 1000, 220, [{ text: '87%', bold: true, fontSize: 168, color: t.accent }], { vAlign: 'middle', font: t.fontHeading, z: 3 }),
      text(140, 420, 1000, 130, [{ text: 'Explain what this number means and why it matters', fontSize: t.bodyStyle.fontSize + 6, color: t.textColor }], { font: t.fontBody, z: 2 })
    ]
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'A pull quote with attribution',
    build: (t) => [
      text(116, 110, 220, 180, [{ text: '“', bold: true, fontSize: 200, color: t.accent }], { font: t.fontHeading, vAlign: 'top', z: 1 }),
      text(180, 250, 920, 230, [{ text: 'A memorable line that captures the single idea of this slide.', italic: true, fontSize: 40, color: t.textColor }], { font: t.fontHeading, z: 2 }),
      text(180, 498, 920, 60, [{ text: '— Name, role', fontSize: t.bodyStyle.fontSize, color: t.bodyStyle.color }], { font: t.fontBody, z: 2 })
    ]
  },
  {
    id: 'image-caption',
    name: 'Image + caption',
    description: 'A large image placeholder with a caption',
    build: (t) => [
      titleEl(t, 80, 48, 1120, 80, 'Title'),
      rect(80, 146, 1120, 446, '#e7e5e4'),
      text(80, 146, 1120, 446, [{ text: 'Insert an image here using Image in the toolbar', fontSize: 22, color: '#78716c' }], { align: 'center', vAlign: 'middle', z: 2 }),
      text(80, 606, 1120, 70, [{ text: 'Caption for the image above', fontSize: t.bodyStyle.fontSize, color: t.bodyStyle.color }], { role: 'body', font: t.fontBody })
    ]
  },
  {
    id: 'closing',
    name: 'Closing',
    description: 'A thank-you slide to end on',
    build: (t) => [
      titleEl(t, 140, 270, 1000, 150, 'Thank you', 'middle'),
      text(140, 430, 1000, 70, [{ text: 'Questions? you@example.com', fontSize: t.bodyStyle.fontSize, color: t.bodyStyle.color }], { role: 'body', font: t.fontBody })
    ]
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from nothing',
    build: () => []
  }
]
