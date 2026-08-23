// The selection bubble menu: a compact formatting bar that floats above any
// non-empty text selection, plus a one-tap "AI" entry to rewrite the selection
// and an "apply this style across the whole document" action (with a confirm
// that names exactly what will propagate). Hidden inside code blocks where
// inline marks do not apply.

import { useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'
import LinkPopover from './LinkPopover'
import { familyLabel } from '../../../lib/googleFonts'

interface Props {
  editor: Editor
  onAiRewrite: () => void
}

interface SelectionStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color?: string
  highlight?: string
  fontFamily?: string
  fontSize?: string
}

// Read the character formatting active at the current selection.
function readSelectionStyle(editor: Editor): SelectionStyle {
  const ts = editor.getAttributes('textStyle')
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    color: ts.color as string | undefined,
    highlight: editor.getAttributes('highlight').color as string | undefined,
    fontFamily: ts.fontFamily as string | undefined,
    fontSize: ts.fontSize as string | undefined
  }
}

// Human-readable list of what "apply across document" would set.
function describe(s: SelectionStyle): string[] {
  const items: string[] = []
  if (s.bold) items.push('Bold')
  if (s.italic) items.push('Italic')
  if (s.underline) items.push('Underline')
  if (s.strike) items.push('Strikethrough')
  if (s.color) items.push(`Text colour ${s.color}`)
  if (s.highlight) items.push(`Highlight ${s.highlight}`)
  if (s.fontFamily) items.push(`Font ${familyLabel(s.fontFamily)}`)
  if (s.fontSize) items.push(`Size ${s.fontSize.replace('px', '')}`)
  return items
}

export default function DocBubbleMenu({ editor, onAiRewrite }: Props): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ style: SelectionStyle; range: { from: number; to: number } } | null>(null)

  const btn = (active: boolean): string =>
    `h-7 w-7 inline-flex items-center justify-center rounded text-[13px] ${
      active ? 'bg-accent/20 text-accent' : 'text-stone-200 hover:bg-white/10'
    }`

  function openConfirm(): void {
    const { from, to } = editor.state.selection
    setConfirm({ style: readSelectionStyle(editor), range: { from, to } })
  }

  // Apply the captured selection style to every character in the document, then
  // restore the original selection so the user keeps their place.
  function applyAcross(): void {
    if (!confirm) return
    const s = confirm.style
    let chain = editor.chain().focus().selectAll()
    if (s.bold) chain = chain.setBold()
    if (s.italic) chain = chain.setItalic()
    if (s.underline) chain = chain.setUnderline()
    if (s.strike) chain = chain.setStrike()
    if (s.color) chain = chain.setColor(s.color)
    if (s.highlight) chain = chain.setHighlight({ color: s.highlight })
    if (s.fontFamily) chain = chain.setFontFamily(s.fontFamily)
    if (s.fontSize) chain = chain.setFontSize(s.fontSize)
    chain.setTextSelection(confirm.range).run()
    setConfirm(null)
  }

  return (
    <>
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
        {/* Forced-dark bubble chrome over the always-light page paper; its edge is relative to the paper. */}
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
            className={btn(false)}
            title="Apply this style across the whole document"
            data-testid="doc-bubble-apply-across"
            onClick={openConfirm}
          >
            <Icon name="format_paint" size={15} />
          </button>
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

      {confirm && (
        <ApplyAcrossConfirm items={describe(confirm.style)} onApply={applyAcross} onClose={() => setConfirm(null)} />
      )}
    </>
  )
}

function ApplyAcrossConfirm({
  items,
  onApply,
  onClose
}: {
  items: string[]
  onApply: () => void
  onClose: () => void
}): JSX.Element {
  const nothing = items.length === 0
  return (
    <div className="fb-scrim fixed inset-0 z-[200] flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="doc-apply-across-confirm"
        className="fb-card w-[420px] max-w-[92vw] p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Icon name="format_paint" size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-[var(--ink-90)]">Apply this style across the document</span>
        </div>
        {nothing ? (
          <p className="text-[13px] text-[var(--ink-50)]">
            This selection has no character formatting to apply. Style some text first, keep it selected, then try again.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-[var(--ink-70)]">
              Every piece of text in the document will be set to match the selected text. This affects the whole document and can be undone with Cmd or Ctrl Z.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it) => (
                <span key={it} className="text-[11px] rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-70)]">
                  {it}
                </span>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="fb-btn-surface text-[12px] px-3 py-1.5 text-[var(--ink-70)]">
            Cancel
          </button>
          {!nothing && (
            <button onClick={onApply} className="btn-primary text-[12px] px-3 py-1.5" data-testid="doc-apply-across-confirm-btn">
              Apply to whole document
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
