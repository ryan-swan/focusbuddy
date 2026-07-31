// The fullscreen home's capability row (Phase 3a.4, P8): an honest, static
// statement of what the assistant can act on TODAY. Every entry is backed by
// real ActionProposal kinds — the `kinds` field is typed against the union, so
// a capability the appliers cannot deliver fails typecheck rather than
// shipping as a fake connector toggle. Informational only; nothing here is a
// switch.

import type { ActionProposal } from '@shared/types'

export interface AssistantCapability {
  icon: string
  label: string
  // The real proposal kinds backing this capability — the honesty anchor.
  kinds: ActionProposal['kind'][]
}

export const ASSISTANT_CAPABILITIES: AssistantCapability[] = [
  { icon: 'mail', label: 'Drafts email', kinds: ['compose-mail'] },
  { icon: 'event', label: 'Schedules events', kinds: ['schedule-event'] },
  { icon: 'forum', label: 'Posts to chat', kinds: ['post-chat'] },
  {
    icon: 'description',
    label: 'Writes documents',
    kinds: ['create-document', 'generate-document', 'edit-document', 'create-page']
  },
  {
    icon: 'table_chart',
    label: 'Builds tables',
    kinds: ['create-table', 'add-table-row', 'set-cell']
  },
  {
    icon: 'space_dashboard',
    label: 'Arranges your desk',
    kinds: ['create-widget', 'update-widget', 'arrange-widgets', 'link-widgets']
  },
  {
    icon: 'checklist',
    label: 'Manages tasks',
    kinds: ['create-task', 'update-task', 'create-todo-list', 'toggle-todo-item']
  },
  { icon: 'smart_toy', label: 'Sets up desk agents', kinds: ['create-agent'] }
]
