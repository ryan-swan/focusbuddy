// The agentic-browsing loop (A6/B2, R26/R27/R28). One runtime, Plexii's:
// this driver runs in main, owns the round budget and the consent gate, and
// narrates everything it does as events the chat surface renders (B3). The
// model plans; the bridge acts; R29 lives in the bridge — a banned action
// refuses in code no matter what the model asked for.
//
// The R27 hybrid decision happens per ROUND, not per run: every round tries
// the DOM snapshot first, and only when the page yields no structural
// elements does the round fall back to a screenshot and the coordinate
// vocabulary. One sanitiser and one kill switch cover both.

import { BrowserWindow } from 'electron'
import {
  createAgentRun,
  stopAgentRun,
  endAgentRun,
  performAgentAction,
  type ActionResult,
  type AgentAction,
  type PageElement
} from './browserActions'
import {
  MODEL_ROUND_BUDGET,
  MUTATING_KINDS,
  sanitiseBrowserAction,
  type BrowserEnvelope
} from './browserAgentEnvelope'
import { enforceAgentStatus } from './agentEnvelope'
import { runBrowserAgentStep, type BrowserStepContent } from './anthropic'
import { consentHostOf, hasConsent, grantConsent } from '../browserConsent'
import { resolveModel } from './modelRouting'
import { estimateCostMicros } from './aiCost'

export interface BrowserRunCost {
  inputTokens: number
  outputTokens: number
  costMicros: number
}

export type BrowserAgentEvent =
  | { kind: 'started'; runId: string; task: string }
  | { kind: 'round'; runId: string; round: number; mode: 'dom' | 'screenshot'; url: string }
  | { kind: 'consent_required'; runId: string; host: string }
  | {
      kind: 'acted'
      runId: string
      round: number
      narration: string
      action: AgentAction
      ok: boolean
      refused?: string
      detail?: string
      url: string
      // Running totals so the visible run's cost ticker stays live (B4's
      // surface reads the same numbers).
      cost: BrowserRunCost
    }
  | { kind: 'needs_human'; runId: string; reason: string }
  | {
      kind: 'finished'
      runId: string
      outcome: 'done' | 'blocked' | 'need_input' | 'stopped' | 'budget' | 'denied' | 'failed'
      summary: string
      rounds: number
      cost: BrowserRunCost
    }

interface LiveRun {
  runId: string
  consentWaiter: ((granted: boolean) => void) | null
  // Whether the pending consent answer should be recorded as a standing
  // grant; set before the waiter resolves so the loop reads it truthfully.
  remember: boolean
}

const liveRuns = new Map<string, LiveRun>()

function broadcast(ev: BrowserAgentEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('browserAgent:event', ev)
  }
}

// Answer a pending consent prompt. remember=true records the standing grant
// (R26's reviewable list); a one-time yes lets only THIS run proceed.
export function resolveBrowserConsent(runId: string, granted: boolean, remember: boolean): boolean {
  const live = liveRuns.get(runId)
  if (!live?.consentWaiter) return false
  live.remember = remember
  const w = live.consentWaiter
  live.consentWaiter = null
  w(granted)
  return true
}

export function stopBrowserAgent(runId: string): boolean {
  const stopped = stopAgentRun(runId)
  const live = liveRuns.get(runId)
  if (live?.consentWaiter) {
    const w = live.consentWaiter
    live.consentWaiter = null
    w(false)
  }
  return stopped
}

function elementLine(el: PageElement): string {
  const tag = el.type && el.type !== el.tag ? `${el.tag}(${el.type})` : el.tag
  const flags = [
    el.isPassword ? 'password — off-limits' : '',
    el.isPayment ? 'payment — off-limits' : '',
    el.isFileInput ? 'file — off-limits' : '',
    el.disabled ? 'disabled' : ''
  ]
    .filter(Boolean)
    .join(', ')
  const value = el.value ? ` value=${JSON.stringify(el.value.slice(0, 40))}` : ''
  const opts = el.options?.length ? ` options=[${el.options.slice(0, 10).join(', ')}]` : ''
  return `[${el.idx}] ${tag} ${JSON.stringify(el.label)}${value}${opts}${flags ? ` (${flags})` : ''}`
}

