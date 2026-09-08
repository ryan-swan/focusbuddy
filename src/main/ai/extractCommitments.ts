// M3 (SPEC-003 §3.6) — the commitment extractor, and the contract that keeps
// it honest (S3-DEC-021 applied to commitments): every commitment must point
// at the SEGMENT where it was made. One that cannot is still shown — people
// commit to things in ways transcription mangles — but it arrives marked
// unanchored, rendered as the machine's guess, never as established fact.
// The renderer validates every anchor against the real segment set; this
// module can only claim, never assert.
//
// Owners come from the ROSTER (per-track capture means the speaker of the
// anchoring segment is known exactly) — the model names an owner only from
// the people who were actually there, or leaves it null.

import { getSharedAiClient } from './anthropic'
import { resolveModel } from './modelRouting'
import { recordAiUsage } from '../db/telemetry'
import { extractJson } from './chatJson'

export interface ExtractInput {
  title: string
  notes: string
  segments: Array<{ id: string; startMs: number; speakerName: string; speakerAccountId: string | null; text: string }>
  roster: Array<{ accountId: string; name: string }>
}

export interface RawCommitment {
  title: string
  ownerAccountId?: string | null
  ownerName?: string | null
  dueAt?: string | null
  intentClass?: string
  segmentId?: string | null
}

export async function extractCommitments(
  input: ExtractInput
): Promise<{ ok: true; commitments: RawCommitment[] } | { ok: false; error: string }> {
  try {
    const client = getSharedAiClient()
    if (!client) return { ok: false, error: 'No AI key configured.' }
    const model = resolveModel('intent_classify')
    const segLines = input.segments
      .slice(0, 400)
      .map((s) => `${s.id} :: [${Math.floor(s.startMs / 1000)}s] ${s.speakerName}: ${s.text}`)
      .join('\n')
    const rosterLine = input.roster.map((r) => `${r.accountId} = ${r.name}`).join(', ')
    const resp = await client.messages.create({
      model,
      max_tokens: 1200,
      system:
        'You extract COMMITMENTS from a meeting transcript: things a specific person agreed to do, ' +
        'and decisions that were made. Not topics, not summaries — obligations and rulings only.\n' +
        'Output JSON only: {"commitments":[{"title":"...","ownerAccountId":"...or null","ownerName":"...or null",' +
        '"dueAt":"ISO date or null","intentClass":"to_do|to_respond|to_decide|to_review","segmentId":"...or null"}]}.\n' +
        'Rules, absolute:\n' +
        '- segmentId is the segment where the commitment was MADE, verbatim from the list. If you cannot point at ' +
        'the moment, set it null — the item will be marked unverified, which is honest; a wrong anchor is not.\n' +
        '- The owner is who took it on, ONLY from the roster given. Someone outside the roster: ownerAccountId null, ' +
        'ownerName as spoken. Nobody stated: both null.\n' +
        '- dueAt only when a date or day was actually said. Never invent deadlines.\n' +
        '- Titles are imperative and short ("Send Doug the revised contract"), not quotes.\n' +
        '- 0 commitments is a valid answer. Do not pad.\n' +
        'No prose outside the JSON.',
      messages: [
        {
          role: 'user',
          content: `Meeting: ${input.title}\nRoster: ${rosterLine || '(solo)'}\n\nAttendee notes (context):\n${input.notes || '(none)'}\n\nTranscript segments (id :: [time] speaker: text):\n${segLines}`
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
    const parsed = JSON.parse(json) as { commitments?: unknown }
    if (!Array.isArray(parsed.commitments)) return { ok: false, error: 'The model returned no commitments array.' }
    return { ok: true, commitments: parsed.commitments as RawCommitment[] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
