// The capture classifier (Attention S5) — hard rules first, Haiku fallback,
// loose_thought floor. A capture is NEVER lost or blocked: every failure mode
// (no key, timeout, garbage output) degrades to
// { intentClass:'loose_thought', confidence:0 } and the item still files.
//
// The standup split applied to classification: deterministic triggers resolve
// most captures with zero model latency (R011); only genuinely ambiguous prose
// pays for a model call, tagged purpose 'intent_classify' (Haiku-routed).

import { getModelClient } from './modelClient'
import { resolveAnthropicKey } from '../settingsStore'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'
import { PROTOCOL_VOCAB_NOTE } from './vocabulary'
import {
  classifyByRules,
  scanDeadline,
  needsDeadlineClarification,
  titleFromCapture,
  type IntentClass
} from './intentRules'

export interface CaptureClassification {
  intentClass: IntentClass
  confidence: number
  title: string
  /** ISO-8601 when a deadline phrase anchored. */
  dueAt: string | null
  /** DEC-016 Q1: the composer's ONE question — set only for an unanchored
   *  deadline phrase on an actionable class. */
  clarify: { kind: 'deadline'; phrase: string } | null
  /** 'rules' = deterministic (no model call, R011's fast path). */
  via: 'rules' | 'model' | 'fallback'
}

const CLASSES: ReadonlySet<string> = new Set([
  'action',
  'review',
  'scheduling',
  'fyi',
  'acknowledgment',
  'discussion',
  'loose_thought',
  'direct'
])

async function classifyWithModel(text: string): Promise<{ intentClass: IntentClass; confidence: number } | null> {
  try {
    const key = resolveAnthropicKey()
    if (!key) return null
    const client = getModelClient(key)
    const model = resolveModel('intent_classify')
    const resp = await client.messages.create({
      model,
      max_tokens: 120,
      system:
        'You classify ONE captured note into exactly one intent class. ' +
        'Classes: action (something to do, incl. questions needing answers), review (approval/judgment/sign-off), ' +
        'scheduling (time/meeting related), fyi (information worth keeping), acknowledgment (needs only receipt), ' +
        'discussion (talk through live, agenda material), loose_thought (idle low-stakes fragment), ' +
        'direct (plain human message, no work object).\n' +
        PROTOCOL_VOCAB_NOTE +
        'Return ONLY JSON: {"intentClass":"...","confidence":0.0-1.0}. No prose.',
      messages: [{ role: 'user', content: text.slice(0, 2000) }]
    })
    recordAiUsage(model, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0)
    const out = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
    const json = extractJson(out)
    if (!json) return null
    const parsed = JSON.parse(json) as { intentClass?: unknown; confidence?: unknown }
    const cls = String(parsed.intentClass)
    if (!CLASSES.has(cls)) return null
    const conf = Number(parsed.confidence)
    return { intentClass: cls as IntentClass, confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5 }
  } catch {
    return null
  }
}

export async function classifyCapture(text: string, now = new Date()): Promise<CaptureClassification> {
  const title = titleFromCapture(text)
  const scan = scanDeadline(text, now)
  const ruled = classifyByRules(text)
  if (ruled) {
    return {
      intentClass: ruled.intentClass,
      confidence: ruled.confidence,
      title,
      dueAt: scan?.dueAt ?? null,
      clarify: needsDeadlineClarification(ruled.intentClass, scan)
        ? { kind: 'deadline', phrase: scan!.phrase }
        : null,
      via: 'rules'
    }
  }
  const modeled = await classifyWithModel(text)
  if (modeled) {
    return {
      intentClass: modeled.intentClass,
      confidence: modeled.confidence,
      title,
      dueAt: scan?.dueAt ?? null,
      clarify: needsDeadlineClarification(modeled.intentClass, scan)
        ? { kind: 'deadline', phrase: scan!.phrase }
        : null,
      via: 'model'
    }
  }
  // The floor: never block, never lose — file it lightly.
  return { intentClass: 'loose_thought', confidence: 0, title, dueAt: null, clarify: null, via: 'fallback' }
}
