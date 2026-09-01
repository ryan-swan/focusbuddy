import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'

// Live document outline. Reads the heading hierarchy straight from the editor
// state and stays in sync as the writer types or moves the cursor, with the
// section the cursor is in highlighted. Clicking a heading jumps the selection
// there. This is the long-document navigation Word buries in a side task pane
// and Google Docs hides behind a menu — here it is one keystroke away and always
// truthful to the current document.

interface OutlineItem {
  level: number
  text: string
  pos: number
}

function readOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        level: (node.attrs.level as number) || 1,
        text: node.textContent.trim() || 'Untitled heading',
        pos
      })
    }
    return true
  })
  return items
}

function activeHeadingPos(editor: Editor): number {
  const head = editor.state.selection.head
  let active = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && pos <= head) active = pos
    return true
  })
  return active
}

export default function DocOutline({
  editor,
  onClose
}: {
  editor: Editor
  onClose: () => void
}): JSX.Element {
  const [items, setItems] = useState<OutlineItem[]>(() => readOutline(editor))
  const [activePos, setActivePos] = useState<number>(() => activeHeadingPos(editor))

  useEffect(() => {
    const update = (): void => {
      setItems(readOutline(editor))
      setActivePos(activeHeadingPos(editor))
    }
    editor.on('update', update)
    editor.on('selectionUpdate', update)
    return () => {
      editor.off('update', update)
      editor.off('selectionUpdate', update)
    }
  }, [editor])

  function jump(pos: number): void {
    // +1 lands inside the heading so the caret sits in its text.
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
  }

  return (
    <aside
      className="flex flex-col fixed top-24 right-6 z-[60] w-60 max-h-[68vh] fb-glass-panel rounded-xl border border-[color:var(--glass-panel-border)] shadow-xl overflow-hidden"
      aria-label="Document outline"
      data-testid="doc-outline"
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--edge-soft)]">
        <Icon name="format_list_bulleted" size={13} className="text-[var(--ink-50)]" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-50)]">
          Outline
        </span>
        <button onClick={onClose} className="ml-auto icon-btn" aria-label="Hide outline" title="Hide outline">
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-[var(--ink-40)] leading-relaxed">
            No headings yet. Add a Heading 1, 2 or 3 and it shows up here for one-click navigation.
          </div>
        ) : (
          items.map((it, i) => (
            <button
              key={`${it.pos}-${i}`}
              onClick={() => jump(it.pos)}
              className={`w-full text-left px-3 py-1 text-[12px] truncate transition-colors fb-spring-soft ${
                it.pos === activePos
                  ? 'text-accent font-medium bg-accent/10'
                  : 'text-[var(--ink-70)] hover:bg-[color-mix(in_oklab,var(--surface-sunken)_70%,transparent)]'
              }`}
              style={{ paddingLeft: `${10 + (it.level - 1) * 12}px` }}
              title={it.text}
            >
              {it.text}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
