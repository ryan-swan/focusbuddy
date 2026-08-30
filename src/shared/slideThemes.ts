// Deck themes and slide layout presets.
//
// A theme defines the deck's background, font pairing, accent and default title/
// body text styles. Layout presets return the placeholder elements for a slide
// kind at standard positions in the 1280x720 logical space, each tagged with a
// styleRole so applyThemeToDeck can restyle them without touching user-customized
// elements.

import type {
  DeckTheme,
  Slide,
  SlideElement,
  SlideLayout,
  SlidesBody,
  SlideTextElement
} from './types'

export const SLIDE_W = 1280
export const SLIDE_H = 720

export const BUILTIN_THEMES: DeckTheme[] = [
  {
    id: 'plexi-default',
    name: 'Plexii',
    background: '#ffffff',
    fontHeading: 'Inter, system-ui, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    accent: '#6d5dfc',
    textColor: '#1c1917',
    titleStyle: { fontSize: 54, bold: true, color: '#1c1917' },
    bodyStyle: { fontSize: 26, color: '#44403c' }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: '#0f172a',
    fontHeading: 'Inter, system-ui, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    accent: '#38bdf8',
    textColor: '#e2e8f0',
    titleStyle: { fontSize: 54, bold: true, color: '#f8fafc' },
    bodyStyle: { fontSize: 26, color: '#cbd5e1' }
  },
  {
    id: 'editorial',
    name: 'Editorial',
    background: '#fdfaf3',
    fontHeading: 'Georgia, "Times New Roman", serif',
    fontBody: 'Georgia, "Times New Roman", serif',
    accent: '#b45309',
    textColor: '#292524',
    titleStyle: { fontSize: 52, bold: true, color: '#1c1917' },
    bodyStyle: { fontSize: 26, color: '#44403c' }
  },
  {
    id: 'bold',
    name: 'Bold',
    background: '#6d5dfc',
    fontHeading: 'Inter, system-ui, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    accent: '#fde047',
    textColor: '#ffffff',
    titleStyle: { fontSize: 58, bold: true, color: '#ffffff' },
    bodyStyle: { fontSize: 26, color: '#f5f3ff' }
  },
  {
    id: 'mono',
    name: 'Mono',
    background: '#fafaf9',
    fontHeading: '"JetBrains Mono", ui-monospace, monospace',
    fontBody: '"JetBrains Mono", ui-monospace, monospace',
    accent: '#0d9488',
    textColor: '#1c1917',
    titleStyle: { fontSize: 46, bold: true, color: '#0f766e' },
    bodyStyle: { fontSize: 24, color: '#292524' }
  }
]

export function resolveTheme(theme: DeckTheme | string | undefined): DeckTheme {
  if (theme && typeof theme === 'object') return theme
  return BUILTIN_THEMES.find((t) => t.id === theme) ?? BUILTIN_THEMES[0]
}

let elSeq = 0
function elId(): string {
  elSeq += 1
  return `el-${elSeq}-${elSeq.toString(36)}`
}

function titleEl(theme: DeckTheme, x: number, y: number, w: number, h: number, text = 'Title'): SlideTextElement {
  return {
    id: elId(),
    type: 'text',
    x,
    y,
    w,
    h,
    z: 1,
    styleRole: 'title',
    paragraphs: [{ runs: [{ text, bold: theme.titleStyle.bold, color: theme.titleStyle.color, fontSize: theme.titleStyle.fontSize }], align: 'left' }],
    fontFamily: theme.fontHeading,
    vAlign: 'middle'
  }
}
function bodyEl(theme: DeckTheme, x: number, y: number, w: number, h: number): SlideTextElement {
  return {
    id: elId(),
    type: 'text',
    x,
    y,
    w,
    h,
    z: 2,
    styleRole: 'body',
    paragraphs: [{ runs: [{ text: 'Body text', fontSize: theme.bodyStyle.fontSize, color: theme.bodyStyle.color }], align: 'left', bulletLevel: 0, listStyle: 'bullet' }],
    fontFamily: theme.fontBody,
    vAlign: 'top'
  }
}

// The placeholder elements for a layout, themed.
export function layoutElements(layout: SlideLayout, theme: DeckTheme): SlideElement[] {
  switch (layout) {
    case 'title':
      return [titleEl(theme, 140, 250, 1000, 140, 'Presentation title'), bodyEl(theme, 140, 400, 1000, 80)]
    case 'section':
      return [titleEl(theme, 140, 300, 1000, 140, 'Section')]
    case 'two-content':
      return [
        titleEl(theme, 80, 60, 1120, 110),
        bodyEl(theme, 80, 200, 540, 460),
        bodyEl(theme, 660, 200, 540, 460)
      ]
    case 'image-caption':
      return [titleEl(theme, 80, 60, 1120, 100), bodyEl(theme, 80, 580, 1120, 90)]
    case 'blank':
      return []
    case 'title-content':
    case 'bullets':
    default:
      return [titleEl(theme, 80, 60, 1120, 110), bodyEl(theme, 80, 200, 1120, 460)]
  }
}

// Restyle every theme-derived (role-tagged) element across the deck, leaving
// user-customized elements untouched.
export function applyThemeToDeck(body: SlidesBody, theme: DeckTheme): SlidesBody {
  const slides: Slide[] = body.slides.map((s) => ({
    ...s,
    background: { type: 'solid', color: theme.background },
    elements: (s.elements ?? []).map((el) => {
      if (el.type !== 'text' || !el.styleRole) return el
      const style = el.styleRole === 'title' ? theme.titleStyle : theme.bodyStyle
      return {
        ...el,
        fontFamily: el.styleRole === 'title' ? theme.fontHeading : theme.fontBody,
        paragraphs: el.paragraphs.map((p) => ({
          ...p,
          runs: p.runs.map((r) => ({
            ...r,
            color: style.color,
            fontSize: style.fontSize,
            bold: el.styleRole === 'title' ? theme.titleStyle.bold : r.bold
          }))
        }))
      }
    })
  }))
  return { ...body, slides, theme: theme.id }
}
