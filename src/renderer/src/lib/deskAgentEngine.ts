import { create } from 'zustand'
import { applyProposal } from './actionExecutor'
import { destinationLabel } from './agentDestination'
import { buildDelivery } from './agentDestination'
import type { ActionProposal } from '@shared/types'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import { parseAgent, serializeAgent, withRun } from './deskAgent'
import { extractWebviewText, getWebContentsId } from './webviewRegistry'
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
  // Proposed workspace changes from an agent's latest run, awaiting the user's
  // review on the agent widget. Keyed by agent id. Cleared as the user applies
  // or dismisses them, or when the agent runs again.
  proposals: Record<string, ActionProposal[]>
  // Which run produced the pending proposals, so applying or dismissing one can
  // be recorded against it. Absent for a run that proposed nothing.
  attribution: Record<string, { invocationId: string; agentSlug: string }>
  setProposals: (
    id: string,
    proposals: ActionProposal[],
    attribution?: { invocationId: string; agentSlug: string }
  ) => void
  clearProposals: (id: string) => void
}
export const useAgentRunStore = create<AgentRunState>((set) => ({
  running: {},
  setRunning: (id, on) => set((s) => ({ running: { ...s.running, [id]: on } })),
  proposals: {},
  attribution: {},
  setProposals: (id, proposals, attribution) =>
    set((s) => ({
      proposals: { ...s.proposals, [id]: proposals },
      attribution: attribution ? { ...s.attribution, [id]: attribution } : s.attribution
    })),
  clearProposals: (id) =>
    set((s) => {
      if (!(id in s.proposals)) return s
      const next = { ...s.proposals }
      delete next[id]
      const nextAttr = { ...s.attribution }
      delete nextAttr[id]
      return { proposals: next, attribution: nextAttr }
    })
}))

// Expose the agent-run store on window so e2e specs can push a proposal set
// directly (bypassing a live model call) to exercise the review-before-apply
// card path. Same convention as __fbView / __fbFocusChat: a thin handle to the
// real store, not a mock; it changes nothing about how the app behaves.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbAgentRun?: typeof useAgentRunStore }).__fbAgentRun = useAgentRunStore
}

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
    // If a browser is wired into this agent, hand its webContents id to main so
    // the agent can DRIVE it (read / navigate / search) to research.
    let browserWcId: number | undefined
    for (const l of useLinksStore.getState().links.filter((x) => x.targetWidgetId === agentId)) {
      if (useWidgetStore.getState().widgets.find((w) => w.id === l.sourceWidgetId)?.kind === 'webview') {
        const cid = getWebContentsId(l.sourceWidgetId)
        if (cid) {
          browserWcId = cid
          break
        }
      }
    }
    const res = await window.api.agents.run(
      agentId,
      agent.taskId,
      cfg.instruction,
      liveInputs,
      persona,
      browserWcId
    )
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
    // Deterministic delivery to the configured destination.
    //
    // This is the fix for the review's main finding: a wired output was only ever
    // a format hint, so whether the output reached it depended on the model
    // choosing to propose an update-widget. With a destination set, the card is
    // ALWAYS offered — and it leads, because it is the thing the user configured
    // this agent to do. It is still a proposal: nothing is written until accepted.
    const liveCfg = parseAgent(latestContent(agentId) ?? agent.content)
    const proposals = [...(res.proposals ?? [])]
    // Set when delivery was refused, so the widget reports it rather than the
    // run looking successful with nothing to show for it.
    let deliveryNote: string | null = null
    // Where an auto-applied write landed, so the run log can state it plainly.
    let autoApplied: string | null = null
    if (liveCfg.destinationWidgetId) {
      const target = useWidgetStore.getState().widgets.find((w) => w.id === liveCfg.destinationWidgetId)
      if (target) {
        const delivery = buildDelivery(
          res.output ?? '',
          target,
          liveCfg.destinationMode ?? 'append',
          agent.title ?? ''
        )
        if (delivery.ok) {
          // Drop any update-widget the model already aimed at the same target,
          // so an accepted card is not silently applied twice.
          const deduped = proposals.filter(
            (p) => !(p.kind === 'update-widget' && p.widgetId === target.id)
          )
          proposals.length = 0
          if (liveCfg.destinationAutoApply) {
            // Written straight through, because the user configured this exact
            // destination and turned the confirmation off for it. Never silent:
            // the run log says what was written and where.
            const r = await applyProposal(delivery.proposal, { activeTaskId: agent.taskId })
            deliveryNote = r.ok
              ? null
              : `Could not write to ${destinationLabel(target)}: ${r.message}`
            if (r.ok) autoApplied = destinationLabel(target)
            proposals.push(...deduped)
          } else {
            proposals.push(delivery.proposal, ...deduped)
          }
        } else if (delivery.reason === 'narration') {
          // The agent described its work instead of doing it. Writing that
          // description into the destination is how a page ends up containing
          // "I've written … and saved it to the linked page" instead of the
          // document. Refuse, and say so where the user is already looking.
          deliveryNote =
            'The agent described its work instead of writing it, so nothing was saved. Run it again — its instruction may need to ask for the finished text directly.'
        }
      }
    }

    // Logged AFTER the delivery decision so a refusal is recorded on the run
    // rather than the run reading as a clean success with nothing to show.
    await writeLog(agentId, parseAgent(latestContent(agentId) ?? agent.content), {
      at,
      output: autoApplied ? `Written to ${autoApplied}.\n\n${res.output ?? ''}` : res.output ?? '',
      inputCount,
      error: deliveryNote ?? undefined
    })

    // Surface any proposed workspace changes for the user to review on the
    // widget. Replaces any prior pending set from an earlier run.
    if (proposals.length > 0) {
      useAgentRunStore
        .getState()
        .setProposals(
          agentId,
          proposals,
          res.invocationId && res.agentSlug
            ? { invocationId: res.invocationId, agentSlug: res.agentSlug }
            : undefined
        )
    } else {
      useAgentRunStore.getState().clearProposals(agentId)
    }
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
