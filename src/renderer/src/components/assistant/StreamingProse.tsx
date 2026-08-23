import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCitations from '../../lib/remarkCitations'
import { safeCut, REVEAL_CPS, COMMIT_MS } from '../../lib/streamReveal'

// The living text (Plexii UI/UX P3, settled in A1 round 4c). Network chunks
// arrive in bursts, but the DISPLAY reveals at one constant readable pace,
// word by word, each new word fading in — a continuous flow, never paint
// and never blocks. Block elements (a paragraph, a list row, a heading)
// rise into place the way an Office inbox row does, so structure arrives
// with the app's motion while the words inside it keep flowing. Server
// speed and display speed are decoupled, and the clock keeps its pace to
// the very last word, including after the stream has ended: an answer that
// arrived in one burst still reads out at reading pace, never all at once.
//
// Why words and not sentences: round 4 tried sentence waves (a couple of
// sentences landing as one unit). At the model's real cadence that meant a
// block, then a second of nothing, then a block — Caleb: "rigid and
// glitchy… it NEEDs to be smooth like butter". Flow is butter; waves are
// not.
//
// Used for the actively-streaming turn AND for the same turn while it
// drains after completion (the caller keeps this mounted until `onDrained`).
// Completed turns render through ChatBlockView, which is also what
// guarantees the no-replay rule: scroll-back never re-animates.

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface SmoothedStream {
  visible: string
  // Every character of a finished stream is on screen.
  drained: boolean
}

// Reveal `target` (a cumulative, append-only string) at constant pace.
// `active` is true while the stream is open; once it closes the clock runs
// on until the tail has landed. `holdUntil` (epoch ms) delays the first
// commit — the trace's source cascade lands first, then the answer begins.
//
// There is deliberately no catch-up mode: a burst upstream, or a stream that
// closes early, is never repaid as a flood. The backlog simply reads out at
// pace (Caleb's ruling: same pace to the end).
export function useSmoothedStream(target: string, active: boolean, holdUntil = 0): SmoothedStream {
  const reduced = useMemo(prefersReducedMotion, [])
  const [visible, setVisible] = useState('')
  const revealLen = useRef(0)
  const lastTick = useRef<number | null>(null)
  const lastCommit = useRef(0)
  const targetRef = useRef(target)
  targetRef.current = target
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (reduced) return
    let raf = 0
    // `holdUntil` is wall-clock (it comes from the trace's renderer stamps);
    // the frame clock is performance time. Convert once.
    const holdPerf = holdUntil > 0 ? holdUntil - (Date.now() - performance.now()) : 0
    const tick = (now: number): void => {
      const t = targetRef.current
      if (now >= holdPerf && t.length > 0) {
        // The clock starts at the first frame with text to show, not at
        // mount: a long pre-first-token wait banks nothing.
        if (lastTick.current === null) lastTick.current = now
        const backlog = t.length - revealLen.current
        if (backlog > 0) {
          revealLen.current = Math.min(t.length, revealLen.current + ((now - lastTick.current) / 1000) * REVEAL_CPS)
          if (now - lastCommit.current >= COMMIT_MS) {
            lastCommit.current = now
            setVisible(safeCut(t, Math.floor(revealLen.current)))
          }
        } else if (!activeRef.current) {
          // Stream closed and every character is out: the last commit shows
          // the whole text (safeCut may have held a tail until now).
          setVisible(t)
        }
        lastTick.current = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The loop reads the latest target through a ref; restarting it on every
    // delta would stutter the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, holdUntil])

  if (reduced) return { visible: target, drained: !active }
  return { visible, drained: !active && visible === target }
}

// ── Marking the words and blocks in the rendered tree ──────────────────────
//
// Every word of every text node becomes a fading span; positional keys mean
// the already-revealed prefix keeps its DOM nodes across reparses, so only
// the newly arrived words mount, and only mounting nodes animate. Block
// elements rise on mount (the inbox motion); inline elements that mount
// whole (a citation chip, a link) fade as a unit. Classes are constant for
// the life of the turn, so nothing ever re-animates. Code/pre stay untouched
// inside — fading fragments of a code block read as flicker, not writing.

type HastNode = {
  type: string
  tagName?: string
  value?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
}

const RISING_BLOCKS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'tr', 'blockquote'])

function addClass(node: HastNode, cls: string): void {
  const props = node.properties ?? (node.properties = {})
  const existing = props.className
  const list = Array.isArray(existing) ? existing.slice() : existing ? [String(existing)] : []
  if (!list.includes(cls)) list.push(cls)
  props.className = list
}

function wordSpan(value: string): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['fb-wave-in'] },
    children: [{ type: 'text', value }]
  }
}

