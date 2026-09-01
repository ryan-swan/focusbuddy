// M2b (SPEC-003 §3.4) — the Enhance pass: merge the transcript's segments
// into a provenance-tiered Record. The CONTRACT (S3-DEC-021) is the whole
// feature: the model must return spans with segment references, not prose.
// The renderer validates every span against the real segment set and
// downgrades anything unprovable — this module never gets to assert `heard`,
// only to claim it. `yours` spans are not produced here at all; the
// renderer builds them from the user's notes, verbatim.

import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'

export interface EnhanceInput {
  title: string
  notes: string
  segments: Array<{ id: string; startMs: number; speakerName: string; text: string }>
}

export interface EnhanceSpanRaw {
  tier: 'heard' | 'inferred'
  text: string
  segmentId?: string
  section?: string
}

export async function enhanceRecord(
  input: EnhanceInput
): Promise<{ ok: true; spans: EnhanceSpanRaw[] } | { ok: false; error: string }> {
  try {
    const client = getSharedAiClient()
    if (!client) return { ok: false, error: 'No AI key configured.' }
    const model = resolveModel('intent_classify')
    const segLines = input.segments
      .slice(0, 400)
      .map((s) => `${s.id} :: [${Math.floor(s.startMs / 1000)}s] ${s.speakerName}: ${s.text}`)
      .join('\n')
    const resp = await client.messages.create({
      model,
      max_tokens: 1800,
      system:
        'You build a meeting Brief from an attributed transcript and the attendee\'s own rough notes. ' +
        'Output JSON only: {"spans":[{"tier":"heard"|"inferred","text":"...","segmentId":"...","section":"..."}]}.\n' +
        'Rules, absolute:\n' +
        '- "heard" = a claim drawn from ONE specific transcript segment. It MUST carry that segment\'s id, verbatim from the list. ' +
        'If you cannot point at the segment, the tier is "inferred". A heard claim without its segmentId will be discarded as unproven.\n' +
        '- "inferred" = your synthesis (summaries, connections, context). No segmentId.\n' +
        '- Never restate the attendee\'s notes as your own spans — their words are rendered separately, verbatim.\n' +
        '- Group spans under sections: "What happened", "Decisions", "Open questions". 6-14 spans total.\n' +
        'No prose outside the JSON.',
      messages: [
        {
          role: 'user',
          content: `Meeting: ${input.title}\n\nAttendee's own notes (context only — never restate):\n${input.notes || '(none)'}\n\nTranscript segments (id :: [time] speaker: text):\n${segLines}`
        }
      ]
    })
    recordAiUsage(model, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0)
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
    const json = extractJson(text)
    if (!json) return { ok: false, error: 'The model returned no JSON.' }
    const parsed = JSON.parse(json) as { spans?: unknown }
    if (!Array.isArray(parsed.spans)) return { ok: false, error: 'The model returned no spans.' }
    return { ok: true, spans: parsed.spans as EnhanceSpanRaw[] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
