import { create } from 'zustand'
import { LIBRARY_PROFILES } from './agentProfileLibrary'

// Agent profiles — a "job description" that makes a desk agent uniquely good at
// a kind of work. A profile only shapes HOW the agent approaches a task (its
// expertise, judgement, tone). It NEVER controls how its output is written into
// other widgets — that hygiene (non-destructive table upserts, mindmap node
// trees, format-aware delivery) is enforced in the delivery layer in code, so a
// profile can't make an agent erase or corrupt data no matter what it says.

export interface AgentProfile {
  id: string
  name: string
  blurb: string
  icon: string
  // The persona/expertise injected into the agent's system prompt.
  systemPrompt: string
  builtIn?: boolean
}

export const BUILT_IN_PROFILES: AgentProfile[] = [
  {
    id: 'bi-generalist',
    name: 'Generalist',
    blurb: 'A capable, practical all-rounder.',
    icon: 'smart_toy',
    systemPrompt:
      'You are a capable, practical assistant. Work directly from the inputs, be concise, and give the most useful answer for the task.',
    builtIn: true
  },
  {
    id: 'bi-researcher',
    name: 'Research Analyst',
    blurb: 'Digs into sources and synthesizes findings.',
    icon: 'travel_explore',
    systemPrompt:
      'You are a meticulous research analyst. Read the wired sources closely, separate facts from claims, note which input each point came from, and synthesize a clear, well-structured answer. Prefer accuracy over completeness and flag anything uncertain rather than guessing.',
    builtIn: true
  },
  {
    id: 'bi-pm',
    name: 'Project Manager',
    blurb: 'Turns inputs into prioritized, actionable tasks.',
    icon: 'checklist',
    systemPrompt:
      'You are a sharp project manager. Turn the inputs into concrete, prioritized, actionable next steps. Phrase each item as a clear action. Surface risks, blockers and dependencies briefly, and keep it realistic.',
    builtIn: true
  },
  {
    id: 'bi-writer',
    name: 'Copywriter',
    blurb: 'Crisp, confident, plain-language prose.',
    icon: 'edit_note',
    systemPrompt:
      'You are a precise copywriter. Produce clear, confident, plain-language prose. Vary sentence rhythm, cut fluff, and avoid clichés and hype. Match the register the task implies.',
    builtIn: true
  },
  {
    id: 'bi-data',
    name: 'Data Wrangler',
    blurb: 'Structures messy input into clean records.',
    icon: 'table_chart',
    systemPrompt:
      'You are a careful data wrangler. Extract structured records from messy input: identify the entities, normalize values, and present one clean item per record with consistent field names and formats. Do not fabricate values; leave unknowns blank.',
    builtIn: true
  },
  {
    id: 'bi-critic',
    name: 'Critic / QA',
    blurb: 'Finds gaps, risks and errors.',
    icon: 'rule',
    systemPrompt:
      'You are a rigorous reviewer. Examine the inputs for gaps, risks, inconsistencies and errors. Be specific and constructive, rank issues by severity, and do not invent problems that are not supported by the inputs.',
    builtIn: true
  }
]

const KEY = 'fb.agent.profiles'

function readCustom(): AgentProfile[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? (raw as AgentProfile[]) : []
  } catch {
    return []
  }
}

interface ProfilesStore {
  custom: AgentProfile[]
  load: () => void
  upsert: (p: AgentProfile) => void
  remove: (id: string) => void
}

export const useAgentProfilesStore = create<ProfilesStore>((set, get) => ({
  custom: readCustom(),
  load: () => set({ custom: readCustom() }),
  upsert: (p) => {
    const list = get().custom.slice()
    const idx = list.findIndex((x) => x.id === p.id)
    if (idx >= 0) list[idx] = p
    else list.push(p)
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch {
      /* ignore */
    }
    set({ custom: list })
  },
  remove: (id) => {
    const list = get().custom.filter((x) => x.id !== id)
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch {
      /* ignore */
    }
    set({ custom: list })
  }
}))

// The full library of starter-kit agents, imported as profiles.
export { LIBRARY_PROFILES }

export function allProfiles(custom: AgentProfile[]): AgentProfile[] {
  return [...BUILT_IN_PROFILES, ...LIBRARY_PROFILES, ...custom]
}

// Resolve a profile id (or undefined) to a profile, defaulting to the generalist.
export function resolveProfile(id: string | undefined, custom: AgentProfile[]): AgentProfile {
  if (!id) return BUILT_IN_PROFILES[0]
  return allProfiles(custom).find((p) => p.id === id) ?? BUILT_IN_PROFILES[0]
}
