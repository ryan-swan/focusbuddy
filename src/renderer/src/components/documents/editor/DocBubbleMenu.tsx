// The selection bubble menu: a compact formatting bar that floats above any
// non-empty text selection, plus a one-tap "AI" entry to rewrite the selection.
// Hidden inside code blocks where inline marks do not apply.

import { useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'
import LinkPopover from './LinkPopover'

interface Props {
  editor: Editor
  onAiRewrite: () => void
}

export default function DocBubbleMenu({ editor, onAiRewrite }: Props): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false)
  const btn = (active: boolean): string =>
    `h-7 w-7 inline-flex items-center justify-center rounded text-[13px] ${
      active ? 'bg-accent/20 text-accent' : 'text-stone-200 hover:bg-white/10'
    }`

  return (
    <BubbleMenu
      editor={editor}
      // Render the menu BELOW the selection so it never collides with the sticky
      // formatting toolbar at the top of the document, and keep it above other
      // chrome with a high z-index. 'bottom' placement plus the elevated z-index
      // together fix the case where a top-of-document selection put the menu's
      // click zone underneath the toolbar.
      className="z-[60]"
      options={{ placement: 'bottom', offset: 8 }}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('codeBlock')}
    >
      <div
        data-testid="doc-bubble-menu"
        // Keep the editor selection alive when a button is pressed. Without this,
        // mousedown moves focus out of the editor and collapses the selection
        // before the command runs, so the format would apply to nothing.
        onMouseDown={(e) => e.preventDefault()}
        className="relative flex items-center gap-0.5 rounded-lg bg-stone-900 dark:bg-stone-800 px-1 py-0.5 shadow-xl border border-black/20"
      >
        <button className={btn(editor.isActive('bold'))} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Icon name="format_bold" size={15} />
        </button>
        <button className={btn(editor.isActive('italic'))} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Icon name="format_italic" size={15} />
        </button>
        <button className={btn(editor.isActive('underline'))} title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Icon name="format_underlined" size={15} />
        </button>
        <button className={btn(editor.isActive('highlight'))} title="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Icon name="format_ink_highlighter" size={15} />
        </button>
        <button className={btn(editor.isActive('link'))} title="Link" onClick={() => setLinkOpen((v) => !v)}>
          <Icon name="link" size={15} />
        </button>
        <div className="w-px h-5 bg-white/20 mx-0.5" />
        <button
          className="h-7 inline-flex items-center gap-1 px-2 rounded text-[12px] text-accent hover:bg-white/10"
          title="Rewrite with AI"
          onClick={onAiRewrite}
        >
          <Icon name="auto_awesome" size={13} /> AI
        </button>
        {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>
    </BubbleMenu>
  )
}
