import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'
import { PLAN_STOPWORDS as STOPWORDS } from '../../shared/planLanguage'

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
// DEC-090 — the stopword list moved to shared/planLanguage.ts (one list,
// shared with the renderer's topic detector, or the two drift).

// DEC-071 — how much of the model's note survives, and how it is cut.
//
// It was a bare `.slice(0, 120)`: a DISPLAY limit enforced at the DATA layer,
// sized for the one-line plan bar that used to be the note's only home. With a
// review pane there is room for a real sentence, and 120 characters was cutting
// mid-word — the operator's own plan ended "…Cetra pitch deck—all high-cr".
//
// A bound is still required: this is model output, and an unbounded string
// reaches the renderer and the database. So: a wider cap, cut on a word
// boundary, and an ellipsis so a truncated note LOOKS truncated instead of
// looking like the model stopped mid-thought.
export const PLAN_NOTE_MAX = 400

export function trimNote(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (t.length <= PLAN_NOTE_MAX) return t
  const cut = t.slice(0, PLAN_NOTE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  // Fall back to the hard cut when there is no space to break on — a single
  // 400-character token is not a sentence, and half of one is no worse.
  return `${(lastSpace > PLAN_NOTE_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

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
        'You select which open work items match what the user wants to work on, ' +
        'and order them best-first (their stated focus first, deadlines next). ' +
        'Select ONLY items genuinely related to the stated intent. ' +
        'Time or day words ("tomorrow", "first half of the day", "later", "this week") describe WHEN ' +
        'to schedule, never WHICH items to pick — ignore them for selection. ' +
        'If no items genuinely relate to the named topic, project or person, return {"ids":[]} with a note ' +
        'saying what you looked for — do NOT pad the selection with unrelated items. ' +
        'If the intent names NO particular topic ("plan everything", "spread my items across the week"), ' +
        'that means ALL items — select every id. ' +
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
    if (!Array.isArray(parsed.ids)) return fallback()
    const ids = (parsed.ids as unknown[]).map(String).filter((id) => valid.has(id))
    // DEC-090 — an EMPTY model selection is an honest answer ("no Cetra
    // items are open"), not a failure. Overriding it with the keyword
    // fallback was the hallucination the operator saw: scaffolding words
    // matched random items and the plan confidently scheduled them. Only a
    // failed call (no JSON, bad shape, thrown) falls back.
    return {
      ids,
      note: typeof parsed.note === 'string' ? trimNote(parsed.note) : null,
      via: 'model'
    }
  } catch {
    return fallback()
  }
}
