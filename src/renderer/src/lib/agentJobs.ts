import type { AgentTrigger } from './deskAgent'

// One-click desk-agent jobs. Instead of facing a blank instruction box, the user
// picks a common job and the agent configures itself: a prewritten instruction,
// a matching built-in persona, and a sensible trigger. It is still created
// disabled, so the user reviews and turns it on. These map onto the built-in
// profiles in agentProfiles.ts (bi-*).
export interface AgentJob {
  id: string
  label: string
  icon: string
  blurb: string
  instruction: string
  profileId: string
  trigger: AgentTrigger
  intervalSec?: number
}

export const AGENT_JOBS: AgentJob[] = [
  {
    id: 'research',
    label: 'Research',
    icon: 'travel_explore',
    blurb: 'Look into what is wired in and summarise the key facts',
    instruction:
      'Research each item wired into me and add a concise, sourced summary of the key facts. Prefer primary sources and note anything uncertain.',
    profileId: 'bi-researcher',
    trigger: 'manual'
  },
  {
    id: 'monitor',
    label: 'Monitor',
    icon: 'radar',
    blurb: 'Watch the wired sources and flag what is new',
    instruction:
      'Watch the sources wired into me and flag anything new or important since the last run. Be brief: only surface real changes.',
    profileId: 'bi-generalist',
    trigger: 'interval',
    intervalSec: 3600
  },
  {
    id: 'summarise',
    label: 'Summarise',
    icon: 'summarize',
    blurb: 'Keep a running summary, updated on change',
    instruction:
      'Keep a running summary of everything wired into me. Update it whenever the wired content changes. Lead with the three most important points.',
    profileId: 'bi-writer',
    trigger: 'onChange'
  },
  {
    id: 'draft',
    label: 'Draft',
    icon: 'edit_note',
    blurb: 'Turn the wired context into a ready-to-edit draft',
    instruction:
      'Draft content (an email, a post, or a document section) from the context wired into me. Produce a clear, ready-to-edit draft. Never invent facts not present in the context.',
    profileId: 'bi-writer',
    trigger: 'manual'
  },
  {
    id: 'enrich',
    label: 'Enrich a table',
    icon: 'table_rows',
    blurb: 'Fill in missing fields in the wired table',
    instruction:
      'For each row in the table wired into me, fill in the empty fields using research. Only fill fields you can support; leave a field blank rather than guessing.',
    profileId: 'bi-data',
    trigger: 'manual'
  }
]
