// The capture classifier (Attention S5) — hard rules first, Haiku fallback,
// to_remember floor. A capture is NEVER lost or blocked: every failure mode
// (no key, timeout, garbage output) degrades to
// { intentClass:'to_remember', confidence:0 } and the item still files.
//
// The standup split applied to classification: deterministic triggers resolve
// most captures with zero model latency (R011); only genuinely ambiguous prose
// pays for a model call, tagged purpose 'intent_classify' (Haiku-routed).

import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'
import { canonicalIntentClass } from '@shared/workItems'
import { PROTOCOL_VOCAB_NOTE } from './vocabulary'
import { listPeopleDirectory } from '../peopleDirectory'
import { extractPeople, type PersonClarify, type PersonSuggestion } from './peopleExtract'
import {
  classifyByRules,
  scanDeadline,
  needsDeadlineClarification,
  titleFromCapture,
  splitCompound,
  secondaryCaptures,
  type IntentClass,
  type SecondaryIntent
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
  /** DEC-025: further intents the compound carried (rules-only, ≤3). The
   *  console offers them as pre-checked chips on the same confirm stop. */
  secondaries: SecondaryIntent[]
  /** DEC-088 — directory-grounded people the text references, deterministic
   *  (peopleExtract.ts). Suggested mentions, accent-marked at the confirm
   *  stop; empty whenever the directory is (honesty over recall). */
  people: PersonSuggestion[]
  /** DEC-088 — ONE ambiguous single-name reference ("Which Caleb?") for the
   *  People drawer. The deadline question still outranks it at auto-open. */
  personClarify: PersonClarify | null
}

async function classifyWithModel(text: string): Promise<{ intentClass: IntentClass; confidence: number } | null> {
  try {
    // Credits-aware (F-8 family): the fallback classifier must work on
    // PlexiDesk credits too, not only BYOK. Plain create() — credits-safe.
    const client = getSharedAiClient()
    if (!client) return null
    const model = resolveModel('intent_classify')
    const resp = await client.messages.create({
      model,
      max_tokens: 120,
      system:
        'You classify ONE captured note into exactly one intent class. ' +
        'Classes: to_do (something to be done), to_review (approval/judgment/sign-off on an artifact), ' +
        'to_decide (a choice to make between options), to_respond (someone awaits words back — answers, replies, acknowledgments), ' +
        'to_meet (time/meeting related), to_discuss (talk through live, agenda material), ' +
        'to_remember (idle low-stakes fragment worth keeping), to_know (information worth keeping, nothing owed back).\n' +
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
    // canonicalIntentClass also maps legacy names a stale prompt cache might
    // still emit ('action', 'fyi', …) forward instead of dropping them.
    const cls = canonicalIntentClass(parsed.intentClass)
    if (!cls) return null
    const conf = Number(parsed.confidence)
    return { intentClass: cls as IntentClass, confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5 }
  } catch {
    return null
  }
}

export async function classifyCapture(text: string, now = new Date()): Promise<CaptureClassification> {
  // DEC-025: a compound capture classifies its PRIMARY on the first segment —
  // each loop gets its own text — while notes keep the full capture verbatim
  // (the console stores `text` unchanged). Secondaries are rules-only.
  const segments = splitCompound(text)
  const primaryText = segments.length > 1 ? segments[0] : text
  const secondaries = secondaryCaptures(text, now)
  const title = titleFromCapture(primaryText)
  const scan = scanDeadline(primaryText, now)
  // DEC-088 — people can appear in ANY segment of a compound; scan the whole
  // capture. Deterministic, so the rules fast path stays model-free.
  const peopleScan = extractPeople(text, listPeopleDirectory())
  const ruled = classifyByRules(primaryText)
  if (ruled) {
    return {
      intentClass: ruled.intentClass,
      confidence: ruled.confidence,
      title,
      dueAt: scan?.dueAt ?? null,
      clarify: needsDeadlineClarification(ruled.intentClass, scan)
        ? { kind: 'deadline', phrase: scan!.phrase }
        : null,
      via: 'rules',
      secondaries,
      people: peopleScan.people,
      personClarify: peopleScan.clarify
    }
  }
  const modeled = await classifyWithModel(primaryText)
  if (modeled) {
    return {
      intentClass: modeled.intentClass,
      confidence: modeled.confidence,
      title,
      dueAt: scan?.dueAt ?? null,
      clarify: needsDeadlineClarification(modeled.intentClass, scan)
        ? { kind: 'deadline', phrase: scan!.phrase }
        : null,
      via: 'model',
      secondaries,
      people: peopleScan.people,
      personClarify: peopleScan.clarify
    }
  }
  // The floor: never block, never lose — file it lightly.
  return {
    intentClass: 'to_remember',
    confidence: 0,
    title,
    dueAt: null,
    clarify: null,
    via: 'fallback',
    secondaries,
    people: peopleScan.people,
    personClarify: peopleScan.clarify
  }
}
