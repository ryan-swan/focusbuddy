// Pure reveal math for the streaming turn (Plexii UI/UX P3). Dependency-free
// so the anti-jitter rules are unit-testable without React or markdown.

// Constant reveal pace. ~220 chars/sec ≈ 260 wpm — the research band's fast
// edge, so the app feels quick, never theatrical. When the buffer backs up
// (a burst landed, or the tab was hidden), the pace triples until caught up:
// smoothing must never turn into artificial lag.
export const REVEAL_CPS = 220
export const CATCHUP_AT = 1200
export const CATCHUP_FACTOR = 3
// Commit to React at most ~22fps. Per-frame reparses buy nothing visually and
// cost markdown parsing; the word fade carries the sense of continuous motion.
export const COMMIT_MS = 45

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
