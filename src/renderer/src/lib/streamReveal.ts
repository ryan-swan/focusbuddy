// Pure reveal math for the streaming turn (Plexii UI/UX P3). Dependency-free
// so the anti-jitter rules are unit-testable without React or markdown.

// Constant reveal pace. ~220 chars/sec ≈ 260 wpm — the research band's fast
// edge, so the app feels quick, never theatrical. There is deliberately no
// catch-up mode any more: Caleb's ruling is "same pace to the end" — a burst
// or an early finish is never repaid as a flood (the bank clamp in
// StreamingProse is the whole mechanism).
export const REVEAL_CPS = 220

// ── Sentence waves (AI-30) ────────────────────────────────────────────────
//
// Caleb's third rejudge retired per-character typing: "I want it to populate
// into sections… a few sentences at a time", with the same gentle rise the
// Office inbox rows make. The answer is therefore revealed in WAVES — a wave
// is up to WAVE_SENTENCES sentences of one paragraph, or one block row (a
// list item, a heading, a table row, a whole fence). Each wave lands as a
// unit; the pace clock below decides WHEN, these functions decide WHERE.

// Sentences per wave inside a paragraph, and the length past which a single
// long sentence is its own wave rather than waiting for a partner.
export const WAVE_SENTENCES = 2
export const WAVE_MAX_CHARS = 240
// The floor between two waves, so short rows (list items) cascade at the
// inbox rhythm rather than stacking up in one frame.
export const WAVE_MIN_BEAT_MS = 140

// Sentence-final punctuation followed by closers, then whitespace, then the
// start of something new. Abbreviations and initials are the usual false
// positives: a lone capital ("J. Smith"), common titles, "e.g."/"i.e.", and
// decimals never end a sentence.
const SENTENCE_END = /[.!?]["')\]*_~]*(?=\s)/g
const NOT_A_SENTENCE_END = /(?:\b[A-Z]|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|est|No|Inc|Ltd|Co)|\b(?:e\.g|i\.e)|\d)\.$/

function isSentenceEnd(text: string, punctAt: number): boolean {
  const head = text.slice(Math.max(0, punctAt - 12), punctAt + 1)
  if (text[punctAt] === '.' && NOT_A_SENTENCE_END.test(head)) return false
  return true
}

// Every offset where a wave may close: `end` is exclusive and always lands on
// whitespace, so `text.slice(0, end)` ends on the sentence's last character.
// A `line` boundary (any newline) always closes a wave; a `sentence` one
// closes it once the wave has enough sentences or length.
function waveCandidates(text: string): { end: number; kind: 'line' | 'sentence' }[] {
  const out: { end: number; kind: 'line' | 'sentence' }[] = []
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push({ end: i, kind: 'line' })
  let m: RegExpExecArray | null
  while ((m = SENTENCE_END.exec(text)) !== null) {
    const end = m.index + m[0].length
    if (isSentenceEnd(text, m.index)) out.push({ end, kind: 'sentence' })
  }
  out.sort((a, b) => a.end - b.end)
  return out
}

// The exclusive end offsets of every wave that can be shown. A wave exists
// only when the text after its boundary has arrived (or `final` says no more
// is coming), and only where the prefix renders true — safeCut is the judge,
// so a wave never closes inside an unfinished construct: a fence, a table
// waiting for its delimiter row, an open **bold**. Pure and monotone in
// `text` for an append-only stream, so wave k keeps its offset as later text
// lands — the renderer relies on that to keep earlier waves' DOM stable.
export function waveEnds(text: string, final: boolean): number[] {
  const ends: number[] = []
  let start = 0
  let sentences = 0
  let lastLineEnd = -1
  for (const c of waveCandidates(text)) {
    if (c.end <= start) continue
    // A run of newlines is one boundary: collapse blank lines onto the first.
    if (c.kind === 'line') {
      if (c.end === lastLineEnd + 1) {
        lastLineEnd = c.end
        continue
      }
      lastLineEnd = c.end
      if (text.slice(start, c.end).trim() === '') {
        continue
      }
    }
    if (safeCut(text, c.end).length !== c.end) continue
    if (c.kind === 'sentence') {
      sentences++
      const len = c.end - start
      if (sentences < WAVE_SENTENCES && len < WAVE_MAX_CHARS) continue
    }
    ends.push(c.end)
    start = c.end
    sentences = 0
  }
  if (final && text.length > start && text.slice(start).trim() !== '') ends.push(text.length)
  return ends
}