function markTree(node: HastNode): void {
  if (!node.children) return
  if (node.tagName === 'code' || node.tagName === 'pre') return
  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.trim()) {
      for (const part of child.value.split(/(\s+)/)) {
        if (!part) continue
        if (/^\s+$/.test(part)) next.push({ type: 'text', value: part })
        else next.push(wordSpan(part))
      }
      continue
    }
    if (child.type === 'element' && child.tagName) {
      if (RISING_BLOCKS.has(child.tagName)) addClass(child, 'fb-wave-rise')
      else if (child.tagName === 'span' || child.tagName === 'img') addClass(child, 'fb-wave-in')
      markTree(child)
    }
    next.push(child)
  }
  node.children = next
}

// The caret rides IN the hast tree as a sentinel span, appended inside the
// last flowing element so it sits at the end of the last line. When the tree
// ends in a pre/table/list (no sane inline position) — or in a VOID element,
// which React forbids children in — it lands after that block at the root
// instead. The void set is load-bearing: an answer containing a `---`
// divider put an <hr> at the streaming edge and the caret injected into it
// crashed the whole renderer, every time, since P3 (Caleb: "crashing every
// time it types"; crash_events: "hr is a void element tag…").
const NO_INLINE_CARET = new Set([
  'pre',
  'table',
  'ul',
  'ol',
  'hr',
  'br',
  'img',
  'input',
  'area',
  'base',
  'col',
  'embed',
  'source',
  'track',
  'wbr'
])

function caretNode(): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['fb-stream-caret'], ariaHidden: 'true' },
    children: []
  }
}

function rehypeFlow(caret: boolean) {
  return (tree: HastNode): void => {
    markTree(tree)
    if (!caret) return
    const kids = tree.children ?? []
    const last = [...kids].reverse().find((n) => n.type === 'element')
    if (!last) return
    if (NO_INLINE_CARET.has(last.tagName ?? '')) kids.push(caretNode())
    else (last.children ?? (last.children = [])).push(caretNode())
  }
}

// The element overrides MUST be stable identities. Defined inline in the
// `components` prop they were new function types on every commit, so React
// unmounted and remounted EVERY span and link ~22 times a second — each
// remount restarting its fade. That was the "flash" under every reveal
// design since P3 (measured: 78,906 characters torn down during one
// 5-second answer). Module-level components reconcile in place.
const StreamLink: Components['a'] = ({ href, children, node: _node, ...rest }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
    {children}
  </a>
)

// Inline [n] markers during the stream: the quiet chip, not yet clickable —
// sources resolve when the turn completes and the finished renderer takes
// over. Same key fix as ChatBlockView (A1): hast keeps 'data-citation'
// verbatim; the camelized lookup alone never matched.
const StreamSpan: Components['span'] = ({ node, children, ...rest }) => {
  const n = node?.properties?.dataCitation ?? node?.properties?.['data-citation']
  if (n === undefined || n === null || n === '') return <span {...rest}>{children}</span>
  return (
    <span
      data-testid="chat-citation"
      className="fb-wave-in inline-grid place-items-center align-[1.5px] mx-[1px] min-w-[14px] h-[14px] px-[3px] rounded-[4px] bg-accent/15 text-accent text-[9px] font-mono font-semibold"
    >
      {String(n)}
    </span>
  )
}

const COMPONENTS: Components = { a: StreamLink, span: StreamSpan }
const REMARK_PLUGINS = [remarkGfm, remarkCitations]

interface Props {
  markdown: string
  // The stream is still open. False while the finished turn drains.
  active: boolean
  // Epoch ms before which nothing may show (the source cascade's end).
  holdUntil?: number
  // Fired once every character of a finished stream is on screen.
  onDrained?: () => void
}

export default function StreamingProse({ markdown, active, holdUntil = 0, onDrained }: Props): React.JSX.Element {
  const { visible, drained } = useSmoothedStream(markdown, active, holdUntil)
  const drainedRef = useRef(false)
  useEffect(() => {
    if (drained && !drainedRef.current) {
      drainedRef.current = true
      onDrained?.()
    }
  }, [drained, onDrained])
  // unified calls each entry as a plugin factory. The caret marks the
  // growing edge until the last word has landed.
  const plugins = useMemo(() => [() => rehypeFlow(!drained)], [drained])
  return (
    <div
      data-testid="streaming-prose"
      data-drained={drained ? 'true' : 'false'}
      className="fb-streaming !text-[15px] !leading-[1.75] text-[var(--ink-90)] md-rendered"
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={plugins} components={COMPONENTS}>
        {visible}
      </ReactMarkdown>
    </div>
  )
}
