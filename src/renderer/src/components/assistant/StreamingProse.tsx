import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCitations from '../../lib/remarkCitations'
import { waveEnds, REVEAL_CPS, WAVE_MIN_BEAT_MS } from '../../lib/streamReveal'

// The living text (Plexii UI/UX P3, reshaped by AI-30). Network chunks arrive
// in bursts, but the DISPLAY reveals at a constant readable pace. The unit of
// reveal is a WAVE — a couple of sentences, or one row of a list or table —
// and each wave rises into place the way an Office inbox row does, so the
// answer reads as sections settling rather than as paint or as a typewriter.
// Server speed and display speed are decoupled: the pace clock keeps its
// rhythm to the very last wave, including after the stream has ended. An
// answer that arrived in one burst still lands in waves, never all at once.
//
// Used for the actively-streaming turn AND for the same turn while it drains
// after completion (the caller keeps this mounted until `onDrained`).
// Completed turns render through ChatBlockView, which is also what guarantees
// the no-replay rule: scroll-back never re-animates.

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The clock may bank at most this many characters ahead of the last landed
// wave — enough to absorb token jitter (~a third of a second), not enough to
// repay a stall upstream (the model pausing, the stream closing late) as a
// flood: every wave still takes its own time to land.
const BANK_CHARS = 80

export interface WaveReveal {
  // The text to render: whole waves only.
  visible: string
  // Where each visible wave begins, ascending, starting at 0. Stable for an
  // append-only stream — the renderer splits text at these offsets so earlier
  // waves keep their DOM nodes (and never re-animate) as later ones land.
  waveStarts: number[]
  // Every wave of a finished stream is on screen.
  drained: boolean
}

// Reveal `target` (a cumulative, append-only string) wave by wave at constant
// pace. `active` is true while the stream is open; once it closes the trailing
// text becomes the last wave and the clock runs on until it has landed.
// `holdUntil` (epoch ms) delays the first wave — the trace's source cascade
// lands first, then the answer begins (Caleb's "tree lands first" ruling).
export function useWaveReveal(target: string, active: boolean, holdUntil = 0): WaveReveal {
  const reduced = useMemo(prefersReducedMotion, [])
  const ends = useMemo(() => waveEnds(target, !active), [target, active])
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  const endsRef = useRef(ends)
  endsRef.current = ends
  // The clock starts when there is something to reveal, not at mount: a long
  // pre-first-token wait must not bank budget and flood the opening.
  const t0 = useRef<number | null>(null)
  const lastRelease = useRef(0)

  useEffect(() => {
    if (reduced) return
    let raf = 0
    // `holdUntil` is wall-clock (it comes from the trace's renderer stamps);
    // the frame clock is performance time. Convert once.
    const holdPerf = holdUntil > 0 ? holdUntil - (Date.now() - performance.now()) : 0
    const tick = (now: number): void => {
      const e = endsRef.current
      const n = shownRef.current
      if (t0.current !== null) {
        // Clamp the bank on EVERY tick, idle ones included. The clock may run
        // past what the next wave needs by only the jitter allowance — and
        // while it waits on the model (or on the stream closing) past the
        // last landed wave by the same — so whatever arrives next lands at
        // reading pace no matter how long it took to arrive.
        const need = n < e.length ? e[n] : n > 0 ? e[n - 1] : 0
        const maxT0 = now - ((need + BANK_CHARS) / REVEAL_CPS) * 1000
        if (t0.current < maxT0) t0.current = maxT0
      }
      if (n < e.length) {
        if (t0.current === null) t0.current = Math.max(holdPerf, now)
        const budget = ((now - t0.current) / 1000) * REVEAL_CPS
        if (e[n] <= budget && now - lastRelease.current >= WAVE_MIN_BEAT_MS) {
          shownRef.current = n + 1
          lastRelease.current = now
          setShown(n + 1)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The loop reads the latest waves through a ref; restarting it on every
    // delta would stutter the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, holdUntil])

  if (reduced) {
    return { visible: target, waveStarts: [0], drained: !active }
  }
  const count = Math.min(shown, ends.length)
  const visible = count === 0 ? '' : target.slice(0, ends[count - 1])
  const waveStarts = [0]
  for (let i = 0; i < count - 1; i++) waveStarts.push(ends[i])
  return { visible, waveStarts, drained: !active && count >= ends.length }
}

// ── Marking the waves in the rendered tree ─────────────────────────────────
//
// Every block element rises in (the inbox motion); text is split at wave
// starts and each piece fades in as its own span. Classes are constant for
// the life of the turn and split points only ever append, so a node that has
// already landed keeps its identity across reparses and its animation plays
// exactly once, on mount. Code/pre stay untouched inside — fading fragments
// of a code block read as flicker, not writing.

type HastNode = {
  type: string
  tagName?: string
  value?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
  position?: { start?: { offset?: number }; end?: { offset?: number } }
}

const RISING_BLOCKS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'tr'])
// Inline elements fade in whole; the text inside them is not split again.
const INLINE_FADE = new Set(['strong', 'em', 'del', 'a', 'code', 'span', 'img'])

function addClass(node: HastNode, cls: string): void {
  const props = node.properties ?? (node.properties = {})
  const existing = props.className
  const list = Array.isArray(existing) ? existing.slice() : existing ? [String(existing)] : []
  if (!list.includes(cls)) list.push(cls)
  props.className = list
}

function fadeSpan(value: string): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['fb-wave-in'] },
    children: [{ type: 'text', value }]
  }
}