// Keep only the newest screenshot in the transcript — images are the bulk
// of a round's tokens and only the current one is actionable.
function withoutStaleImages(
  messages: Array<{ role: 'user' | 'assistant'; content: BrowserStepContent }>
): Array<{ role: 'user' | 'assistant'; content: BrowserStepContent }> {
  return messages.map((m, i) => {
    if (i === messages.length - 1 || typeof m.content === 'string') return m
    const text = m.content
      .map((b) => (b.type === 'text' ? b.text : '(screenshot from an earlier round omitted)'))
      .join('\n')
    return { role: m.role, content: text }
  })
}

export interface BrowserAgentStartResult {
  runId: string
}

// Start a run and return immediately; the loop reports through events and
// settles the returned promise chain internally. `onEvent` (tests, B3
// in-process listeners) is called for every event in addition to the
// renderer broadcast.
export function runBrowserAgent(input: {
  wcId: number
  task: string
  startUrl?: string
  onEvent?: (ev: BrowserAgentEvent) => void
}): BrowserAgentStartResult {
  const run = createAgentRun(input.wcId)
  const live: LiveRun = { runId: run.id, consentWaiter: null, remember: false }
  liveRuns.set(run.id, live)
  const emit = (ev: BrowserAgentEvent): void => {
    broadcast(ev)
    input.onEvent?.(ev)
  }
  void drive(run.id, input, live, emit).finally(() => {
    endAgentRun(run.id)
    liveRuns.delete(run.id)
  })
  return { runId: run.id }
}

