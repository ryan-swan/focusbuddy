// The document formatting toolbar. Grouped like Word: history, block type, font,
// inline marks, colour, paragraph alignment/spacing, lists, insert, and tools.
// It re-renders on every editor transaction so active states stay accurate, and
// delegates the heavier flows (link, image, find, AI, Office files) to callbacks
// owned by DocEditor.

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'
import LinkPopover from './LinkPopover'
import type { HeadingStyle, HeadingStyles } from './headingStyles'

interface Props {
  editor: Editor
  headingStyles: HeadingStyles
  onSetHeadingStyle: (level: number, patch: Partial<HeadingStyle>) => void
  onAskAi: () => void
  onToggleFind: () => void
  onInsertImage: () => void
  onImportDocx: () => void
  onExportDocx: () => void
  onExportPdf: () => void
}

const FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: 'Default', value: '' },
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"JetBrains Mono", ui-monospace, monospace' }
]
const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '30', '36']
const LINE_HEIGHTS = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' }
]

export default function Toolbar({
  editor,
  headingStyles,
  onSetHeadingStyle,
  onAskAi,
  onToggleFind,
  onInsertImage,
  onImportDocx,
  onExportDocx,
  onExportPdf
}: Props): JSX.Element {
  const [headingStyleOpen, setHeadingStyleOpen] = useState(false)
  // Force a re-render on every transaction so isActive() reflects the cursor.
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = (): void => setTick((t) => t + 1)
    editor.on('transaction', bump)
    return () => {
      editor.off('transaction', bump)
    }
  }, [editor])

  const [linkOpen, setLinkOpen] = useState(false)
  const [officeOpen, setOfficeOpen] = useState(false)
  const officeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!officeRef.current?.contains(e.target as Node)) setOfficeOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const btn = (active: boolean): string =>
    `h-7 min-w-7 px-1 inline-flex items-center justify-center rounded text-[13px] ${
      active
        ? 'bg-accent/15 text-accent'
        : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
    }`
  const Divider = (): JSX.Element => <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-0.5" />

  // Which heading level (if any) the cursor is in, for the heading-style control.
  const currentHeadingLevel =
    [1, 2, 3, 4, 5, 6].find((lvl) => editor.isActive('heading', { level: lvl })) ?? null

  // Current block type for the select.
  const blockValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('heading', { level: 4 })
          ? 'h4'
          : editor.isActive('codeBlock')
            ? 'code'
            : editor.isActive('blockquote')
              ? 'quote'
              : 'p'

  function setBlock(v: string): void {
    const c = editor.chain().focus()
    if (v === 'p') c.setParagraph().run()
    else if (v === 'code') c.toggleCodeBlock().run()
    else if (v === 'quote') c.toggleBlockquote().run()
    else c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
  }

  const wordCount = editor.storage.characterCount?.words?.() ?? 0

  const sel = 'h-7 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-[11px] px-1 text-stone-600 dark:text-stone-300 focus:outline-none'

  return (
    <div
      data-testid="doc-toolbar"
      className="sticky top-0 z-20 -mx-2 px-2 py-1.5 mb-4 flex items-center gap-0.5 flex-wrap bg-paper/95 backdrop-blur border-b border-stone-200/70 dark:border-stone-800/70"
    >
      <button className={btn(false)} title="Undo" onClick={() => editor.chain().focus().undo().run()}>
        <Icon name="undo" size={15} />
      </button>
      <button className={btn(false)} title="Redo" onClick={() => editor.chain().focus().redo().run()}>
        <Icon name="redo" size={15} />
      </button>
      <Divider />

      <select className={sel} value={blockValue} onChange={(e) => setBlock(e.target.value)} title="Block type">
        <option value="p">Text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="quote">Quote</option>
        <option value="code">Code</option>
      </select>

      {/* Styles panel: one clear place to apply a heading level and to define
          what each level looks like. Editing a level updates every heading of
          that level at once. */}
      <div className="relative">
        <button
          className={btn(headingStyleOpen)}
          title="Paragraph styles — apply and customise heading levels"
          data-testid="doc-styles-btn"
          onClick={() => setHeadingStyleOpen((v) => !v)}
        >
          <Icon name="format_size" size={15} />
          <span className="ml-1 text-[12px]">Styles</span>
        </button>
        {headingStyleOpen && (
          <StylesPanel
            currentHeadingLevel={currentHeadingLevel}
            headingStyles={headingStyles}
            onApplyLevel={(lvl) => {
              if (lvl === 0) editor.chain().focus().setParagraph().run()
              else editor.chain().focus().setHeading({ level: lvl as 1 | 2 | 3 | 4 | 5 | 6 }).run()
            }}
            onSet={onSetHeadingStyle}
            onClose={() => setHeadingStyleOpen(false)}
          />
        )}
      </div>

      <select
        className={`${sel} w-16`}
        title="Font"
        value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v) editor.chain().focus().setFontFamily(v).run()
          else editor.chain().focus().unsetFontFamily().run()
        }}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className={`${sel} w-12`}
        title="Font size"
        value={((editor.getAttributes('textStyle').fontSize as string) ?? '').replace('px', '')}
        onChange={(e) => {
          const v = e.target.value
          if (v) editor.chain().focus().setFontSize(`${v}px`).run()
          else editor.chain().focus().unsetFontSize().run()
        }}
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Divider />

      <button className={btn(editor.isActive('bold'))} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
        <Icon name="format_bold" size={15} />
      </button>
      <button className={btn(editor.isActive('italic'))} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Icon name="format_italic" size={15} />
      </button>
      <button className={btn(editor.isActive('underline'))} title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Icon name="format_underlined" size={15} />
      </button>
      <button className={btn(editor.isActive('strike'))} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Icon name="strikethrough_s" size={15} />
      </button>
      <button className={btn(editor.isActive('code'))} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
        <Icon name="code" size={15} />
      </button>
      <button className={btn(editor.isActive('subscript'))} title="Subscript" onClick={() => editor.chain().focus().toggleSubscript().run()}>
        <Icon name="subscript" size={15} />
      </button>
      <button className={btn(editor.isActive('superscript'))} title="Superscript" onClick={() => editor.chain().focus().toggleSuperscript().run()}>
        <Icon name="superscript" size={15} />
      </button>
      <Divider />

      <label className={btn(false) + ' relative cursor-pointer'} title="Text color">
        <Icon name="format_color_text" size={15} />
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <label className={btn(false) + ' relative cursor-pointer'} title="Highlight">
        <Icon name="format_ink_highlighter" size={15} />
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
        />
      </label>
      <Divider />

      <button className={btn(editor.isActive({ textAlign: 'left' }))} title="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <Icon name="format_align_left" size={15} />
      </button>
      <button className={btn(editor.isActive({ textAlign: 'center' }))} title="Align center" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <Icon name="format_align_center" size={15} />
      </button>
      <button className={btn(editor.isActive({ textAlign: 'right' }))} title="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <Icon name="format_align_right" size={15} />
      </button>
      <button className={btn(editor.isActive({ textAlign: 'justify' }))} title="Justify" onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <Icon name="format_align_justify" size={15} />
      </button>
      <select
        className={`${sel} w-16`}
        title="Line spacing"
        value={(editor.getAttributes('paragraph').lineHeight as string) ?? ''}
        onChange={(e) => editor.chain().focus().setLineHeight(e.target.value).run()}
      >
        <option value="">Spacing</option>
        {LINE_HEIGHTS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <Divider />

      <button className={btn(editor.isActive('bulletList'))} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <Icon name="format_list_bulleted" size={15} />
      </button>
      <button className={btn(editor.isActive('orderedList'))} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <Icon name="format_list_numbered" size={15} />
      </button>
      <button className={btn(editor.isActive('taskList'))} title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <Icon name="checklist" size={15} />
      </button>
      <Divider />

      <div className="relative inline-flex">
        <button className={btn(editor.isActive('link'))} title="Link" onClick={() => setLinkOpen((v) => !v)}>
          <Icon name="link" size={15} />
        </button>
        {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>
      <button className={btn(false)} title="Insert image" onClick={onInsertImage}>
        <Icon name="image" size={15} />
      </button>
      <button
        className={btn(false)}
        title="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Icon name="grid_on" size={15} />
      </button>
      <button className={btn(false)} title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Icon name="horizontal_rule" size={15} />
      </button>
      <button
        className={btn(false)}
        title="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Icon name="format_clear" size={15} />
      </button>
      <button className={btn(false)} title="Find & replace" onClick={onToggleFind}>
        <Icon name="search" size={15} />
      </button>

      {/* Table operations appear only when the cursor is inside a table. */}
      {editor.isActive('table') && (
        <>
          <Divider />
          <button className={btn(false)} title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Icon name="add_row_below" size={15} />
          </button>
          <button className={btn(false)} title="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Icon name="add_column_right" size={15} />
          </button>
          <button className={btn(false)} title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
            <Icon name="delete" size={15} />
          </button>
          <button className={btn(false)} title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Icon name="grid_off" size={15} />
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[11px] text-stone-400 tabular-nums">{wordCount} words</span>
        <div ref={officeRef} className="relative">
          <button className={btn(officeOpen)} title="Open or export Office files" onClick={() => setOfficeOpen((v) => !v)}>
            <Icon name="folder_open" size={15} />
          </button>
          {officeOpen && (
            <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-[12px]">
              <button onClick={() => { setOfficeOpen(false); onImportDocx() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                <Icon name="upload_file" size={14} className="text-stone-400" /> Import Word (.docx)
              </button>
              <button onClick={() => { setOfficeOpen(false); onExportDocx() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                <Icon name="description" size={14} className="text-stone-400" /> Export Word (.docx)
              </button>
              <button onClick={() => { setOfficeOpen(false); onExportPdf() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                <Icon name="picture_as_pdf" size={14} className="text-stone-400" /> Export PDF
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onAskAi}
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
        >
          <Icon name="auto_awesome" size={13} /> Ask AI
        </button>
      </div>
    </div>
  )
}

// Popover to edit one heading level's named style (size, colour, bold). Changes
// The Styles panel: apply a paragraph style (Normal / Heading 1-3) and define
// what each heading level looks like. Editing a level's size / colour / bold /
// italic updates every heading of that level at once (via DocEditor's injected
// CSS), the Word "named styles" behaviour.
function StylesPanel({
  currentHeadingLevel,
  headingStyles,
  onApplyLevel,
  onSet,
  onClose
}: {
  currentHeadingLevel: number | null
  headingStyles: HeadingStyles
  onApplyLevel: (level: number) => void
  onSet: (level: number, patch: Partial<HeadingStyle>) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const tiny =
    'h-6 w-6 inline-flex items-center justify-center rounded text-[12px]'
  const numCls =
    'w-12 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1 py-0.5 text-[11px] focus:outline-none'

  function row(level: number, label: string, previewSize: number): JSX.Element {
    const s: HeadingStyle = headingStyles[level] ?? {}
    const active = currentHeadingLevel === level
    return (
      <div
        key={level}
        className={`flex items-center gap-1 px-2 py-1.5 rounded ${active ? 'bg-accent/10' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
        data-testid={`doc-style-row-${level}`}
      >
        <button
          onClick={() => onApplyLevel(level)}
          className="flex-1 text-left truncate"
          title={`Apply ${label}`}
          style={{
            fontSize: Math.min(previewSize, 20),
            fontWeight: s.bold ? 700 : 600,
            fontStyle: s.italic ? 'italic' : undefined,
            color: s.color
          }}
        >
          {label}
        </button>
        <button
          className={`${tiny} ${s.bold ? 'bg-accent/15 text-accent' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          title="Bold"
          onClick={() => onSet(level, { bold: !s.bold })}
        >
          <Icon name="format_bold" size={13} />
        </button>
        <button
          className={`${tiny} ${s.italic ? 'bg-accent/15 text-accent' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          title="Italic"
          onClick={() => onSet(level, { italic: !s.italic })}
        >
          <Icon name="format_italic" size={13} />
        </button>
        <input
          type="number"
          min={10}
          max={96}
          value={s.fontSize ?? ''}
          placeholder={String(previewSize)}
          title="Size (px)"
          onChange={(e) => onSet(level, { fontSize: e.target.value === '' ? undefined : Number(e.target.value) })}
          className={numCls}
        />
        <input
          type="color"
          value={s.color ?? '#1c1917'}
          title="Colour"
          onChange={(e) => onSet(level, { color: e.target.value })}
          className="h-6 w-6 rounded cursor-pointer p-0 border border-stone-200 dark:border-stone-700"
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-testid="doc-styles-panel"
      className="absolute z-50 mt-1 left-0 w-[320px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl p-2 font-normal"
    >
      <div className="text-[11px] uppercase tracking-wide text-stone-400 px-2 pb-1">Paragraph styles</div>
      <button
        onClick={() => onApplyLevel(0)}
        className={`w-full text-left px-2 py-1.5 rounded text-[13px] ${
          currentHeadingLevel === null ? 'bg-accent/10' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
        }`}
        data-testid="doc-style-row-0"
      >
        Normal text
      </button>
      {row(1, 'Heading 1', 30)}
      {row(2, 'Heading 2', 24)}
      {row(3, 'Heading 3', 19)}
      <div className="text-[10px] text-stone-400 px-2 pt-1.5 border-t border-stone-100 dark:border-stone-800 mt-1">
        Click a name to apply it. Changing a style updates every heading of that level.
      </div>
    </div>
  )
}
