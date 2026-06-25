import { randomUUID } from 'crypto'
import { createTable, createRow } from './db/tables'
import { createReport } from './db/reports'
import { createFlow, updateFlow } from './db/flows'
import { createKnowledge } from './db/knowledge'
import type { FieldDefinition, SelectOption } from '@shared/fields'
import type { AppliedItem, ApplyTemplateResult } from '@shared/templates'

// PlexiMarketplace apply logic. Each built-in template builds real workspace
// objects through the same stores the app uses, so applying a template is exactly
// like the user creating those objects by hand. The starter rows are clearly the
// user's own data once created, added only by the explicit click that applies the
// template; nothing here seeds hidden or fake data behind the user's back.

function selectCol(id: string, label: string, options: string[]): FieldDefinition {
  const opts: SelectOption[] = options.map((o) => ({ id: o.toLowerCase().replace(/\s+/g, '-'), label: o }))
  return { id, type: 'single-select', label, config: { options: opts } } as FieldDefinition
}
function textCol(id: string, label: string): FieldDefinition {
  return { id, type: 'text-short', label, config: {} } as FieldDefinition
}
function numCol(id: string, label: string): FieldDefinition {
  return { id, type: 'number', label, config: {} } as FieldDefinition
}
function dateCol(id: string, label: string): FieldDefinition {
  return { id, type: 'date', label, config: {} } as FieldDefinition
}
function optId(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-')
}

function buildTable(title: string, columns: FieldDefinition[], rows: Record<string, unknown>[]): AppliedItem {
  const table = createTable({ taskId: null, title, schema: { columns } })
  for (const cells of rows) createRow({ tableId: table.id, cells })
  return { type: 'table', id: table.id, title: table.title }
}

export function applyTemplate(key: string): ApplyTemplateResult {
  const created: AppliedItem[] = []
  try {
    switch (key) {
      case 'sprint-board': {
        const cols = [textCol('task', 'Task'), selectCol('status', 'Status', ['Todo', 'Doing', 'Done']), textCol('owner', 'Owner')]
        created.push(
          buildTable('Sprint board', cols, [
            { task: 'Set up the project', status: optId('Done'), owner: 'You' },
            { task: 'Draft the first feature', status: optId('Doing'), owner: 'You' },
            { task: 'Plan the release', status: optId('Todo'), owner: 'You' }
          ])
        )
        break
      }
      case 'content-calendar': {
        const cols = [
          textCol('title', 'Title'),
          selectCol('channel', 'Channel', ['Blog', 'Email', 'Social']),
          dateCol('publish', 'Publish date'),
          selectCol('status', 'Status', ['Idea', 'Drafting', 'Scheduled', 'Published'])
        ]
        created.push(buildTable('Content calendar', cols, []))
        break
      }
      case 'client-tracker': {
        const cols = [
          textCol('client', 'Client'),
          selectCol('stage', 'Stage', ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost']),
          numCol('value', 'Value'),
          textCol('next', 'Next step')
        ]
        created.push(buildTable('Clients', cols, []))
        break
      }
      case 'weekly-report': {
        const table = buildTable('Work tracker', [textCol('item', 'Item'), selectCol('status', 'Status', ['Open', 'Done'])], [])
        created.push(table)
        const report = createReport({ title: 'Weekly status', sourceTableIds: [table.id], schedule: 'weekly' })
        created.push({ type: 'report', id: report.id, title: report.title })
        break
      }
      case 'daily-standup': {
        const flow = createFlow({ title: 'Daily standup' })
        updateFlow(flow.id, {
          trigger: { kind: 'schedule', every: 'daily' },
          actions: [
            { id: `a-${randomUUID()}`, type: 'ai-step', prompt: 'Write three short standup prompts to help me plan my day.' },
            { id: `a-${randomUUID()}`, type: 'create-task', title: 'Daily standup: {{ai}}' }
          ]
        })
        created.push({ type: 'flow', id: flow.id, title: 'Daily standup' })
        break
      }
      case 'team-wiki': {
        const a = createKnowledge({
          title: 'How we work',
          body: 'Describe how your team works here: meetings, working hours, where things live, and who owns what. The AI grounds its answers in this.'
        })
        const b = createKnowledge({
          title: 'Glossary',
          body: 'Define the terms, acronyms and product names your team uses, so new people and the AI share the same vocabulary.'
        })
        created.push({ type: 'knowledge', id: a.id, title: a.title })
        created.push({ type: 'knowledge', id: b.id, title: b.title })
        break
      }
      default:
        return { ok: false, created: [], error: 'Unknown template.' }
    }
    return { ok: true, created }
  } catch (err) {
    return { ok: false, created, error: err instanceof Error ? err.message : 'Could not apply the template.' }
  }
}
