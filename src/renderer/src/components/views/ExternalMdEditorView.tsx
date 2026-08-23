import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'
import Icon from '../Icon'

// ws-v-3 suite convergence: an ops-console artifact (.md on disk) opens as a
// real PlexiDocs surface and saves straight back to the same file. Round trip
// is markdown → Tiptap → markdown via tiptap-markdown; the mdext IPC layer
// enforces that only files under the ops workspace are touchable. Save state
// is always honest: Saved / Saving / the real error.

interface Props {
  path: string
}

type SaveState = 'loading' | 'clean' | 'dirty' | 'saving' | 'error' | 'load-error'

export default function ExternalMdEditorView({ path }: Props): JSX.Element {
  const [state, setState] = useState<SaveState>('loading')
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const lastSaved = useRef<string>('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Markdown.configure({ html: false, transformPastedText: true })
    ],
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none min-h-[60vh]' }
    },
    onUpdate: ({ editor: e }) => {
      setState((prev) => (prev === 'loading' || prev === 'load-error' ? prev : 'dirty'))
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        const storage = e.storage as { markdown?: { getMarkdown: () => string } }
        const md = storage.markdown?.getMarkdown() ?? ''
        if (md === lastSaved.current) return
        setState('saving')
        void window.api.mdext.write(path, md).then((res) => {
          if (res.ok) {
            lastSaved.current = md
            setState('clean')
            setError(null)
          } else {
            setState('error')
            setError(res.error ?? 'save failed')
          }
        })
      }, 800)
    }
  })

  const load = useCallback(async (): Promise<void> => {
    setState('loading')
    setError(null)
    const res = await window.api.mdext.read(path)
    if (!res.ok || res.content === undefined) {
      setState('load-error')
      setError(res.error ?? 'could not read the file')
      return
    }
    lastSaved.current = res.content
    editor?.commands.setContent(res.content)
    setState('clean')
  }, [path, editor])

  useEffect(() => {
    if (editor) void load()
  }, [editor, load])

  const fileName = path.split('/').pop() ?? path

  if (state === 'load-error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 desk-paper no-tod">
        <div className="max-w-md">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] mb-4">
            <Icon name="description" size={28} className="text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--ink-100)] mb-2">Cannot open this document</h2>
          <p className="text-sm text-[var(--ink-300)] mb-4">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90"
          >
            <Icon name="refresh" size={16} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 desk-paper no-tod">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--edge-soft)]">
        <Icon name="description" size={18} className="text-accent" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--ink-100)] truncate">{fileName}</div>
          <div className="text-[11px] text-[var(--ink-300)] truncate">{path}</div>
        </div>
        <div className="ml-auto text-xs">
          {state === 'loading' && <span className="text-[var(--ink-300)]">Loading…</span>}
          {state === 'clean' && <span className="text-emerald-400">Saved to file</span>}
          {state === 'dirty' && <span className="text-[var(--ink-300)]">Editing…</span>}
          {state === 'saving' && <span className="text-[var(--ink-300)]">Saving…</span>}
          {state === 'error' && (
            <span className="text-rose-400" title={error ?? ''}>
              Save failed: {error}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
