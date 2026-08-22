import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCitations from '../../lib/remarkCitations'
import { safeCut, REVEAL_CPS, CATCHUP_AT, CATCHUP_FACTOR, COMMIT_MS } from '../../lib/streamReveal'

// The living text (Plexii UI/UX P3). The premium-chat convention, and the
// pattern Anthropic itself ships: network chunks arrive in bursts, but the
// DISPLAY reveals at a constant readable pace, each new word fading in, so the
// answer reads as writing rather than as paint. Server speed and display speed
// are deliberately decoupled — the reveal loop drains a buffer via
// requestAnimationFrame and never shows a torn code fence.
//
// Used ONLY for the actively-streaming turn. Completed turns render through
// ChatBlockView as before, which is also what guarantees the no-replay rule:
// scroll-back never re-animates, because history never passes through here.

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Reveal `target` (a cumulative, append-only string) at constant pace.
export function useSmoothedStream(target: string, active: boolean): string {
  const [visible, setVisible] = useState('')
  const revealLen = useRef(0)
  const lastTick = useRef(0)
  const lastCommit = useRef(0)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      revealLen.current = target.length
      setVisible(target)
      return
    }
    let raf = 0
    lastTick.current = performance.now()
    const tick = (now: number): void => {
      const t = targetRef.current
      const backlog = t.length - revealLen.current
      if (backlog > 0) {
        const rate = backlog > CATCHUP_AT ? REVEAL_CPS * CATCHUP_FACTOR : REVEAL_CPS
        revealLen.current = Math.min(t.length, revealLen.current + ((now - lastTick.current) / 1000) * rate)
        if (now - lastCommit.current >= COMMIT_MS) {
          lastCommit.current = now
          setVisible(safeCut(t, Math.floor(revealLen.current)))
        }
      }
      lastTick.current = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Restarting the loop on every delta would stutter the clock; the loop
    // reads the latest target through a ref instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Stream over: snap to the full text immediately (the caller will swap to the
  // completed-turn renderer, but never leave words held back meanwhile).
  useEffect(() => {
    if (!active) {
      revealLen.current = target.length
      setVisible(target)
    }
  }, [active, target])

  return active ? visible : target
}

// Wrap every word of every text node in a fading span. Positional keys mean the
// already-revealed prefix keeps its DOM nodes across reparses — only the newly
// arrived words mount, and only mounting nodes animate. Code/pre stay untouched
// (fading fragments of a code block reads as flicker, not writing).
type HastNode = {
  type: string
  tagName?: string
  value?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
}

function splitTextNodes(node: HastNode): void {
  if (!node.children) return
  if (node.tagName === 'code' || node.tagName === 'pre') return
  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.trim()) {
      for (const part of child.value.split(/(\s+)/)) {
        if (!part) continue
        if (/^\s+$/.test(part)) next.push({ type: 'text', value: part })
        else
          next.push({
            type: 'element',
            tagName: 'span',
            properties: { className: ['fb-word-in'] },
            children: [{ type: 'text', value: part }]
          })
      }
    } else {
      splitTextNodes(child)
      next.push(child)
    }
  }
  node.children = next
}

// The caret rides IN the hast tree as a sentinel span, appended inside the
// last flowing element so it sits at the end of the last line. When the tree
// ends in a pre/table/list (no sane inline position), it lands after that
// block at the root instead — a dot on its own quiet line beats a dot glued
// under a code block. (Shape suggested by the design-system session's review.)
const NO_INLINE_CARET = new Set(['pre', 'table', 'ul', 'ol'])

function caretNode(): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['fb-stream-caret'], ariaHidden: 'true' },
    children: []
  }
}

function rehypeWordFade() {
  return (tree: HastNode): void => {
    splitTextNodes(tree)
    const kids = tree.children ?? []
    const last = [...kids].reverse().find((n) => n.type === 'element')
    if (!last) return
    if (NO_INLINE_CARET.has(last.tagName ?? '')) kids.push(caretNode())
    else (last.children ?? (last.children = [])).push(caretNode())
  }
}

export default function StreamingProse({ markdown, active }: { markdown: string; active: boolean }): React.JSX.Element {
  const visible = useSmoothedStream(markdown, active)
  const plugins = useMemo(() => [rehypeWordFade], [])
  return (
    <div
      data-testid="streaming-prose"
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
            const n = node?.properties?.dataCitation
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
