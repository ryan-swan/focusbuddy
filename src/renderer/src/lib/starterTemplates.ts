import type { Template, TemplateWidget } from '@shared/types'

// Built-in starter templates — curated, pre-wired desks a brand-new user (with
// an empty workspace and no saved templates of their own) can drop in one click.
// They make a blank canvas instantly useful and quietly show off the deeper
// widgets. Shaped exactly like a user Template so the existing apply path
// (NewNodeDialog submit / Sidebar applyTemplate) spawns their widgets unchanged.
//
// Kept to self-contained widget kinds only — sticky, note, markdown, page,
// webview, timer, mindmap, card, section — so every widget works the moment it
// lands, with no backing table/document/file to resolve. `createdAt: 0` and the
// `starter-` id prefix mark them as built-in.

const POMODORO = JSON.stringify({ targetSec: 1500, elapsedSec: 0, state: 'idle', startedAt: null })

function w(
  kind: TemplateWidget['kind'],
  title: string,
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string | null = null
): TemplateWidget {
  return { kind, title, content, x, y, width, height, color }
}

const STICKY = '#fef08a'

export const STARTER_TEMPLATES: Template[] = [
  {
    id: 'starter-daily-focus',
    name: 'Daily Focus',
    description: 'Top three for today, a focus timer, and a running log.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('sticky', '', 'Top 3 today\n1.\n2.\n3.', 60, 60, 280, 240, STICKY),
      w('timer', '', POMODORO, 380, 60, 224, 224),
      w('note', 'Notes & log', '', 60, 330, 544, 300)
    ]
  },
  {
    id: 'starter-project-hub',
    name: 'Project Hub',
    description: 'A brief, goals, risks, and a decisions log to run a project.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('page', 'Brief', '', 60, 80, 480, 420),
      w('sticky', '', 'Goals\n• ', 580, 80, 260, 200, STICKY),
      w('sticky', '', 'Risks / blockers\n• ', 580, 300, 260, 200, '#fecaca'),
      w('note', 'Decisions log', '', 60, 520, 480, 260)
    ]
  },
  {
    id: 'starter-research',
    name: 'Research',
    description: 'A browser, a findings doc, sources, and open questions.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('webview', 'Browser', '', 60, 60, 760, 520),
      w('page', 'Findings', '', 840, 60, 460, 360),
      w('sticky', '', 'Open questions\n• ', 840, 440, 260, 200, STICKY),
      w('markdown', 'Sources', '', 60, 600, 460, 280)
    ]
  },
  {
    id: 'starter-writing',
    name: 'Writing',
    description: 'A roomy draft with an outline and an ideas/cuts board beside it.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('page', 'Draft', '', 60, 60, 640, 640),
      w('sticky', '', 'Outline\n• ', 730, 60, 260, 300, STICKY),
      w('sticky', '', 'Ideas / cuts\n• ', 730, 390, 260, 300, '#bfdbfe')
    ]
  },
  {
    id: 'starter-weekly-plan',
    name: 'Weekly Plan',
    description: 'Priorities, a Mon–Fri plan, a timer, and a wins/reflection note.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('sticky', '', "This week's priorities\n1.\n2.\n3.", 60, 60, 280, 240, STICKY),
      w('note', 'Mon–Fri plan', '', 380, 60, 520, 320),
      w('timer', '', POMODORO, 940, 60, 224, 224),
      w('sticky', '', 'Wins / reflection\n• ', 380, 410, 280, 220, '#bbf7d0')
    ]
  },
  {
    id: 'starter-brainstorm',
    name: 'Brainstorm',
    description: 'A mind map to explore an idea, with seed and wild-ideas notes.',
    sourceTaskId: null,
    createdAt: 0,
    widgets: [
      w('mindmap', 'Mind map', '', 60, 60, 760, 520),
      w('sticky', '', 'Seed idea', 840, 60, 260, 180, STICKY),
      w('sticky', '', 'Wild ideas\n• ', 840, 260, 260, 320, '#e9d5ff')
    ]
  }
]

export function findStarterTemplate(id: string): Template | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id)
}
