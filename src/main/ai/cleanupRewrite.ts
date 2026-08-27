// The opt-in capture tidy (DEC-026, Δ6) — the model half behind the pure
// `needsCleanup` gate (intentRules.ts).
//
// Contract: PROPOSE-AND-APPROVE, never silent. This function only produces a
// proposal; the console shows it as an offer on the already-open confirm
// screen and nothing changes unless the operator clicks "Use tidied". The
// verbatim capture text is ALWAYS preserved in the item's notes either way —
// a tidy adds a clean title and gist, it never destroys what was written.
//
// Latency: never on the capture path. The console fires this async AFTER the
// confirm screen is up; a slow or failed proposal simply never appears.
// Every failure mode returns null — no error surface, no retry, no blocking.

import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'
import { qualifiesForTidy } from './intentRules'

export interface CleanupProposal {
  /** A crisp title, ≤90 chars, stating the actual ask/fact. */
  title: string
  /** A tidied one-to-three sentence gist. Facts only, nothing invented. */
  note: string
}

export async function proposeCleanup(
  text: string,
  notes?: string
): Promise<CleanupProposal | null> {
  const t = text.trim()
  // DEC-034: the operator's optional notes field rides the same tidy — "clean
  // up any notes (if there are any)". The messiness gate reads BOTH, so a
  // crisp task line with a rambling note still qualifies.
  const n = (notes ?? '').trim()
  if (!qualifiesForTidy(t, n)) return null
  try {
    // Credits-aware (F-8 family): the tidy works on PlexiDesk credits too.
    const client = getSharedAiClient()
    if (!client) return null
    const model = resolveModel('capture_cleanup')
    const resp = await client.messages.create({
      model,
      max_tokens: 250,
      system:
        'You tidy ONE messy captured note. Extract a crisp title (max 90 chars) stating the ' +
        'actual ask or fact, and a clean 1-3 sentence note preserving EVERY concrete detail ' +
        '(names, dates, amounts, links). Never invent, never editorialize, never drop a fact. ' +
        'Keep the writer\'s language. When NOTES are supplied, tidy them into the note field ' +
        'rather than replacing them with a summary of the title. ' +
        'Return ONLY JSON: {"title":"...","note":"..."}. No prose.',
      messages: [
        { role: 'user', content: (n ? `TASK: ${t}\n\nNOTES: ${n}` : t).slice(0, 4000) }
      ]
    })
    recordAiUsage(model, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0)
    const out = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
    const json = extractJson(out)
    if (!json) return null
    const parsed = JSON.parse(json) as { title?: unknown; note?: unknown }
    const title = String(parsed.title ?? '').trim()
    const note = String(parsed.note ?? '').trim()
    if (!title || title.length > 140) return null
    return { title: title.length > 90 ? `${title.slice(0, 87)}…` : title, note }
  } catch {
    return null
  }
}