// Split one text node at the wave starts that fall inside it. Offsets are
// source offsets while `value` is the unescaped text, so a seam can drift by
// an escape or two; it is then nudged to the next whitespace so no word is
// ever split across two fades.
function splitText(node: HastNode, waveStarts: number[]): HastNode[] {
  const value = node.value ?? ''
  const start = node.position?.start?.offset
  if (start === undefined) return [fadeSpan(value)]
  const cuts: number[] = []
  for (const ws of waveStarts) {
    const rel = ws - start
    if (rel <= 0 || rel >= value.length) continue
    let at = rel
    while (at < value.length && !/\s/.test(value[at])) at++
    if (at > 0 && at < value.length && (cuts.length === 0 || at > cuts[cuts.length - 1])) cuts.push(at)
  }
  const out: HastNode[] = []
  let from = 0
  for (const c of cuts) {
    out.push(fadeSpan(value.slice(from, c)))
    from = c
  }
  out.push(fadeSpan(value.slice(from)))
  return out
}

function markWaves(node: HastNode, waveStarts: number[]): void {
  if (!node.children) return
  if (node.tagName === 'code' || node.tagName === 'pre') return
  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.trim()) {
      next.push(...splitText(child, waveStarts))
      continue
    }
    if (child.type === 'element' && child.tagName) {
      if (RISING_BLOCKS.has(child.tagName)) {
        addClass(child, 'fb-wave-rise')
        markWaves(child, waveStarts)
      } else if (INLINE_FADE.has(child.tagName)) {
        addClass(child, 'fb-wave-in')
      } else {
        markWaves(child, waveStarts)
      }
    }
    next.push(child)
  }
  node.children = next
}

// The caret rides IN the hast tree as a sentinel span, appended inside the
// last flowing element so it sits at the end of the last line. When the tree
// ends in a pre/table/list (no sane inline position), it lands after that
// block at the root instead — a dot on its own quiet line beats a dot glued
// under a code block.
const NO_INLINE_CARET = new Set(['pre', 'table', 'ul', 'ol'])

function caretNode(): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['fb-stream-caret'], ariaHidden: 'true' },
    children: []
  }
}

function rehypeWaves(waveStarts: number[], caret: boolean) {
  return (tree: HastNode): void => {
    markWaves(tree, waveStarts)
    if (!caret) return
    const kids = tree.children ?? []
    const last = [...kids].reverse().find((n) => n.type === 'element')
    if (!last) return
    if (NO_INLINE_CARET.has(last.tagName ?? '')) kids.push(caretNode())
    else (last.children ?? (last.children = [])).push(caretNode())
  }
}

interface Props {
  markdown: string
  // The stream is still open. False while the finished turn drains.
  active: boolean
  // Epoch ms before which no wave may land (the source cascade's end).
  holdUntil?: number
  // Fired once every wave of a finished stream is on screen.
  onDrained?: () => void
}

export default function StreamingProse({ markdown, active, holdUntil = 0, onDrained }: Props): React.JSX.Element {
  const { visible, waveStarts, drained } = useWaveReveal(markdown, active, holdUntil)
  const drainedRef = useRef(false)
  useEffect(() => {
    if (drained && !drainedRef.current) {
      drainedRef.current = true
      onDrained?.()
    }
  }, [drained, onDrained])
  // The caret marks the growing edge until the last wave has landed.
  // unified calls each entry as a plugin factory; the factory closes over
  // this render's wave starts and returns the transformer.
  const plugins = useMemo(() => [() => rehypeWaves(waveStarts, !drained)], [waveStarts, drained])
  return (
    <div
      data-testid="streaming-prose"
      data-drained={drained ? 'true' : 'false'}
      className="fb-streaming !text-[15px] !leading-[1.75] text-[var(--ink-90)] md-rendered"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        rehypePlugins={plugins}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
          // Inline [n] markers during the stream: the quiet chip, not yet
          // clickable — sources resolve when the turn completes and the
          // finished renderer takes over.
          span: ({ node, children, ...rest }) => {
            // Same key fix as ChatBlockView (A1): hast keeps 'data-citation'
            // verbatim; the camelized lookup alone never matched.
            const n =
              node?.properties?.dataCitation ?? node?.properties?.['data-citation']
            if (n === undefined || n === null || n === '') return <span {...rest}>{children}</span>
            return (
              <span
                data-testid="chat-citation"
                className="inline-grid place-items-center align-[1.5px] mx-[1px] min-w-[14px] h-[14px] px-[3px] rounded-[4px] bg-accent/15 text-accent text-[9px] font-mono font-semibold"
              >
                {String(n)}
              </span>
            )
          }
        }}
      >
        {visible}
      </ReactMarkdown>
    </div>
  )
}
