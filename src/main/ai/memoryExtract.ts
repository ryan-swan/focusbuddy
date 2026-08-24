import type { MemoryKind } from '@shared/types'

// Pure prompt-building + parsing for local-model memory extraction. Dependency-
// free so it unit-tests directly; the model call + store live in extractMemory.ts.
// The contract: distil only DURABLE, genuinely-stated things — facts about the
// user and their work, standing preferences, and commitments (who owes what by
// when). Never infer or invent; a document with nothing durable yields nothing.

const MEMORY_CHARS = 6000

export const MEMORY_SYSTEM =
  'You build long-term memory for a personal assistant by reading a document and ' +
  'extracting only DURABLE, genuinely-stated things worth remembering later. Extract ' +
  'nothing that is not actually present. Never infer, guess, or invent people, ' +
  'commitments, or dates. If there is nothing durable, return empty arrays.'

export function buildMemoryPrompt(title: string, text: string): string {
  const body = text.replace(/\s+/g, ' ').trim().slice(0, MEMORY_CHARS)
  return (
    `Title: ${title || '(untitled)'}\n\n` +
    `Document:\n${body}\n\n` +
    'Return ONLY a JSON object with exactly these arrays (each item one sentence, grounded in the text):\n' +
    '{\n' +
    '  "facts": [{"text": "a durable fact about the user, their work, or a named entity", "subject": "the person/org/project it concerns, or \\"\\""}],\n' +
    '  "preferences": [{"text": "a standing preference or rule the user holds"}],\n' +
    '  "commitments": [{"text": "who will do what for whom", "subject": "who owes it", "due": "the deadline phrase verbatim, or \\"\\""}]\n' +
    '}'
  )
}

// The chat-shaped variant (A5, R22): the settle-time pass reads ONE exchange —
// the user's message and the assistant's answer — and distils only what the
// USER stated or agreed to. The assistant's own suggestions are not memories.
export function buildChatMemoryPrompt(userText: string, assistantText: string): string {
  const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n)
  return (
    'This is one exchange from a live conversation with the user.\n\n' +
    `User said:\n${clip(userText, 2000)}\n\n` +
    `Assistant answered:\n${clip(assistantText, 2000)}\n\n` +
    'Extract only durable things the USER stated, decided, or agreed to — never the ' +
    "assistant's suggestions, and never small talk or one-off task details. " +
    'Return ONLY a JSON object with exactly these arrays (each item one sentence, grounded in the exchange):\n' +
    '{\n' +
    '  "facts": [{"text": "a durable fact about the user, their work, or a named entity", "subject": "the person/org/project it concerns, or \\"\\""}],\n' +
    '  "preferences": [{"text": "a standing preference or rule the user holds"}],\n' +
    '  "commitments": [{"text": "who will do what for whom", "subject": "who owes it", "due": "the deadline phrase verbatim, or \\"\\""}]\n' +
    '}'
  )
}

export interface ExtractedMemory {
  kind: MemoryKind
  text: string
  subject: string
  due: string
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

// Parse the model's JSON into a flat, bounded list of memory drafts. Tolerant of
// a code fence or prose around the JSON. Drops items with no text. Returns [] on
// unparseable output (never fabricates a memory from nothing).
export function parseMemoryResponse(raw: string): ExtractedMemory[] {
  let jsonStr = raw.trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonStr = fence[1].trim()
  if (jsonStr[0] !== '{') {
    const i = jsonStr.indexOf('{')
    const j = jsonStr.lastIndexOf('}')
    if (i >= 0 && j > i) jsonStr = jsonStr.slice(i, j + 1)
  }
  let obj: { facts?: unknown; preferences?: unknown; commitments?: unknown }
  try {
    const p = JSON.parse(jsonStr)
    if (!p || typeof p !== 'object' || Array.isArray(p)) return []
    obj = p as Record<string, unknown>
  } catch {
    return []
  }
  const out: ExtractedMemory[] = []
  const facts = Array.isArray(obj.facts) ? obj.facts : []
  for (const f of facts) {
    const text = str((f as Record<string, unknown>)?.text)
    if (text) out.push({ kind: 'fact', text, subject: str((f as Record<string, unknown>)?.subject, 80), due: '' })
  }
  const prefs = Array.isArray(obj.preferences) ? obj.preferences : []
  for (const p of prefs) {
    const text = str((p as Record<string, unknown>)?.text)
    if (text) out.push({ kind: 'preference', text, subject: '', due: '' })
  }
  const commits = Array.isArray(obj.commitments) ? obj.commitments : []
  for (const cm of commits) {
    const text = str((cm as Record<string, unknown>)?.text)
    if (text) {
      out.push({
        kind: 'commitment',
        text,
        subject: str((cm as Record<string, unknown>)?.subject, 80),
        due: str((cm as Record<string, unknown>)?.due, 80)
      })
    }
  }
  // Bound the total so one document can't flood memory.
  return out.slice(0, 20)
}
