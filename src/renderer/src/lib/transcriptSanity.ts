// DEC-130 — a transcript that is not a transcript.
//
// Speech engines do not return "nothing" for silence: Whisper hallucinates a
// stock phrase ("Thank you.", "you you you you") and the pipeline then
// summarises it, files a meeting and offers deliverables for a conversation
// that never happened — the operator's own three-minute "you you you you you
// you" record (2026-09-07). The wrap-up asks this before it believes a
// transcript; an honest "no speech was captured" beats a fake meeting.

const HALLUCINATION_PHRASES = [
  /^(thank you|thanks|thank you very much|thanks for watching|thank you for watching)[.!]*$/i,
  /^(you|bye|bye bye|okay|ok|so|the end|goodbye|hello|mm-?hmm|uh|um)[.!]*$/i,
  /^subtitles? by [\w .-]+$/i,
  /^\[[^\]]*\]$/ // "[BLANK_AUDIO]", "[music]" and the like
]

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** True when `text` cannot be real speech from `durationSec` of audio. */
export function transcriptLooksEmpty(text: string, durationSec: number | null | undefined): boolean {
  const t = text.trim()
  if (!t) return true
  const w = words(t)
  if (w.length === 0) return true
  const distinct = new Set(w).size
  // "you you you you you you" — one or two words, over and over.
  if (w.length >= 3 && distinct <= 2) return true
  // A stock phrase standing alone is silence's signature at any length.
  if (HALLUCINATION_PHRASES.some((re) => re.test(t))) return true
  const d = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null
  // A long take with almost no text — under a character every seven seconds
  // — is a machine filling silence, not a person who said little: a real
  // three-word answer in a long recording still clears this.
  if (d != null && d >= 60 && t.length / d < 0.15) return true
  return false
}

export const NO_SPEECH_MESSAGE =
  'No speech was captured in this conversation, so there is nothing to summarise. If the microphone was silent, check System Settings › Privacy & Security › Microphone.'
