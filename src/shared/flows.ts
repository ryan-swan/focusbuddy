// Shared PlexiFlow types. A flow is a trigger plus an ordered list of actions
// across your workspace: create a task, add a table row, send an email, write a
// knowledge entry, or run an AI step whose output later steps can reuse. Triggers
// are manual or scheduled. The engine runs the actions in order and records an
// honest per-step log, so a failed email or a missing AI key shows as a failed
// step, never a fabricated success.

export type FlowScheduleEvery = 'daily' | 'weekly' | 'monthly'

export type FlowTrigger = { kind: 'manual' } | { kind: 'schedule'; every: FlowScheduleEvery }

export type FlowAction =
  | { id: string; type: 'create-task'; title: string }
  | { id: string; type: 'add-table-row'; tableId: string }
  | { id: string; type: 'send-email'; to: string; subject: string; body: string }
  | { id: string; type: 'create-knowledge'; title: string; body: string }
  | { id: string; type: 'ai-step'; prompt: string }

export type FlowActionType = FlowAction['type']

export interface FlowRunStep {
  actionId: string
  type: FlowActionType
  ok: boolean
  // A short, honest message: what happened or why it failed.
  message: string
}

export interface FlowRunResult {
  ok: boolean
  steps: FlowRunStep[]
}

export interface FlowDef {
  id: string
  title: string
  enabled: boolean
  trigger: FlowTrigger
  actions: FlowAction[]
  lastRunAt: number | null
  lastStatus: 'ok' | 'error' | null
  lastLog: FlowRunStep[]
  nextRunAt: number | null
  createdAt: number
  updatedAt: number
}

export interface FlowDraft {
  title: string
}

export interface FlowPatch {
  title?: string
  enabled?: boolean
  trigger?: FlowTrigger
  actions?: FlowAction[]
}

// A blank action of the given type, for the builder's "add step".
export function blankAction(type: FlowActionType, id: string): FlowAction {
  switch (type) {
    case 'create-task':
      return { id, type, title: '' }
    case 'add-table-row':
      return { id, type, tableId: '' }
    case 'send-email':
      return { id, type, to: '', subject: '', body: '' }
    case 'create-knowledge':
      return { id, type, title: '', body: '' }
    case 'ai-step':
      return { id, type, prompt: '' }
  }
}

export const ACTION_LABELS: Record<FlowActionType, string> = {
  'create-task': 'Create a task',
  'add-table-row': 'Add a table row',
  'send-email': 'Send an email',
  'create-knowledge': 'Add a knowledge entry',
  'ai-step': 'Run an AI step'
}
