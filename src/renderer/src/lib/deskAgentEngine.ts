import { create } from 'zustand'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import { parseAgent, serializeAgent, withRun } from './deskAgent'
import { extractWebviewText } from './webviewRegistry'
import { resolveProfile, useAgentProfilesStore } from './agentProfiles'

// Collect the LIVE rendered text of any browser widgets wired into this agent,
// so logged-in / JS-rendered pages reach the model instead of an unauthenticated
// URL fetch. Keyed by widget id; main falls back to fetching for any not here.
async function gatherLiveInputs(agentId: string): Promise<Record<string, string>> {
  const links = useLinksStore.getState().links
  const widgets = useWidgetStore.getState().widgets
  const out: Record<string, string> = {}
  const inputIds = links
    .filter((l) => l.targetWidgetId === agentId)
    .map((l) => l.sourceWidgetId)
  for (const id of inputIds) {
    if (widgets.find((w) => w.id === id)?.kind !== 'webview') continue
    const text = await extractWebviewText(id)
    if (text) out[id] = text
  }
  return out
}

// ── Desk agents: the run engine ──────────────────────────────────────────────
//
// A desk agent is a widget whose inputs are the widgets wired INTO it. It runs
// its standing instruction over those inputs (in main, via IPC) and logs the
// result into its own body. Three triggers: a manual Run button, an interval
// (owned by the widget component), and "on a wired input changing" — which the
// widgets store calls into here whenever any content changes.
//
// Guards: a run never starts if one is already inflight for that agent; the
// agent's own log-write is marked so it cannot recursively re-trigger; onChange
// triggers are debounced per agent so a burst of upstream edits is one run.

const DEBOUNCE_MS = 1200
// After an agent writes its own log, ignore changes to it for this long so the
// write can't bounce back through any wires/agents it feeds.
const SELF_WRITE_COOLDOWN_MS = 4000

interface AgentRunState {
  running: Record<string, boolean>
  setRunning: (id: string, on: boolean) => void
}
export const useAgentRunStore = create<AgentRunState>((set) => ({
  running: {},
  setRunning: (id, on) => set((s) => ({ running: { ...s.running, [id]: on } }))
}))

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inflight = new Set<string>()
const selfWriteCooldown = new Map<string, number>()

function inSelfCooldown(agentId: string): boolean {
  const t = selfWriteCooldown.get(agentId)
  if (t === undefined) return false
  if (Date.now() - t > SELF_WRITE_COOLDOWN_MS) {
    selfWriteCooldown.delete(agentId)
    return false
  }
  return true
}

// Run one agent now. Bypasses debounce but keeps the inflight guard.
export async function runAgent(agentId: string): Promise<void> {
  if (inflight.has(agentId)) return
  const ws = useWidgetStore.getState()
  const agent = ws.widgets.find((w) => w.id === agentId && w.kind === 'agent')
  if (!agent) return
  const cfg = parseAgent(agent.content)
  if (!cfg.instruction.trim()) {
    await writeLog(agentId, cfg, { at: Date.now(), output: '', inputCount: 0, error: 'Give the agent an instruction first.' })
    return
  }

  const inputCount = useLinksStore
    .getState()
    .links.filter((l) => l.targetWidgetId === agentId).length

  inflight.add(agentId)
  useAgentRunStore.getState().setRunning(agentId, true)
  try {
    const liveInputs = await gatherLiveInputs(agentId)
    // The profile persona shapes the approach; hygiene stays enforced in code.
    const persona = resolveProfile(cfg.profileId, useAgentProfilesStore.getState().custom).systemPrompt
    const res = await window.api.agents.run(agentId, agent.taskId, cfg.instruction, liveInputs, persona)
    const at = Date.now()
    if (!res.ok) {
      await writeLog(agentId, parseAgent(latestContent(agentId) ?? agent.content), {
        at,
        output: '',
        inputCount,
        error: res.error ?? 'Agent run failed.'
      })
      return
    }
    await writeLog(agentId, parseAgent(latestContent(agentId) ?? agent.content), {
      at,
      output: res.output ?? '',
      inputCount
    })
  } catch (e) {
    await writeLog(agentId, parseAgent(latestContent(agentId) ?? agent.content), {
      at: Date.now(),
      output: '',
      inputCount,
      error: e instanceof Error ? e.message : String(e)
    })
  } finally {
    inflight.delete(agentId)
    useAgentRunStore.getState().setRunning(agentId, false)
  }
}

function latestContent(agentId: string): string | null | undefined {
  return useWidgetStore.getState().widgets.find((w) => w.id === agentId)?.content
}

async function writeLog(
  agentId: string,
  cfg: ReturnType<typeof parseAgent>,
  run: { at: number; output: string; inputCount: number; error?: string }
): Promise<void> {
  selfWriteCooldown.set(agentId, Date.now())
  await useWidgetStore.getState().update(agentId, { content: serializeAgent(withRun(cfg, run)) })
}

// Called by the widgets store whenever any widget's content changes. Fires the
// onChange-triggered agents that have the changed widget wired into them.
export function notifyAgentInputChanged(changedWidgetId: string): void {
  if (inSelfCooldown(changedWidgetId)) return
  const links = useLinksStore.getState().links
  const widgets = useWidgetStore.getState().widgets
  const agentIds = new Set(
    links.filter((l) => l.sourceWidgetId === changedWidgetId).map((l) => l.targetWidgetId)
  )
  for (const agentId of agentIds) {
    const w = widgets.find((x) => x.id === agentId && x.kind === 'agent')
    if (!w) continue
    const cfg = parseAgent(w.content)
    if (!cfg.enabled || cfg.trigger !== 'onChange') continue
    const existing = debounceTimers.get(agentId)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      agentId,
      setTimeout(() => {
        debounceTimers.delete(agentId)
        void runAgent(agentId)
      }, DEBOUNCE_MS)
    )
  }
}
