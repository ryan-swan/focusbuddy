import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import type { Editor } from '@tiptap/react'
import type { Widget } from '@shared/types'
import { useWidgetStore } from '../../stores/widgets'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'
import ConnectedToolMenu from '../ConnectedToolMenu'

interface Props {
  widget: Widget
  inline?: boolean
}

interface ToolbarBtn {
  icon: string
  title: string
  shortcut?: string
  isActive?: (e: Editor) => boolean
  run: (e: Editor) => void
}

const TOOLBAR: ToolbarBtn[] = [
  {
    icon: 'format_bold',
    title: 'Bold',
    shortcut: '⌘B',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run()
  },
  {
    icon: 'format_italic',
    title: 'Italic',
    shortcut: '⌘I',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run()
  },
  {
    icon: 'format_strikethrough',
    title: 'Strikethrough',
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run()
  },
  {
    icon: 'code',
    title: 'Inline code',
    isActive: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run()
  },
  {
    icon: 'title',
    title: 'Heading 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    icon: 'format_list_bulleted',
    title: 'Bulleted list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run()
  },
  {
    icon: 'format_list_numbered',
    title: 'Numbered list',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run()
  },
  {
    icon: 'check_box',
    title: 'Task list',
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run()
  },
  {
    icon: 'format_quote',
    title: 'Quote',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run()
  },
  {
    icon: 'data_object',
    title: 'Code block',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run()
  },
  {
    icon: 'link',
    title: 'Link',
    isActive: (e) => e.isActive('link'),
    run: (e) => {
      if (e.isActive('link')) {
        e.chain().focus().unsetLink().run()
        return
      }
      const prev = (e.getAttributes('link').href as string) || 'https://'
      const url = window.prompt('Link URL', prev)
      if (url === null) return
      if (url === '') {
        e.chain().focus().unsetLink().run()
        return
      }
      e.chain().focus().setLink({ href: url }).run()
    }
  },
  {
    icon: 'horizontal_rule',
    title: 'Divider',
    run: (e) => e.chain().focus().setHorizontalRule().run()
  }
]

export default function MarkdownWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const lastSavedRef = useRef(widget.content)
  const saveTimerRef = useRef<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; selectionText?: string } | null>(null)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Use tiptap-markdown's link/code handling; keep StarterKit defaults otherwise
          link: false
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder:
            'Type or paste markdown. ⌘B bold · ⌘I italic · type "# " for a heading · "- " for a list · "[ ] " for a task'
        }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: '-',
          linkify: true,
          breaks: false,
          transformPastedText: true,
          transformCopiedText: false
        })
      ],
      content: widget.content || '',
      onUpdate: ({ editor: ed }) => {
        // Debounced save — pull serialized markdown from the editor and
        // persist. Defensive against two race conditions that caused
        // AI-generated checklists to "auto-delete":
        //
        //   1. The markdown extension's storage may not be wired up yet on
        //      the first onUpdate (when the initial parse runs). storage
        //      .markdown is undefined → we'd previously default to '' and
        //      save an empty string back to the DB, clobbering the original.
        //
        //   2. Even when storage exists, getMarkdown() can return '' for a
        //      brief window before the parsed doc is committed. If we save
        //      that empty string while the actual editor doc is NOT empty,
        //      we'd wipe out content the user never touched.
        //
        // Both guards apply only when the editor genuinely has content
        // (`!ed.isEmpty`) — a deliberate user-driven clear-all still saves
        // correctly.
        if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
          const storage = ed.storage as { markdown?: { getMarkdown: () => string } }
          if (!storage.markdown) return
          const md = storage.markdown.getMarkdown()
          if (md === '' && !ed.isEmpty) return
          if (md === lastSavedRef.current) return
          lastSavedRef.current = md
          void update(widget.id, { content: md })
        }, 600)
      }
    },
    // Re-init when widget id changes (e.g. focus-mode swap)
    [widget.id]
  )

  // If the widget's content changes externally while we're mounted (e.g. AI Setup spawn
  // followed by a server-side update), reconcile — but never clobber an unsaved local
  // edit, which lastSavedRef guards against.
  useEffect(() => {
    if (!editor) return
    if (widget.content === lastSavedRef.current) return
    lastSavedRef.current = widget.content
    editor.commands.setContent(widget.content || '', { emitUpdate: false })
  }, [editor, widget.content])

  // Flush any pending save when the widget unmounts. Same guards as the
  // debounced path above — never overwrite non-empty content with empty
  // markdown that came from a not-yet-ready serializer.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        const ed = editor
        if (ed) {
          const storage = ed.storage as { markdown?: { getMarkdown: () => string } }
          if (!storage.markdown) return
          const md = storage.markdown.getMarkdown()
          if (md === '' && !ed.isEmpty) return
          if (md !== lastSavedRef.current) {
            void update(widget.id, { content: md })
          }
        }
      }
    }
  }, [editor, update, widget.id])

  const body = (
    <div className="h-full w-full flex flex-col bg-white dark:bg-stone-900">
      <div className="px-2 py-1 border-b border-stone-200 dark:border-stone-700 flex items-center gap-0.5 flex-wrap bg-stone-50 dark:bg-stone-800/50">
        {TOOLBAR.map((b) => {
          const active = editor ? b.isActive?.(editor) ?? false : false
          return (
            <button
              key={b.title}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep editor focus
              onClick={(e) => {
                e.stopPropagation()
                if (editor) b.run(editor)
              }}
              title={`${b.title}${b.shortcut ? ` (${b.shortcut})` : ''}`}
              className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <Icon name={b.icon} size={13} />
            </button>
          )
        })}
      </div>

      <div
        className="flex-1 overflow-auto md-rendered tiptap-editor px-4 py-3 text-stone-900 dark:text-stone-100"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          if (e.shiftKey) return
          e.preventDefault()
          const sel = window.getSelection()?.toString() ?? ''
          setCtxMenu({ x: e.clientX, y: e.clientY, selectionText: sel })
        }}
      >
        <EditorContent editor={editor} />
      </div>
      {ctxMenu && (
        <ConnectedToolMenu
          sourceWidgetId={widget.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          selectionContext={{ selectionText: ctxMenu.selectionText }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )

  if (inline) return body

  return (
    <WidgetFrame widget={widget} headerLabel="markdown" headerAccent="bg-stone-200/70">
      {body}
    </WidgetFrame>
  )
}
