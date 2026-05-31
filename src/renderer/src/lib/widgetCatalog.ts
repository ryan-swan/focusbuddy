import type { WidgetKind } from '@shared/types'

export type WidgetCategory = 'Notes' | 'Web' | 'Files' | 'Tools' | 'Comms' | 'Layout'

export interface WidgetCatalogEntry {
  kind: WidgetKind
  category: WidgetCategory
  label: string
  icon: string // Material Symbols icon name
  hint: string
  defaultWidth: number
  defaultHeight: number
  defaultContent: string
  urlPlaceholder?: string
  isWebBased: boolean
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    kind: 'sticky',
    category: 'Notes',
    label: 'Sticky',
    icon: 'sticky_note_2',
    hint: 'Small colored note pinned to the desk',
    defaultWidth: 240,
    defaultHeight: 200,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'note',
    category: 'Notes',
    label: 'Note',
    icon: 'description',
    hint: 'Larger paper for longer writing',
    defaultWidth: 360,
    defaultHeight: 280,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'markdown',
    category: 'Notes',
    label: 'Markdown',
    icon: 'subject',
    hint: 'Paste markdown — view as rich text, edit in source',
    defaultWidth: 460,
    defaultHeight: 360,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'local-app-launcher',
    category: 'Layout',
    label: 'App launcher',
    icon: 'desktop_mac',
    hint: 'One-click tile that launches a native Mac app — drag a Local app from the sidebar to create one',
    defaultWidth: 200,
    defaultHeight: 120,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'file',
    category: 'Files',
    label: 'File',
    icon: 'upload_file',
    hint: 'Drop any file onto the canvas to preview it — PDF, image, video, audio, anything',
    defaultWidth: 360,
    defaultHeight: 280,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'field',
    category: 'Tools',
    label: 'Field',
    icon: 'edit_note',
    hint: 'A single typed field — text, number, select, checkbox, attachment, button. Pick the type after creating.',
    defaultWidth: 240,
    defaultHeight: 100,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'page',
    category: 'Notes',
    label: 'Page',
    icon: 'description',
    hint: 'Notion-style document with headings, lists, todos, and slash-command AI prompts',
    defaultWidth: 480,
    defaultHeight: 400,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'table',
    category: 'Tools',
    label: 'Table',
    icon: 'table_chart',
    hint: 'Airtable-style database — rows + columns of typed fields',
    defaultWidth: 560,
    defaultHeight: 360,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'streamdeck',
    category: 'Tools',
    label: 'SpeedDeck',
    icon: 'apps',
    hint: 'Elgato-style 10×3 macro pad — launch apps, run macros, control media, organise with folders. Toggle between this-task and Universal scopes.',
    defaultWidth: 760,
    defaultHeight: 260,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'task-link',
    category: 'Layout',
    label: 'Task link',
    icon: 'link',
    hint: 'Reference another task on this canvas — drag a task from the sidebar onto the canvas to create one',
    defaultWidth: 280,
    defaultHeight: 110,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'webview',
    category: 'Web',
    label: 'Browser',
    icon: 'public',
    hint: 'Any URL — a focused browser tab for this task',
    defaultWidth: 560,
    defaultHeight: 400,
    defaultContent: '',
    urlPlaceholder: 'https://…',
    isWebBased: true
  },
  {
    kind: 'pdf',
    category: 'Files',
    label: 'PDF',
    icon: 'picture_as_pdf',
    hint: 'PDF document via URL',
    defaultWidth: 560,
    defaultHeight: 640,
    defaultContent: '',
    urlPlaceholder: 'https://…/file.pdf',
    isWebBased: true
  },
  {
    kind: 'gdoc',
    category: 'Files',
    label: 'Doc',
    icon: 'article',
    hint: 'Google Docs',
    defaultWidth: 600,
    defaultHeight: 500,
    defaultContent: '',
    urlPlaceholder: 'https://docs.google.com/document/…',
    isWebBased: true
  },
  {
    kind: 'gsheet',
    category: 'Files',
    label: 'Sheet',
    icon: 'table_chart',
    hint: 'Google Sheets',
    defaultWidth: 640,
    defaultHeight: 480,
    defaultContent: '',
    urlPlaceholder: 'https://docs.google.com/spreadsheets/…',
    isWebBased: true
  },
  {
    kind: 'gslide',
    category: 'Files',
    label: 'Slides',
    icon: 'slideshow',
    hint: 'Google Slides',
    defaultWidth: 640,
    defaultHeight: 420,
    defaultContent: '',
    urlPlaceholder: 'https://docs.google.com/presentation/…',
    isWebBased: true
  },
  {
    kind: 'email',
    category: 'Comms',
    label: 'Email',
    icon: 'mail',
    hint: 'Gmail / Outlook inbox view',
    defaultWidth: 600,
    defaultHeight: 500,
    defaultContent: 'https://mail.google.com/',
    urlPlaceholder: 'https://mail.google.com/ or any inbox URL',
    isWebBased: true
  },
  {
    kind: 'image',
    category: 'Files',
    label: 'Image',
    icon: 'image',
    hint: 'Image from URL (or right-click on a webpage image to save here)',
    defaultWidth: 360,
    defaultHeight: 280,
    defaultContent: '',
    urlPlaceholder: 'https://…/image.png',
    isWebBased: false
  },
  {
    kind: 'video',
    category: 'Files',
    label: 'Video',
    icon: 'movie',
    hint: 'Video from URL (mp4 / webm) — right-click webpage videos to save here',
    defaultWidth: 480,
    defaultHeight: 320,
    defaultContent: '',
    urlPlaceholder: 'https://…/video.mp4',
    isWebBased: false
  },
  {
    kind: 'calculator',
    category: 'Tools',
    label: 'Calc',
    icon: 'calculate',
    hint: 'Small inline calculator',
    defaultWidth: 240,
    defaultHeight: 320,
    defaultContent: '',
    isWebBased: false
  },
  {
    kind: 'color',
    category: 'Tools',
    label: 'Color',
    icon: 'palette',
    hint: 'Color picker + screen eyedropper',
    defaultWidth: 260,
    defaultHeight: 220,
    defaultContent: '#fbbf24',
    isWebBased: false
  },
  {
    kind: 'timer',
    category: 'Tools',
    label: 'Timer',
    icon: 'timer',
    hint: 'Countdown timer with audio cues — beeps as time runs out',
    defaultWidth: 280,
    defaultHeight: 280,
    defaultContent: JSON.stringify({ targetSec: 600, elapsedSec: 0, state: 'idle', startedAt: null }),
    isWebBased: false
  },
  {
    kind: 'section',
    category: 'Layout',
    label: 'Section',
    icon: 'crop_free',
    hint: 'A labeled frame to group widgets visually — renders behind everything',
    defaultWidth: 480,
    defaultHeight: 360,
    defaultContent: '',
    isWebBased: false
  }
]

export function catalogFor(kind: WidgetKind): WidgetCatalogEntry | null {
  return WIDGET_CATALOG.find((e) => e.kind === kind) ?? null
}

export const CATEGORIES: WidgetCategory[] = ['Notes', 'Web', 'Files', 'Tools', 'Comms', 'Layout']

export function entriesByCategory(): Record<WidgetCategory, WidgetCatalogEntry[]> {
  const out: Record<WidgetCategory, WidgetCatalogEntry[]> = {
    Notes: [],
    Web: [],
    Files: [],
    Tools: [],
    Comms: [],
    Layout: []
  }
  for (const entry of WIDGET_CATALOG) out[entry.category].push(entry)
  return out
}

export const DRAG_MIME = 'application/x-fb-widget-kind'
