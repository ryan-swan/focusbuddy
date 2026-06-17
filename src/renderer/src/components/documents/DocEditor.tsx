import { useEffect, useId, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { buildDocExtensions } from './editor/extensions'
import { htmlToDocContent } from '../../lib/docHtml'
import { sanitizeHtml } from '../../lib/htmlSanitize'
import { parseDocBody, wrapDocBody, headingCss, type HeadingStyle, type HeadingStyles } from './editor/headingStyles'
import Toolbar from './editor/Toolbar'
import DocBubbleMenu from './editor/DocBubbleMenu'
import FindReplace from './editor/FindReplace'
import { useDocAi } from './editor/useDocAi'
import Icon from '../Icon'

// Doc editor — a Word-class rich-text surface on Tiptap. The toolbar, bubble
// menu and slash menu expose the full formatting set; Ask AI drafts formatted
// content at the cursor and can rewrite the selection; the Office menu imports
// and exports real .docx and exports PDF. Body edits flow to onChange (the
// store's debounced autosave).

interface Props {
  content: unknown
  title: string
  onChange: (json: unknown) => void
}

const REWRITE_ACTIONS = [
  'Improve writing',
  'Make it more concise',
  'Fix spelling and grammar',
  'Make the tone more formal',
  'Turn this into a bulleted list',
  'Turn this into a table'
]

export default function DocEditor({ content, title, onChange }: Props): JSX.Element {
  const [findOpen, setFindOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [busyOffice, setBusyOffice] = useState<string | null>(null)
  const [officeMsg, setOfficeMsg] = useState<string | null>(null)

  // Parse the (possibly legacy) body once into the Tiptap doc + named heading
  // styles. The body is persisted wrapped as { doc, headingStyles } so heading
  // styles survive save/reopen; legacy raw-Tiptap bodies still open.
  const initial = parseDocBody(content)
  const [headingStyles, setHeadingStyles] = useState<HeadingStyles>(initial.headingStyles)
  // Stable class to scope the injected heading CSS to this editor instance.
  const scopeClass = 'doc-hs-' + useId().replace(/[:]/g, '')

  const editor = useEditor({
    extensions: buildDocExtensions({ interactive: true }),
    content: (initial.doc as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate({ editor }) {
      onChange(wrapDocBody(editor.getJSON(), headingStyles))
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[60vh] text-[15px] leading-relaxed',
        'data-testid': 'doc-editor-surface'
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          setFindOpen(true)
          return true
        }
        return false
      }
    }
  })

  const ai = useDocAi(editor)

  // Update one heading level's named style and persist it with the document, so
  // every heading of that level re-renders with the new style at once.
  function updateHeadingStyle(level: number, patch: Partial<HeadingStyle>): void {
    setHeadingStyles((prev) => {
      const next: HeadingStyles = { ...prev, [level]: { ...prev[level], ...patch } }
      onChange(wrapDocBody(editor?.getJSON() ?? initial.doc, next))
      return next
    })
  }

  // Reset the AI instruction box whenever the panel reopens.
  useEffect(() => {
    if (ai.open) setAiInstruction('')
  }, [ai.open])

  // Expose the editor as a debug/test handle. Harmless in production (a single
  // reference) and lets e2e drive selections deterministically, since selecting
  // ProseMirror text through synthetic DOM events is unreliable across platforms.
  useEffect(() => {
    if (!editor) return
    ;(window as unknown as { __docEditor?: unknown }).__docEditor = editor
    return () => {
      const w = window as unknown as { __docEditor?: unknown }
      if (w.__docEditor === editor) delete w.__docEditor
    }
  }, [editor])

  async function insertImage(): Promise<void> {
    if (!editor) return
    const res = await window.api.office.pickImage()
    if (res.ok && res.dataUrl) {
      editor.chain().focus().setImage({ src: res.dataUrl }).run()
    }
  }

  async function importDocx(): Promise<void> {
    if (!editor) return
    setBusyOffice('Importing…')
    setOfficeMsg(null)
    try {
      const res = await window.api.office.importDocx()
      if (res.ok && res.html != null) {
        editor.chain().focus().insertContent(htmlToDocContent(res.html)).run()
        setOfficeMsg('Imported. Word styling is approximated, not pixel-perfect.')
      } else if (res.error) {
        setOfficeMsg(res.error)
      }
    } finally {
      setBusyOffice(null)
    }
  }

  async function exportDocx(): Promise<void> {
    if (!editor) return
    setBusyOffice('Exporting…')
    setOfficeMsg(null)
    try {
      const res = await window.api.office.exportDocx({ html: editor.getHTML(), title })
      setOfficeMsg(res.ok ? `Saved ${res.path}` : res.error ?? null)
    } finally {
      setBusyOffice(null)
    }
  }

  async function exportPdf(): Promise<void> {
    if (!editor) return
    setBusyOffice('Exporting…')
    setOfficeMsg(null)
    try {
      const res = await window.api.office.exportPdf({ html: editor.getHTML(), title })
      setOfficeMsg(res.ok ? `Saved ${res.path}` : res.error ?? null)
    } finally {
      setBusyOffice(null)
    }
  }

  if (!editor) return <div />

  return (
    <div className={`max-w-3xl mx-auto px-8 py-6 relative ${scopeClass}`}>
      {/* Named heading styles: one rule per configured level, scoped to this editor. */}
      <style dangerouslySetInnerHTML={{ __html: headingCss(scopeClass, headingStyles) }} />
      <Toolbar
        editor={editor}
        headingStyles={headingStyles}
        onSetHeadingStyle={updateHeadingStyle}
        onAskAi={ai.openInsert}
        onToggleFind={() => setFindOpen((v) => !v)}
        onInsertImage={() => void insertImage()}
        onImportDocx={() => void importDocx()}
        onExportDocx={() => void exportDocx()}
        onExportPdf={() => void exportPdf()}
      />

      <DocBubbleMenu editor={editor} onAiRewrite={ai.openRewrite} />

      {findOpen && <FindReplace editor={editor} onClose={() => setFindOpen(false)} />}

      {(busyOffice || officeMsg) && (
        <div className="mb-3 text-[12px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5" data-testid="doc-office-status">
          {busyOffice && <Icon name="autorenew" size={13} className="animate-spin" />}
          <span>{busyOffice ?? officeMsg}</span>
          {officeMsg && !busyOffice && (
            <button onClick={() => setOfficeMsg(null)} className="text-stone-400 hover:text-stone-600">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}

      {ai.open && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/[0.04] p-3" data-testid="doc-ai-panel">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon name="auto_awesome" size={13} className="text-accent" />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-accent">
              {ai.mode === 'rewrite' ? 'Rewrite selection' : 'Draft with AI'}
            </span>
            <button onClick={ai.close} className="ml-auto icon-btn" aria-label="Close">
              <Icon name="close" size={13} />
            </button>
          </div>

          {ai.mode === 'rewrite' && (
            <div className="flex flex-wrap gap-1 mb-2">
              {REWRITE_ACTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => void ai.run(a)}
                  disabled={ai.busy}
                  className="text-[11px] px-2 py-1 rounded-full border border-stone-300 dark:border-stone-600 hover:bg-accent/10 hover:border-accent disabled:opacity-50"
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ai.run(aiInstruction)
            }}
            placeholder={
              ai.mode === 'rewrite'
                ? 'Or describe how to change the selection…'
                : 'Describe what to write… e.g. a risks section with a table, a conclusion, three pricing bullets'
            }
            rows={2}
            autoFocus
            className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
          />

          {ai.error && <div className="text-[12px] text-red-600 dark:text-red-400 mt-1">{ai.error}</div>}

          {ai.previewHtml != null && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Preview</div>
              <div
                className="prose prose-sm prose-stone dark:prose-invert max-w-none max-h-60 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
                data-testid="doc-ai-preview"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(ai.previewHtml) }}
              />
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            {ai.previewHtml == null ? (
              <button
                onClick={() => void ai.run(aiInstruction)}
                disabled={ai.busy || !aiInstruction.trim()}
                className="btn-primary text-[12px] px-3 py-1.5"
              >
                {ai.busy ? 'Drafting…' : ai.mode === 'rewrite' ? 'Rewrite' : 'Draft'}
              </button>
            ) : (
              <>
                <button onClick={ai.apply} data-testid="doc-ai-apply" className="btn-primary text-[12px] px-3 py-1.5">
                  {ai.mode === 'rewrite' ? 'Replace selection' : 'Insert'}
                </button>
                <button
                  onClick={() => void ai.run(aiInstruction || (ai.mode === 'rewrite' ? 'Improve writing' : ''))}
                  disabled={ai.busy}
                  className="text-[12px] px-3 py-1.5 rounded border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Regenerate
                </button>
              </>
            )}
            <span className="text-[11px] text-stone-400">Previewed before it touches the document. Cmd+Enter</span>
          </div>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}
