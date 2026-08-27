import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'

// DEC-052 (Track B3, mode b) — the intent-driven planner's SELECTION step.
// The operator's example: "I'm feeling really motivated to take on the CETRA
// project today" → compile the relevant open items. This module only PICKS
// AND ORDERS item ids; placement stays in the pure renderer planner, and
// nothing lands without the preview-confirm.
//
// Same resilience contract as the capture classifier: every failure mode (no
// key, timeout, garbage output) degrades to a deterministic keyword match, so
// the Plan button never dies with the model.

export interface PlanCandidate {
  id: string
  title: string
  /** Comma tags + mention titles + desk title, pre-joined by the renderer. */
  context: string
}

export interface PlanSelection {
  ids: string[]
  /** One short line the preview shows ("6 CETRA items, deadline first"). */
  note: string | null
  via: 'model' | 'fallback'
}

/** Deterministic fallback: every whitespace token of the intent that is 3+
 *  chars must... no — ANY token matching title/context keeps the item, ranked
 *  by how many tokens hit. Zero hits = not selected. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'today', 'tomorrow', 'take',
  'want', 'wanna', 'feel', 'feeling', 'really', 'lets', 'get', 'going',
  'work', 'working', 'stuff', 'things', 'motivated', 'focus', 'day'
])

export function selectByKeywords(intent: string, candidates: PlanCandidate[]): string[] {
  const tokens = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  if (!tokens.length) return []
  const scored = candidates
    .map((c) => {
      const hay = `${c.title} ${c.context}`.toLowerCase()
      const hits = tokens.filter((t) => hay.includes(t)).length
      return { id: c.id, hits }
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
  return scored.map((s) => s.id)
}

export async function selectItemsForPlan(
  intent: string,
  candidates: PlanCandidate[]
): Promise<PlanSelection> {
  const trimmed = intent.trim()
  if (!trimmed || candidates.length === 0) return { ids: [], note: null, via: 'fallback' }
  const fallback = (): PlanSelection => ({
    ids: selectByKeywords(trimmed, candidates),
    note: null,
    via: 'fallback'
  })
  try {
    const client = getSharedAiClient()
    if (!client) return fallback()
    const model = resolveModel('intent_classify')
    const list = candidates
      .slice(0, 120)
      .map((c) => `${c.id} :: ${c.title}${c.context ? ` [${c.context}]` : ''}`)
      .join('\n')
    const resp = await client.messages.create({
      model,
      max_tokens: 400,
      system:
        'You select which open work items match what the user wants to work on today, ' +
        'and order them best-first (their stated focus first, deadlines next). ' +
        'Select ONLY items genuinely related to the stated intent — an empty selection is a valid answer. ' +
        'Return ONLY JSON: {"ids":["..."],"note":"one short line describing the selection"}. No prose.',
      messages: [
        {
          role: 'user',
          content: `Intent: ${trimmed}\n\nOpen items (id :: title [context]):\n${list}`
        }
      ]
    })
    recordAiUsage(model, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0, 0, 0)
    const text = resp.content.find((b) => b.type === 'text')?.text ?? ''
    const json = extractJson(text)
    if (!json) return fallback()
    const parsed = JSON.parse(json) as { ids?: unknown; note?: unknown }
    const valid = new Set(candidates.map((c) => c.id))
    const ids = Array.isArray(parsed.ids)
      ? (parsed.ids as unknown[]).map(String).filter((id) => valid.has(id))
      : []
    if (!ids.length) return fallback()
    return {
      ids,
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 120) : null,
      via: 'model'
    }
  } catch {
    return fallback()
  }
}