async function drive(
  runId: string,
  input: { wcId: number; task: string; startUrl?: string },
  live: LiveRun,
  emit: (ev: BrowserAgentEvent) => void
): Promise<void> {
  const cost: BrowserRunCost = { inputTokens: 0, outputTokens: 0, costMicros: 0 }
  const model = resolveModel('browser_agent')
  let rounds = 0
  const finish = (outcome: Extract<BrowserAgentEvent, { kind: 'finished' }>['outcome'], summary: string): void =>
    emit({ kind: 'finished', runId, outcome, summary, rounds, cost })

  emit({ kind: 'started', runId, task: input.task })
  const perform = (a: AgentAction): Promise<ActionResult> => performAgentAction(runId, a)

  if (input.startUrl) {
    const nav = await perform({ kind: 'open_url', url: input.startUrl })
    if (nav.refused === 'run_stopped') return finish('stopped', 'Stopped before it began.')
  }

  const messages: Array<{ role: 'user' | 'assistant'; content: BrowserStepContent }> = []
  let systemPrompt: string | undefined
  let lastResultLine = '(no action yet)'
  let priorFailed = 0

  while (rounds < MODEL_ROUND_BUDGET) {
    rounds++

    // ── Observe (R27: DOM first, screenshot only when the DOM yields nothing)
    const snap = await perform({ kind: 'snapshot' })
    if (snap.refused === 'run_stopped') return finish('stopped', 'Stopped by the user.')
    const read = await perform({ kind: 'read_page' })
    if (read.refused === 'run_stopped') return finish('stopped', 'Stopped by the user.')
    if (snap.refused === 'browser_gone' || read.refused === 'browser_gone') {
      return finish('failed', 'The browser surface went away mid-run.')
    }
    const elements = snap.elements ?? []
    const coordinateMode = !snap.ok || elements.length === 0
    const url = snap.pageUrl ?? read.pageUrl ?? ''
    emit({ kind: 'round', runId, round: rounds, mode: coordinateMode ? 'screenshot' : 'dom', url })

    const obsLines = [
      `TASK: ${input.task}`,
      `ROUND ${rounds} of ${MODEL_ROUND_BUDGET}.`,
      `RESULT OF YOUR LAST ACTION: ${lastResultLine}`,
      '',
      'OBSERVATION',
      `URL: ${url || '(no page loaded)'}`,
      snap.captchaPresent
        ? 'A CAPTCHA is present on this page — you cannot solve it; if it blocks the task, report need_input.'
        : '',
      `PAGE TEXT (excerpt):\n${(read.text ?? '').slice(0, 2500) || '(no readable text)'}`
    ].filter(Boolean)

    let content: BrowserStepContent
    if (coordinateMode) {
      const shot = await perform({ kind: 'screenshot' })
      if (shot.refused === 'run_stopped') return finish('stopped', 'Stopped by the user.')
      if (shot.ok && shot.image) {
        obsLines.push(
          `SCREENSHOT MODE: the page has no structural elements to list. Act with click_at/type_text using coordinates in the ${shot.image.width}x${shot.image.height} screenshot below.`
        )
        content = [
          { type: 'text', text: obsLines.join('\n') },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: shot.image.base64Png }
          }
        ]
      } else {
        obsLines.push('The page could not be observed at all this round; wait or navigate.')
        content = obsLines.join('\n')
      }
    } else {
      obsLines.push('ELEMENTS:', ...elements.map(elementLine))
      content = obsLines.join('\n')
    }
    messages.push({ role: 'user', content })

    // ── Plan (one model round) ────────────────────────────────────────────
    const step = await runBrowserAgentStep({ systemPrompt, messages: withoutStaleImages(messages) })
    cost.inputTokens += step.usage.inputTokens
    cost.outputTokens += step.usage.outputTokens
    cost.costMicros += estimateCostMicros(model, step.usage.inputTokens, step.usage.outputTokens)
    systemPrompt = step.systemPrompt
    if (!step.ok || !step.envelope) {
      messages.push({ role: 'assistant', content: step.rawAssistant || '(unusable reply)' })
      lastResultLine = `Your reply could not be used: ${step.error ?? 'no envelope'}. Reply with ONLY the JSON object.`
      priorFailed++
      if (step.needsApiKey) return finish('failed', step.error ?? 'No API key.')
      if (priorFailed >= 3) return finish('failed', 'The model returned unusable output three times.')
      continue
    }
    messages.push({ role: 'assistant', content: step.rawAssistant })

    const env: BrowserEnvelope = step.envelope
    const action = sanitiseBrowserAction(env.action, {
      knownIndices: new Set(elements.map((e) => e.idx)),
      coordinateMode
    })
    const honest = enforceAgentStatus({
      status: env.status,
      blocker: env.blocker,
      actionCount: action ? 1 : 0,
      narration: env.narration,
      priorFailedCount: priorFailed
    })

    if (honest.status === 'done') return finish('done', env.narration || 'Done.')
    if (honest.status === 'blocked' || honest.status === 'need_input') {
      emit({ kind: 'needs_human', runId, reason: honest.blocker ?? 'The agent needs your input.' })
      return finish(honest.status, honest.blocker ?? env.narration ?? 'The run needs your input.')
    }
    if (!action) {
      lastResultLine =
        'Your action was invalid (unknown kind, an element index not in the observation, or a coordinate action outside screenshot mode). Choose again.'
      priorFailed++
      if (priorFailed >= 4) return finish('failed', 'The model kept proposing invalid actions.')
      continue
    }

    // ── Consent (R26: first mutating action on an ungranted site pauses) ──
    if (MUTATING_KINDS.has(action.kind)) {
      const host = consentHostOf(url)
      if (host && !hasConsent(host)) {
        emit({ kind: 'consent_required', runId, host })
        const granted = await new Promise<boolean>((resolve) => {
          live.consentWaiter = resolve
        })
        if (!granted) return finish('denied', `You declined to let Plexii act on ${host}.`)
        if (live.remember) grantConsent(host)
      }
    }

    // ── Act (the bridge enforces R29 whatever was asked) ──────────────────
    const result = await perform(action)
    emit({
      kind: 'acted',
      runId,
      round: rounds,
      narration: env.narration,
      action,
      ok: result.ok,
      refused: result.refused,
      detail: result.detail,
      url: result.pageUrl ?? url,
      cost: { ...cost }
    })
    if (result.refused === 'run_stopped') return finish('stopped', 'Stopped by the user.')
    if (result.refused === 'step_ceiling') return finish('budget', 'The bridge step ceiling was reached.')
    if (result.refused === 'credential_field' || result.refused === 'credential_submit') {
      emit({ kind: 'needs_human', runId, reason: 'This needs a sign-in — that part is yours.' })
    }
    if (result.ok) {
      priorFailed = 0
      lastResultLine = `${action.kind} succeeded${result.detail ? ` on ${JSON.stringify(result.detail)}` : ''}.`
      // Let navigations and re-renders settle before the next observation.
      await perform({ kind: 'wait', ms: 400 })
    } else {
      priorFailed++
      lastResultLine = `${action.kind} was REFUSED: ${result.refused}${result.detail ? ` (${result.detail})` : ''}. Do not retry it; re-plan or report blocked/need_input.`
    }
  }
  finish('budget', 'The round budget ran out before the task finished.')
}
