// An auto-buildable Table of Contents, modelled on Word's: it holds a snapshot of
// the document's headings (so it serialises into .docx / HTML exports as real
// content), renders that list with a live NodeView (indented by level, each item
// clickable to jump to its heading), and offers an Update button that rebuilds
// the snapshot from the current headings — exactly the "insert once, update on
// demand" contract users expect, and honest by construction (it only ever lists
// headings that actually exist).

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { Editor } from '@tiptap/react'

export interface TocItem {
  level: number
  text: string
}

// Read the current heading hierarchy from the editor, in document order.
export function collectTocItems(editor: Editor): TocItem[] {
  const items: TocItem[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      items.push({ level: (node.attrs.level as number) || 1, text: node.textContent.trim() || 'Untitled heading' })
    }
    return true
  })
  return items
}

// The position of the i-th heading right now, so a click jumps to the live target
// even after edits shifted everything.
function nthHeadingPos(editor: Editor, index: number): number | null {
  let seen = -1
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      seen++
      if (seen === index) {
        found = pos
        return false
      }
    }
    return true
  })
  return found
}

function TocView({ node, updateAttributes, editor }: NodeViewProps): JSX.Element {
  const items = (node.attrs.items as TocItem[]) ?? []
  return (
    <NodeViewWrapper
      className="my-3 rounded-md bg-[var(--surface-sunken)]/40 px-4 py-3"
      data-testid="doc-toc"
      contentEditable={false}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-50)]">Contents</span>
        <button
          type="button"
          onClick={() => updateAttributes({ items: collectTocItems(editor) })}
          data-testid="doc-toc-update"
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded text-[var(--ink-50)] hover:bg-[var(--surface-sunken)] hover:text-accent"
          title="Rebuild from the current headings"
        >
          Update
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-[var(--ink-40)]">No headings yet — add a heading, then Update.</div>
      ) : (
        <div>
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const pos = nthHeadingPos(editor, i)
                if (pos != null) editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
              }}
              data-testid="doc-toc-item"
              className="block w-full text-left text-[13px] text-[var(--ink-70)] hover:text-accent py-0.5 truncate"
              style={{ paddingLeft: `${(it.level - 1) * 16}px` }}
            >
              {it.text}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType
    }
  }
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      items: {
        default: [] as TocItem[],
        // Serialise the snapshot on the element so it survives save/load.
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-items') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attrs) => ({ 'data-items': JSON.stringify(attrs.items ?? []) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },

  // Export as a real "Contents" heading + list so .docx / HTML carry the ToC.
  renderHTML({ HTMLAttributes, node }) {
    const items = (node.attrs.items as TocItem[]) ?? []
    const lis = items.map((it) => [
      'p',
      { style: `margin:2px 0 2px ${(it.level - 1) * 24}px` },
      it.text
    ])
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toc': '' }),
      ['p', { style: 'font-weight:700;margin:0 0 4px' }, 'Contents'],
      ...lis
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView)
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ chain, editor }) =>
          chain()
            .insertContent({ type: this.name, attrs: { items: collectTocItems(editor) } })
            .run()
    }
  }
})
