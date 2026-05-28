import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import type { Editor } from '@tiptap/react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import Icon from '../Icon'

function formatAge(ts: number | null): string {
  if (!ts) return 'never'
  const ms = Date.now() - ts
  const s = Math.round(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

interface Props {
  widget: Widget
  inline?: boolean
}

// Notion-style page widget. Tiptap handles all the heavy lifting (headings,
// lists, todos, code blocks, formatting via StarterKit + TaskList + TaskItem).
// We add a custom slash menu for block insertion + an inline AI prompt.
//
// Storage: widget.content holds the editor's JSON serialization. We commit
// on each transaction (debounced lightly) so the page survives reloads.
export default function PageWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Living-mode local state
  const isLiving = widget.livingQuery !== null && widget.livingQuery !== undefined
  const [livingBusy, setLivingBusy] = useState(false)
  const [livingError, setLivingError] = useState<string | null>(null)
  const [editingQuery, setEditingQuery] = useState(false)
  const [queryDraft, setQueryDraft] = useState(widget.livingQuery ?? '')
  // For the freshness badge — tick once per minute so "2 min ago" updates
  // without forcing a full canvas re-render.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    if (!isLiving) return
    const id = window.setInterval(() => setNowTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [isLiving])

  // Throttle the persist call — Tiptap fires onUpdate on every keystroke and
  // the markdown serializer + IPC roundtrip add up quickly.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function schedulePersist(editor: Editor): void {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      const json = JSON.stringify(editor.getJSON())
      void update(widget.id, { content: json })
    }, 250)
  }

  const editor = useEditor(
    {
      editable: !isLiving,
      extensions: [
        StarterKit.configure({
          // Keep StarterKit defaults; everything from heading 1-3 to code blocks works out of the box.
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false }),
        Placeholder.configure({
          placeholder: isLiving
            ? 'Living page — set a query above to populate this.'
            : 'Type / for a menu, or just start writing…'
        })
      ],
      content: tryParseContent(widget.content),
      onUpdate({ editor: ed }) {
        if (isLiving) return // never persist edits in living mode — content is system-owned
        schedulePersist(ed)
      },
      // Detect slash key to open the block menu. We open at the caret's
      // screen position so the menu floats next to the cursor.
      editorProps: {
        handleKeyDown(_, event) {
          if (isLiving) return false
          if (event.key === '/' && !slashOpen) {
            // Defer until Tiptap has inserted the / so the caret lands
            // after it; then read the caret position to anchor the menu.
            setTimeout(() => {
              const sel = window.getSelection()
              if (sel && sel.rangeCount > 0) {
                const rect = sel.getRangeAt(0).getBoundingClientRect()
                const container = containerRef.current?.getBoundingClientRect()
                if (container) {
                  setSlashPos({
                    top: rect.bottom - container.top + 2,
                    left: rect.left - container.left
                  })
                  setSlashOpen(true)
                }
              }
            }, 0)
            return false
          }
          if (event.key === 'Escape') {
            setSlashOpen(false)
            setAiOpen(false)
          }
          return false
        }
      }
    },
    // Re-mount the editor when the living-page generation timestamp changes —
    // that's the signal that widget.content has been replaced with a fresh
    // body. For manual pages the timestamp stays null so this collapses to
    // the original `[widget.id]` behaviour.
    [widget.id, widget.livingGeneratedAt]
  )

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [])

  function removeSlashTrigger(): void {
    if (!editor) return
    // Step back to delete the "/" we inserted that triggered the menu.
    editor.chain().focus().deleteRange({
      from: editor.state.selection.from - 1,
      to: editor.state.selection.from
    }).run()
  }

  function applyBlock(action: () => void): void {
    if (!editor) return
    removeSlashTrigger()
    action()
    setSlashOpen(false)
  }

  async function regenerateLiving(): Promise<void> {
    if (livingBusy) return
    setLivingBusy(true)
    setLivingError(null)
    try {
      const resp = await window.api.livingPage.regenerate(widget.id)
      if (!resp.ok) {
        setLivingError(resp.error ?? 'Regeneration failed')
        return
      }
      if (resp.skip) {
        setLivingError(resp.reason ?? 'No source material on the canvas yet.')
        return
      }
      // Persist via the store's `update` — this both writes the DB (through
      // the existing widgets:update IPC) and applies the optimistic local
      // update, which re-mounts the editor via the livingGeneratedAt dep.
      if (resp.content && resp.generatedAt) {
        await update(widget.id, {
          content: resp.content,
          livingGeneratedAt: resp.generatedAt
        })
      }
    } finally {
      setLivingBusy(false)
    }
  }

  async function enableLivingMode(): Promise<void> {
    const q = prompt(
      'What should this living page summarize?',
      'A running summary of everything on this task.'
    )
    if (!q || !q.trim()) return
    await update(widget.id, { livingQuery: q.trim(), livingPaused: false })
    setQueryDraft(q.trim())
    // Kick an immediate first generation so the page isn't empty.
    setTimeout(() => void regenerateLiving(), 50)
  }

  async function convertToManual(): Promise<void> {
    if (!confirm('Stop auto-updating this page? Its current content will become editable.')) return
    await update(widget.id, { livingQuery: null, livingGeneratedAt: null, livingPaused: false })
  }

  async function togglePauseLiving(): Promise<void> {
    await update(widget.id, { livingPaused: !widget.livingPaused })
  }

  async function commitQueryEdit(): Promise<void> {
    const next = queryDraft.trim()
    if (!next) {
      setQueryDraft(widget.livingQuery ?? '')
      setEditingQuery(false)
      return
    }
    if (next !== widget.livingQuery) {
      await update(widget.id, { livingQuery: next })
      // Re-generate immediately on query change — it's a deliberate user action.
      setTimeout(() => void regenerateLiving(), 50)
    }
    setEditingQuery(false)
  }

  async function runAiPrompt(): Promise<void> {
    if (!editor || !aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    try {
      const response = await window.api.chat.send({
        taskId: null,
        messages: [{ role: 'user', content: aiPrompt, ts: Date.now() }]
      })
      const text = response.ok
        ? response.message?.content ?? '(empty)'
        : `Error: ${response.error ?? 'failed'}`
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'paragraph',
          content: [{ type: 'text', text }]
        })
        .run()
      setAiPrompt('')
      setAiOpen(false)
    } finally {
      setAiBusy(false)
    }
  }

  const body = (
    <div
      ref={containerRef}
      className="h-full w-full bg-white dark:bg-stone-900 overflow-y-auto relative flex flex-col"
    >
      {isLiving && (
        <LivingHeader
          query={widget.livingQuery ?? ''}
          editingQuery={editingQuery}
          queryDraft={queryDraft}
          setQueryDraft={setQueryDraft}
          onStartEdit={() => {
            setQueryDraft(widget.livingQuery ?? '')
            setEditingQuery(true)
          }}
          onCommitEdit={() => void commitQueryEdit()}
          onCancelEdit={() => {
            setQueryDraft(widget.livingQuery ?? '')
            setEditingQuery(false)
          }}
          generatedAt={widget.livingGeneratedAt}
          paused={widget.livingPaused}
          busy={livingBusy}
          error={livingError}
          onRegenerate={() => void regenerateLiving()}
          onTogglePause={() => void togglePauseLiving()}
          onConvertToManual={() => void convertToManual()}
        />
      )}
      {!isLiving && (
        <div className="flex items-center justify-end px-2 py-1 border-b border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-900/40 shrink-0">
          <button
            onClick={() => void enableLivingMode()}
            className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-accent flex items-center gap-1"
            title="Turn this page into a living summary that auto-updates from the rest of your canvas"
          >
            <Icon name="auto_awesome" size={11} />
            <span>Make living</span>
          </button>
        </div>
      )}
      {/* Reuse the same `md-rendered tiptap-editor` styles MarkdownWidget uses
          — they're hand-defined in globals.css. We don't have Tailwind's
          @tailwindcss/typography plugin installed, so `prose` classes would
          render as bare text (which is why this used to be blank). */}
      <div className={`md-rendered tiptap-editor px-4 py-3 text-stone-900 dark:text-stone-100 min-h-[120px] flex-1 ${isLiving ? 'select-text' : ''}`}>
        <EditorContent editor={editor} />
      </div>

      {slashOpen && slashPos && (
        <div
          className="absolute z-50 w-56 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1"
          style={{ top: slashPos.top, left: slashPos.left }}
        >
          <SlashItem
            icon="title"
            label="Heading 1"
            shortcut="#"
            onClick={() =>
              applyBlock(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())
            }
          />
          <SlashItem
            icon="title"
            label="Heading 2"
            shortcut="##"
            onClick={() =>
              applyBlock(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())
            }
          />
          <SlashItem
            icon="format_list_bulleted"
            label="Bullet list"
            shortcut="-"
            onClick={() =>
              applyBlock(() => editor?.chain().focus().toggleBulletList().run())
            }
          />
          <SlashItem
            icon="format_list_numbered"
            label="Numbered list"
            shortcut="1."
            onClick={() =>
              applyBlock(() => editor?.chain().focus().toggleOrderedList().run())
            }
          />
          <SlashItem
            icon="checklist"
            label="Todo list"
            shortcut="[]"
            onClick={() => applyBlock(() => editor?.chain().focus().toggleTaskList().run())}
          />
          <SlashItem
            icon="code"
            label="Code block"
            shortcut="```"
            onClick={() =>
              applyBlock(() => editor?.chain().focus().toggleCodeBlock().run())
            }
          />
          <SlashItem
            icon="format_quote"
            label="Quote"
            shortcut=">"
            onClick={() => applyBlock(() => editor?.chain().focus().toggleBlockquote().run())}
          />
          <SlashItem
            icon="horizontal_rule"
            label="Divider"
            onClick={() => applyBlock(() => editor?.chain().focus().setHorizontalRule().run())}
          />
          <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
          <SlashItem
            icon="auto_awesome"
            label="AI prompt"
            shortcut="/ai"
            onClick={() => {
              removeSlashTrigger()
              setSlashOpen(false)
              setAiOpen(true)
            }}
          />
        </div>
      )}

      {aiOpen && (
        <div className="absolute bottom-3 left-3 right-3 z-50 rounded-md border border-accent bg-white dark:bg-stone-900 shadow-lg p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <Icon name="auto_awesome" size={12} className="text-accent" />
            <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
              AI prompt
            </span>
            <button
              onClick={() => setAiOpen(false)}
              className="ml-auto text-stone-400 hover:text-stone-700"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void runAiPrompt()
              }
            }}
            placeholder="Ask Claude to write or transform — press Cmd+Enter to run"
            rows={2}
            className="w-full text-[12px] px-2 py-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded resize-none focus:outline-none focus:border-accent"
          />
          <div className="flex justify-end mt-1">
            <button
              onClick={() => void runAiPrompt()}
              disabled={!aiPrompt.trim() || aiBusy}
              className="text-[11px] px-2 py-0.5 rounded bg-accent text-white disabled:opacity-50"
            >
              {aiBusy ? 'Thinking…' : 'Insert'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (inline) return body
  return (
    <WidgetFrame
      widget={widget}
      headerLabel={widget.title || 'Page'}
      headerAccent="bg-stone-300/60"
    >
      {body}
    </WidgetFrame>
  )
}

