// Footnotes. An inline, auto-numbered reference the writer drops into the text;
// its number is its position among all footnotes (so inserting one in the middle
// renumbers the rest for free), and clicking it opens a small popover to edit the
// note text. The text is stored on the node, so it survives save/load and is
// carried into exports (renderHTML emits the note as a superscript bracket — no
// data loss even though .docx's native footnote part isn't produced). Honest by
// construction: an empty footnote shows a placeholder, never invented text.

import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

// The 1-based number of the footnote at document position `self`, by counting the
// footnotes that come before it.
function footnoteNumber(editor: NodeViewProps['editor'], self: number): number {
  let n = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') {
      if (pos < self) n++
      else if (pos === self) {
        n++
        return false
      }
    }
    return true
  })
  return Math.max(1, n)
}

function FootnoteView({ node, updateAttributes, editor, getPos }: NodeViewProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const pos = (typeof getPos === 'function' ? getPos() : -1) ?? -1
  const num = pos >= 0 ? footnoteNumber(editor, pos) : 1
  const text = (node.attrs.text as string) ?? ''
  return (
    <NodeViewWrapper as="span" className="relative inline" data-testid="doc-footnote">
      <sup
        className="text-accent cursor-pointer font-medium px-0.5"
        onClick={() => setOpen((v) => !v)}
        data-testid="doc-footnote-ref"
        title={text || 'Empty footnote — click to edit'}
      >
        [{num}]
      </sup>
      {open && (
        <span
          className="absolute left-0 top-5 z-50 w-64 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl p-2 block"
          contentEditable={false}
          data-testid="doc-footnote-popover"
        >
          <span className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] block mb-1">Footnote {num}</span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => updateAttributes({ text: e.target.value })}
            placeholder="Footnote text"
            data-testid="doc-footnote-input"
            className="w-full h-16 text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded p-1.5 focus:outline-none focus:border-accent resize-none"
          />
          <span className="flex justify-end mt-1">
            <button type="button" className="text-[11px] px-2 py-0.5 rounded text-accent hover:bg-accent/10" onClick={() => setOpen(false)}>
              Done
            </button>
          </span>
        </span>
      )}
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: () => ReturnType
    }
  }
}

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-text') || '',
        renderHTML: (attrs) => ({ 'data-text': (attrs.text as string) || '' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const text = (node.attrs.text as string) || ''
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-footnote': '' }), text ? `[${text}]` : '*']
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView)
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: { text: '' } }).run()
    }
  }
})
