// The @attention command grammar — ONE parser, every surface (chat composer,
// ⌘K, the home bar) reads it. Pure and dependency-free so the rules are
// unit-tested directly rather than inferred from four regexes that drift.
//
// DEC-031 (operator ruling, 2026-08-26) amends DEC-027's "mid-sentence keeps
// the AI proposal path": @attention ANYWHERE is now a DETERMINISTIC capture.
// The distinction that survives is about the REST of the message, not about
// whether the capture happens:
//
//   LEADING  "@attention call Bob Thursday"
//     → the whole remainder is the capture. Nothing reaches the model; this is
//       the pure capture gesture (DEC-028's inline card).
//
//   INLINE   "draft the Cetra pitch deck by friday @attention"
//     → the capture is GUARANTEED (was: a prompt rule the model could and did
//       ignore — the operator's live case produced only a page), AND the
//       message still goes to the assistant with the token stripped, so the
//       buildable half he asked for still happens. Both, deterministically.
//
// A bare "@attention" with no other words captures nothing (there is no
// thought yet) — callers treat that as "open the capture surface empty".

export type AttentionMode = 'none' | 'leading' | 'inline'

export interface AttentionCommand {
  mode: AttentionMode
  /** The text to file. Empty when the token stood alone. */
  captureText: string
  /** What the assistant should still receive; null when nothing should be sent
   *  (the leading form is a capture, never a message). */
  messageText: string | null
}

/** The token itself: "@attention", optionally trailing ':' or ',', at a word
 *  boundary so "user@attention.example" can never trip it. */
const TOKEN = /(^|\s)@attention\b[:,]?/gi

/** Does this text carry the command at all? (Cheap guard for hot paths.) */
export function hasAttentionCommand(text: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(text)
}

/** True only when the token OPENS the text — the pure capture gesture. */
export function isLeadingAttention(text: string): boolean {
  return /^@attention\b[:,]?/i.test(text.trim())
}

function stripToken(text: string): string {
  TOKEN.lastIndex = 0
  return text.replace(TOKEN, ' ').replace(/\s+/g, ' ').trim()
}

export function parseAttentionCommand(raw: string): AttentionCommand {
  const text = raw.trim()
  if (!text || !hasAttentionCommand(text)) {
    return { mode: 'none', captureText: '', messageText: text || null }
  }
  const rest = stripToken(text)
  if (isLeadingAttention(text)) {
    // Pure capture — the model never sees it.
    return { mode: 'leading', captureText: rest, messageText: null }
  }
  // Capture AND converse. An inline token that leaves nothing behind is
  // meaningless as a message, so it degrades to the capture-only shape.
  return { mode: 'inline', captureText: rest, messageText: rest || null }
}
