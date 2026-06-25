import { randomUUID } from 'crypto'
import { getDb } from './database'
import { createNode } from './nodes'
import { createRow, getTable } from './tables'
import { createKnowledge } from './knowledge'
import { sendChat } from '../ai/anthropic'
import { advanceSchedule } from '@shared/schedule'
import * as mailAccount from '../mail/mailAccount'
import { sendMail } from '../mail/smtp'
import type {
  FlowDef,
  FlowDraft,
  FlowPatch,
  FlowAction,
  FlowRunStep,
  FlowRunResult,
  FlowTrigger
} from '@shared/flows'

// PlexiFlow engine and store. A flow is a trigger plus an ordered list of actions
// the workspace already knows how to perform. runFlow executes them in order and
// records an honest per-step log: a missing AI key or an unconfigured mail account
// shows as a failed step with the real reason, never a fake success. An AI step's
// text output is held in a small run context so a later step can reuse it with the
// token {{ai}}.

interface FlowRow {
  id: string
  title: string
  enabled: number
  trigger_json: string
  actions_json: string
  last_run_at: number | null
  last_status: string | null
  last_log: string | null
  next_run_at: number | null
  created_at: number
  updated_at: number
}

function parseTrigger(raw: string): FlowTrigger {
  try {
    const t = JSON.parse(raw)
    if (t && (t.kind === 'manual' || t.kind === 'schedule')) return t as FlowTrigger
  } catch {
    /* fall through */
  }
  return { kind: 'manual' }
}

function parseActions(raw: string): FlowAction[] {
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? (a as FlowAction[]) : []
  } catch {
    return []
  }
}

function parseLog(raw: string | null): FlowRunStep[] {
  if (!raw) return []
  try {
    const l = JSON.parse(raw)
    return Array.isArray(l) ? (l as FlowRunStep[]) : []
  } catch {
    return []
  }
}

