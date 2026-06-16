import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'
import Icon from '../Icon'

// Doc editor — a full rich-text surface on the same Tiptap engine as the
// in-canvas page widget, so headings, lists, todos, tables, code and pasted
// markdown all work. The toolbar's "Ask AI" continues the document in place:
// it drafts content from your instruction and inserts it at the cursor, which
// is the "continue with AI" half of the loop.

interface Props {
  content: unknown
  onChange: (json: unknown) => void
}

export default function DocEditor({ content, onChange }: Props): JSX.Element {
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      TableKit.configure({ table: { resizable: false } }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: false }),
      Placeholder.configure({ placeholder: 'Write something, or use Ask AI to continue…' })
    ],
    content: (content as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate({ editor }) {
      onChange(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[60vh] text-[15px] leading-relaxed'
      }
    }
  })

  async function runAi(): Promise<void> {
    const prompt = aiPrompt.trim()
    if (!prompt || !editor) return
    setAiBusy(true)
    setAiError(null)
    const r = await window.api.ai.suggestPageContent(prompt)
    setAiBusy(false)
    if (!r.ok) {
      setAiError(r.error || 'Could not draft that.')
      return
    }
    try {
      const json = JSON.parse(r.tiptapJson || '{}')
      editor.chain().focus().insertContent(json.content ?? json).run()
      setAiOpen(false)
      setAiPrompt('')
    } catch {
      // Fall back to inserting the markdown as plain text if the JSON is odd.
      editor.chain().focus().insertContent(r.markdown || '').run()
      setAiOpen(false)
      setAiPrompt('')
    }
  }

  if (!editor) return <div />

  const btn = (active: boolean): string =>
    `h-7 w-7 inline-flex items-center justify-center rounded text-[13px] ${
      active
        ? 'bg-accent/15 text-accent'
        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
    }`

  return (
    <div className="max-w-3xl mx-auto px-8 py-6">
      {/* Formatting toolbar */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-1.5 mb-4 flex items-center gap-0.5 bg-paper/95 backdrop-blur border-b border-stone-200/70 dark:border-stone-800/70">
        <button className={btn(editor.isActive('heading', { level: 1 }))} title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </button>
        <button className={btn(editor.isActive('heading', { level: 2 }))} title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button className={btn(editor.isActive('bold'))} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Icon name="format_bold" size={15} />
        </button>
        <button className={btn(editor.isActive('italic'))} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Icon name="format_italic" size={15} />
        </button>
        <button className={btn(editor.isActive('bulletList'))} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <Icon name="format_list_bulleted" size={15} />
        </button>
        <button className={btn(editor.isActive('taskList'))} title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <Icon name="checklist" size={15} />
        </button>
        <button className={btn(editor.isActive('blockquote'))} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Icon name="format_quote" size={15} />
        </button>
        <div className="ml-auto">
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
          >
            <Icon name="auto_awesome" size={13} />
            Ask AI
          </button>
        </div>
      </div>

      {aiOpen && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/[0.04] p-3">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void runAi()
            }}
            placeholder="Continue this document… e.g. add a risks section, write a conclusion, draft three bullet points on pricing"
            rows={2}
            autoFocus
            className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
          />
          {aiError && <div className="text-[12px] text-red-600 dark:text-red-400 mt-1">{aiError}</div>}
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => void runAi()} disabled={aiBusy || !aiPrompt.trim()} className="btn-primary text-[12px] px-3 py-1.5">
              {aiBusy ? 'Drafting…' : 'Insert draft'}
            </button>
            <span className="text-[11px] text-stone-400">Inserts at your cursor. Cmd+Enter</span>
          </div>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}
