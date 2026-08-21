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
// animate half-tokens), and never inside an unclosed ``` fence (a torn fence
// would render the tail as a code block and reflow everything above it).
export function safeCut(target: string, len: number): string {
  if (len >= target.length) return target
  let cut = len
  // Back up to the last whitespace so only whole words appear.
  while (cut > 0 && !/\s/.test(target[cut])) cut--
  let visible = target.slice(0, cut)
  // Hold back an odd trailing fence entirely.
  const fences = visible.match(/```/g)
  if (fences && fences.length % 2 === 1) {
    visible = visible.slice(0, visible.lastIndexOf('```'))
  }
  return visible
}