function rowToFlow(r: FlowRow): FlowDef {
  return {
    id: r.id,
    title: r.title,
    enabled: r.enabled === 1,
    trigger: parseTrigger(r.trigger_json),
    actions: parseActions(r.actions_json),
    lastRunAt: r.last_run_at,
    lastStatus: (r.last_status as FlowDef['lastStatus']) ?? null,
    lastLog: parseLog(r.last_log),
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listFlows(): FlowDef[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM fb_flows ORDER BY updated_at DESC').all() as FlowRow[]).map(rowToFlow)
}

export function getFlow(id: string): FlowDef | null {
  const db = getDb()
  const r = db.prepare('SELECT * FROM fb_flows WHERE id = ?').get(id) as FlowRow | undefined
  return r ? rowToFlow(r) : null
}

export function createFlow(draft: FlowDraft): FlowDef {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_flows (id, title, enabled, trigger_json, actions_json, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`
  ).run(id, draft.title || 'New flow', JSON.stringify({ kind: 'manual' }), JSON.stringify([]), now, now)
  return getFlow(id)!
}

export function computeNextRun(trigger: FlowTrigger, fromMs: number): number | null {
  if (trigger.kind !== 'schedule') return null
  return advanceSchedule(trigger.every, fromMs)
}

export function updateFlow(id: string, patch: FlowPatch): FlowDef | null {
  const db = getDb()
  const sets: string[] = []
  const vals: Array<string | number | null> = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    vals.push(patch.title)
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?')
    vals.push(patch.enabled ? 1 : 0)
  }
  if (patch.trigger !== undefined) {
    sets.push('trigger_json = ?')
    vals.push(JSON.stringify(patch.trigger))
    // Recompute the next run so a schedule change takes effect immediately.
    sets.push('next_run_at = ?')
    vals.push(computeNextRun(patch.trigger, Date.now()))
  }
  if (patch.actions !== undefined) {
    sets.push('actions_json = ?')
    vals.push(JSON.stringify(patch.actions))
  }
  if (sets.length === 0) return getFlow(id)
  sets.push('updated_at = ?')
  vals.push(Date.now())
  vals.push(id)
  db.prepare(`UPDATE fb_flows SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getFlow(id)
}

export function deleteFlow(id: string): boolean {
  const db = getDb()
  return db.prepare('DELETE FROM fb_flows WHERE id = ?').run(id).changes > 0
}

// Substitute the running AI output into a template. {{ai}} is replaced by the
// most recent ai-step output, or left empty when no AI step has run.
function fill(template: string, ctx: { ai: string }): string {
  return template.replace(/\{\{\s*ai\s*\}\}/g, ctx.ai)
}

async function runAction(action: FlowAction, ctx: { ai: string }): Promise<FlowRunStep> {
  const base = { actionId: action.id, type: action.type }
  try {
    switch (action.type) {
      case 'create-task': {
        const title = fill(action.title, ctx).trim() || 'Untitled task'
        createNode({ parentId: null, kind: 'task', title })
        return { ...base, ok: true, message: `Created task "${title}".` }
      }
      case 'add-table-row': {
        if (!action.tableId) return { ...base, ok: false, message: 'No table chosen.' }
        // Verify the table still exists so a deleted target fails honestly rather
        // than writing an orphan row and reporting success.
        if (!getTable(action.tableId)) return { ...base, ok: false, message: 'That table no longer exists.' }
        createRow({ tableId: action.tableId })
        return { ...base, ok: true, message: 'Added a row.' }
      }
      case 'create-knowledge': {
        const title = fill(action.title, ctx).trim() || 'Untitled entry'
        const body = fill(action.body, ctx)
        createKnowledge({ title, body })
        return { ...base, ok: true, message: `Added knowledge entry "${title}".` }
      }
      case 'send-email': {
        const config = mailAccount.getFull()
        if (!config) return { ...base, ok: false, message: 'No mail account connected.' }
        const to = fill(action.to, ctx)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (to.length === 0) return { ...base, ok: false, message: 'No recipients.' }
        await sendMail(config, {
          to,
          subject: fill(action.subject, ctx),
          text: fill(action.body, ctx)
        })
        return { ...base, ok: true, message: `Emailed ${to.length} recipient(s).` }
      }
      case 'ai-step': {
        const prompt = fill(action.prompt, ctx)
        const res = await sendChat({ taskId: null, messages: [{ role: 'user', content: prompt, ts: Date.now() }] })
        if (!res.ok || !res.message?.content) {
          return {
            ...base,
            ok: false,
            message: res.needsApiKey ? 'No Anthropic key set for the AI step.' : 'The AI step did not return text.'
          }
        }
        ctx.ai = res.message.content
        return { ...base, ok: true, message: 'AI step produced output for later steps.' }
      }
    }
  } catch (err) {
    return { ...base, ok: false, message: err instanceof Error ? err.message : 'Action failed.' }
  }
}

// Run a flow now. Executes every action in order, stopping at nothing (a failed
// step is recorded and the rest still run), and persists the log + status.
export async function runFlow(id: string): Promise<FlowRunResult> {
  const flow = getFlow(id)
  if (!flow) return { ok: false, steps: [{ actionId: '', type: 'ai-step', ok: false, message: 'Flow not found.' }] }
  const ctx = { ai: '' }
  const steps: FlowRunStep[] = []
  for (const action of flow.actions) {
    steps.push(await runAction(action, ctx))
  }
  const ok = steps.every((s) => s.ok)
  const now = Date.now()
  const db = getDb()
  db.prepare(
    'UPDATE fb_flows SET last_run_at = ?, last_status = ?, last_log = ?, next_run_at = ?, updated_at = ? WHERE id = ?'
  ).run(now, ok ? 'ok' : 'error', JSON.stringify(steps), computeNextRun(flow.trigger, now), now, id)
  return { ok, steps }
}

// Enabled, scheduled flows whose next run has come due.
export function listDueFlows(nowMs = Date.now()): FlowDef[] {
  return listFlows().filter(
    (f) => f.enabled && f.trigger.kind === 'schedule' && f.nextRunAt != null && f.nextRunAt <= nowMs
  )
}

export async function runDueFlows(nowMs = Date.now()): Promise<{ ran: number }> {
  const due = listDueFlows(nowMs)
  let ran = 0
  // Guard each flow so one failing flow does not abort the rest of the batch.
  for (const f of due) {
    try {
      await runFlow(f.id)
      ran++
    } catch {
      // runFlow already records its own per-step failures; a throw here is rare.
    }
  }
  return { ran }
}
