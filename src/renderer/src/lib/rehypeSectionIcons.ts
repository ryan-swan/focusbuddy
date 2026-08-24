// Section icons at the TREE level (A5.5, AI-41 fix — Caleb's glitch report).
//
// The first cut swapped heading emojis in ReactMarkdown component overrides,
// which see plain string children. During STREAMING the reveal pipeline
// (rehypeFlow) has already wrapped every word in fade spans by then, so the
// override never fired mid-stream: the raw emoji streamed in, vanished at
// settle, and the icon appeared — the three-state flip Caleb saw.
//
// This plugin does the swap in the hast tree itself, BEFORE rehypeFlow wraps
// words (plugin order in StreamingProse) and identically in the settled
// renderer — so the emoji is replaced the moment its cluster completes and a
// raw emoji never paints. A lone trailing high surrogate (an emoji split
// across stream ticks) is held back for the tick it needs to complete rather
// than painting as tofu.

import { splitLeadingEmoji } from './emojiIcon'

interface HastText {
  type: 'text'
  value: string
}
interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] }

const SECTION_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'li'])

function iconNode(icon: string): HastElement {
  return {
    type: 'element',
    tagName: 'span',
    properties: {
      // material-symbols-outlined supplies the font; fb-md-icon carries the
      // sizing/tint/variation (globals.css, this lane's block).
      className: ['material-symbols-outlined', 'fb-md-icon'],
      ariaHidden: 'true'
    },
    children: [{ type: 'text', value: icon }]
  }
}

// Exported for unit tests: transform ONE element in place.
export function applySectionIcon(el: HastElement): void {
  if (!SECTION_TAGS.has(el.tagName)) return
  const first = el.children[0]
  if (!first || first.type !== 'text') return
  const text = (first as HastText).value
  // An emoji split across stream ticks arrives as a lone high surrogate at
  // the text edge: hold it back this tick instead of painting tofu.
  const loneSurrogate = /^[\uD800-\uDBFF]$/.test(text)
  if (loneSurrogate) {
    ;(first as HastText).value = ''
    return
  }
  const { matched, icon, rest } = splitLeadingEmoji(text)
  if (!matched) return
  ;(first as HastText).value = rest
  if (icon) el.children.unshift(iconNode(icon))
}

function walk(node: HastNode): void {
  if (node.type === 'element') applySectionIcon(node as HastElement)
  const kids = (node as HastElement).children
  if (Array.isArray(kids)) for (const k of kids) walk(k)
}

// The rehype plugin. Mutates in place, unified-style.
export default function rehypeSectionIcons() {
  return (tree: HastNode): void => {
    walk(tree)
  }
}