function SlashItem({
  icon,
  label,
  shortcut,
  onClick
}: {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-left"
    >
      <Icon name={icon} size={14} className="text-stone-500" />
      <span className="text-[12px] flex-1 text-stone-700 dark:text-stone-200">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-stone-400 font-mono">{shortcut}</span>
      )}
    </button>
  )
}

// Header strip rendered above a Living page. Shows the query (with edit-in-
// place), a freshness badge, and the action cluster (regenerate / pause /
// convert-to-manual). Kept self-contained because the manual page mode
// doesn't need any of this chrome.
interface LivingHeaderProps {
  query: string
  editingQuery: boolean
  queryDraft: string
  setQueryDraft: (s: string) => void
  onStartEdit: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  generatedAt: number | null
  paused: boolean
  busy: boolean
  error: string | null
  onRegenerate: () => void
  onTogglePause: () => void
  onConvertToManual: () => void
}

function LivingHeader(props: LivingHeaderProps): JSX.Element {
  const {
    query,
    editingQuery,
    queryDraft,
    setQueryDraft,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    generatedAt,
    paused,
    busy,
    error,
    onRegenerate,
    onTogglePause,
    onConvertToManual
  } = props

  return (
    <div className="border-b border-stone-200 dark:border-stone-700 bg-gradient-to-b from-accent/[0.06] to-transparent shrink-0">
      <div className="px-3 py-1.5 flex items-start gap-2">
        <Icon
          name="auto_awesome"
          size={12}
          className={`text-accent mt-0.5 shrink-0 ${busy ? 'animate-pulse' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 mb-0.5 flex items-center gap-1.5">
            <span>Living page</span>
            <span className="text-stone-300 dark:text-stone-600">·</span>
            <span
              title={generatedAt ? new Date(generatedAt).toLocaleString() : 'Never generated'}
              className={paused ? 'text-amber-600' : ''}
            >
              {busy
                ? 'regenerating…'
                : paused
                  ? 'paused'
                  : `updated ${formatAge(generatedAt)}`}
            </span>
          </div>
          {editingQuery ? (
            <input
              autoFocus
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full text-[12px] px-1.5 py-0.5 bg-white dark:bg-stone-800 border border-accent rounded focus:outline-none"
              placeholder="What should this page summarize?"
            />
          ) : (
            <button
              onClick={onStartEdit}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-left text-[12px] text-stone-700 dark:text-stone-200 hover:text-accent leading-snug truncate w-full"
              title="Click to edit the query"
            >
              {query || '(no query — click to set one)'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onRegenerate}
            disabled={busy}
            className="icon-btn !h-6 !w-6 disabled:opacity-40"
            title="Regenerate now"
          >
            <Icon name="refresh" size={13} className={busy ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onTogglePause}
            className="icon-btn !h-6 !w-6"
            title={paused ? 'Resume auto-updates' : 'Pause auto-updates'}
          >
            <Icon name={paused ? 'play_arrow' : 'pause'} size={13} />
          </button>
          <button
            onClick={onConvertToManual}
            className="icon-btn !h-6 !w-6"
            title="Convert to manual page (stop auto-updates, make editable)"
          >
            <Icon name="edit_note" size={13} />
          </button>
        </div>
      </div>
      {error && (
        <div className="px-3 pb-1.5 text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
          <Icon name="info" size={11} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

function tryParseContent(content: string): object | null {
  if (!content) return null
  try {
    return JSON.parse(content) as object
  } catch {
    // Backwards compatibility: a previously-saved plain-text content (or
    // markdown). Render as a single paragraph so we don't lose data.
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: content }]
        }
      ]
    }
  }
}