// Cut a reveal position back to safe ground: never mid-word (the fade would
// animate half-tokens), and never inside an UNFINISHED markdown construct.
//
// The renderer re-parses the visible text on every commit, so anything shown
// while structurally incomplete renders one way and then SNAPS to another the
// moment its closing characters arrive — `**bold` flashes as literal
// asterisks, a table header reads as a pipe-riddled paragraph until its
// delimiter row lands, a bare `##` line flickers from paragraph to heading.
// Caleb's live drive judged that churn "so incredibly glitchy it would turn
// anyone off" (AI-27). The rule this module enforces: text is revealed only
// once it can render TRUE — a construct is held back whole, then appears
// formed. Fences had this rule from P3; every other construct now shares it.
export function safeCut(target: string, len: number): string {
  if (len >= target.length) return target
  let cut = len
  // Back up to the last whitespace so only whole words appear.
  while (cut > 0 && !/\s/.test(target[cut])) cut--
  let visible = target.slice(0, cut)
  // Each hold can expose a new incomplete construct at the fresh tail (cut a
  // table back and the text may now end in `**`), so run to a fixpoint. The
  // bound is generous: every pass strictly shortens the string.
  for (let pass = 0; pass < 8; pass++) {
    const next = holdIncomplete(visible)
    if (next === visible) break
    visible = next
  }
  return visible
}

// Blank out CLOSED code regions (fenced blocks, then inline spans) with
// spaces, index-preserving, so structural counting below never mistakes a
// literal `**`, `[`, or `|` inside code for markdown syntax.
function maskCode(s: string): string {
  const out = s.split('')
  let m: RegExpExecArray | null
  const fence = /```[\s\S]*?```/g
  while ((m = fence.exec(s)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) out[i] = ' '
  }
  const masked = out.join('')
  const inline = /`[^`\n]*`/g
  while ((m = inline.exec(masked)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) out[i] = ' '
  }
  return out.join('')
}

// An INLINE construct that is still open after this many characters is not a
// construct — it is a stray unpaired marker the model left in its prose. An
// unbounded hold on one of those hid the ENTIRE rest of the answer and then
// flooded it at completion (Caleb's second rejudge: "took a few seconds and
// just populated"). Past the cap, showing the literal beats hiding the text;
// fences stay unbounded on purpose — a code block legitimately runs long and
// arriving whole is its shipped, judged behaviour.
const MAX_INLINE_HOLD = 160

// One holdback pass. Returns `visible` unchanged when it already ends on
// renderable ground, or a shorter string cut before the first construct that
// cannot yet render true.
function holdIncomplete(visible: string): string {
  // Unclosed ``` fence: hold it whole (the original P3 rule).
  const fences = visible.match(/```/g)
  if (fences && fences.length % 2 === 1) {
    return visible.slice(0, visible.lastIndexOf('```'))
  }
  // Bounded hold for inline constructs: null means "too far back — a stray
  // marker, reveal the literal rather than hide the tail".
  const holdAt = (at: number): string | null =>
    at >= 0 && visible.length - at <= MAX_INLINE_HOLD ? visible.slice(0, at) : null
  const masked = maskCode(visible)
  // Unclosed inline code: any backtick surviving the mask has no closer yet.
  {
    const h = holdAt(masked.lastIndexOf('`'))
    if (h !== null) return h
  }
  // Unclosed strong / strikethrough runs flash as literal marks, then snap.
  for (const mark of ['**', '~~']) {
    const count = masked.split(mark).length - 1
    if (count % 2 === 1) {
      const h = holdAt(masked.lastIndexOf(mark))
      if (h !== null) return h
    }
  }
  // An unmatched "[" is a link, image, or citation still being written.
  {
    const stack: number[] = []
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] === '[') stack.push(i)
      else if (masked[i] === ']') stack.pop()
    }
    if (stack.length > 0) {
      const at = stack[stack.length - 1]
      const h = holdAt(visible[at - 1] === '!' ? at - 1 : at)
      if (h !== null) return h
    }
    // "](url…" whose ")" has not arrived: hold from the matching "[".
    const lp = masked.lastIndexOf('](')
    if (lp >= 0 && masked.indexOf(')', lp) === -1) {
      let at = lp
      let depth = 0
      for (let i = lp; i >= 0; i--) {
        if (masked[i] === ']') depth++
        else if (masked[i] === '[') {
          depth--
          if (depth === 0) {
            at = visible[i - 1] === '!' ? i - 1 : i
            break
          }
        }
      }
      const h = holdAt(at)
      if (h !== null) return h
    }
  }
  const nl = visible.lastIndexOf('\n')
  const lastLine = visible.slice(nl + 1)
  // A trailing line that is ONLY a block marker so far (`##`, `>`, `-`, `2.`,
  // a forming `---` rule) renders as a stray paragraph, then flips when its
  // content arrives. Hold the line until it has substance.
  if (/^\s*(#{1,6}|>+|[-*+]{1,3}|\d{1,3}\.?)\s*$/.test(lastLine)) {
    return visible.slice(0, Math.max(0, nl))
  }
  // Tables. A header row without its delimiter line renders as pipe-riddled
  // prose and then reflows into a table — hold the whole block until the
  // delimiter lands; after that, reveal only WHOLE rows.
  if (/^\s*\|/.test(lastLine)) {
    const lines = visible.split('\n')
    let start = lines.length - 1
    while (start - 1 >= 0 && /^\s*\|/.test(lines[start - 1])) start--
    const block = lines.slice(start)
    const delimOk =
      block.length >= 2 && block[1].includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(block[1])
    if (!delimOk) return lines.slice(0, start).join('\n')
    if (!/\|\s*$/.test(lastLine)) return visible.slice(0, Math.max(0, nl))
  }
  return visible
}
