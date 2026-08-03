// Shared PlexiMarketplace template metadata. These are the built-in starter
// templates the gallery shows. Applying one creates real workspace objects (the
// build logic lives in main/templates.ts); this is just the display data plus the
// honest list of what each one adds, so the user knows before they click.

export type TemplateCategory = 'Tables' | 'Reports' | 'Automations' | 'Knowledge'

export interface TemplateMeta {
  key: string
  name: string
  description: string
  icon: string
  category: TemplateCategory
  // Plain list of what applying this template adds to the workspace.
  creates: string[]
}

export interface AppliedItem {
  type: 'table' | 'report' | 'flow' | 'knowledge'
  id: string
  title: string
}

export interface ApplyTemplateResult {
  ok: boolean
  created: AppliedItem[]
  error?: string
}

export const TEMPLATES: TemplateMeta[] = [
  {
    key: 'sprint-board',
    name: 'Sprint board',
    description: 'A task table with a status column, ready for a kanban view, plus a few starter rows.',
    icon: 'view_kanban',
    category: 'Tables',
    creates: ['A "Sprint board" table with Task, Status and Owner columns', 'Three example rows you can edit or delete']
  },
  {
    key: 'content-calendar',
    name: 'Content calendar',
    description: 'Plan posts across channels with a publish date and a status.',
    icon: 'calendar_month',
    category: 'Tables',
    creates: ['A "Content calendar" table with Title, Channel, Publish date and Status']
  },
  {
    key: 'client-tracker',
    name: 'Client tracker',
    description: 'A lightweight CRM table to track clients through stages.',
    icon: 'contacts',
    category: 'Tables',
    creates: ['A "Clients" table with Client, Stage, Value and Next step columns']
  },
  {
    key: 'weekly-report',
    name: 'Weekly status report',
    description: 'A report over a new tracker table, set to generate weekly.',
    icon: 'summarize',
    category: 'Reports',
    creates: ['A "Work tracker" table', 'A "Weekly status" report over it, scheduled weekly']
  },
  {
    key: 'daily-standup',
    name: 'Daily standup flow',
    description: 'A scheduled flow that drafts a standup prompt with AI and creates a task for it.',
    icon: 'bolt',
    category: 'Automations',
    creates: ['A "Daily standup" flow with an AI step and a create-task step, scheduled daily']
  },
  {
    key: 'team-wiki',
    name: 'Team wiki starter',
    description: 'Two starter knowledge entries the AI can ground its answers in.',
    icon: 'neurology',
    category: 'Knowledge',
    creates: ['A "How we work" knowledge entry', 'A "Glossary" knowledge entry']
  }
]
