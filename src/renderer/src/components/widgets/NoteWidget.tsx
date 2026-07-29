import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import ConnectedToolMenu from '../contextMenu/UnifiedConnectedMenu'
import { splitStickyBlocks } from '../../lib/stickyText'

interface Props {
  widget: Widget
  inline?: boolean
}

// Render one line's inline markdown-lite: **bold** becomes bold, everything
// else is plain text. Kept tiny so a note stays a note; the heavy lifting
// (full rich text) is what the Page widget is for.
function renderInline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(<strong key={key++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out.length ? out : [s]
}

export default function NoteWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [text, setText] = useState(widget.content)
  const lastSavedRef = useRef(widget.content)
  // Mirror the latest text each render so the unmount-flush closure reads the
  // CURRENT value; hold the debounce timer in a ref so the flush can cancel it.
  const textRef = useRef(widget.content)
  textRef.current = text
  const saveTimerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; selectionText?: string } | null>(null)
  // A note shows a rendered view (so a pasted |---| markdown table becomes a
  // real table, the same as the sticky does) and flips to a raw textarea while
  // editing. Whether we are editing is driven by explicit user intent, tracked
  // in a ref, NOT by inferring from focus. That distinction matters: on the
  // canvas a note can mount before the store hydrates its content, so the
  // initializer below can briefly see empty content. We must not let that
  // transient empty-mount latch the note into edit mode — only a real click
  // into the note (or a genuinely empty note) opens the textarea.
  const userEditRef = useRef(false)
  const [editing, setEditing] = useState(widget.content.trim() === '')

  function enterEdit(): void {
    userEditRef.current = true
    setEditing(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function leaveEdit(): void {
    userEditRef.current = false
    setEditing(false)
  }

  const prevIdRef = useRef(widget.id)
  useEffect(() => {
    const idChanged = widget.id !== prevIdRef.current
    prevIdRef.current = widget.id
    // Adopt the store's content on a NEW widget or a genuine EXTERNAL change, but
    // never re-adopt the echo of our own debounced save: doing so resets the
    // textarea to the just-saved value and drops characters typed in the gap,
    // which reads as the cursor freezing mid-word. (Guard mirrors MarkdownWidget.)
    if (idChanged || widget.content !== lastSavedRef.current) {
      setText(widget.content)
      lastSavedRef.current = widget.content
      // Reconcile the view with the content that just loaded. If the user has not
      // deliberately opened the editor, content presence wins: a note with a table
      // renders it, an empty note stays a typeable textarea. Because this keys off
      // userEditRef and not focus, the empty-then-hydrated mount race resolves to
      // the rendered view instead of getting stuck as a raw textarea.
      if (!userEditRef.current) {
        setEditing(widget.content.trim() === '')
      }
    }
  }, [widget.id, widget.content])

  useEffect(() => {
    if (text === lastSavedRef.current) return
    saveTimerRef.current = window.setTimeout(() => {
      lastSavedRef.current = text
      saveTimerRef.current = null
      void update(widget.id, { content: text })
    }, 600)
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    }
  }, [text, widget.id, update])

  // Flush any pending save on unmount. The canvas remounts every widget when
  // layoutVersion bumps (pin/unpin/group/auto-arrange/AI-accept); without this,
  // the un-debounced tail of what you just typed is silently lost. Mirrors the
  // unmount-flush already present in MarkdownWidget.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        if (textRef.current !== lastSavedRef.current) {
          void update(widget.id, { content: textRef.current })
        }
      }
    }
  }, [update, widget.id])

  const rendered = (
    <div
      className={`fb-note-rendered w-full h-full whitespace-pre-wrap text-[var(--ink-100)] leading-relaxed font-serif cursor-text ${
        inline ? 'text-base' : 'text-sm'
      }`}
      onClick={enterEdit}
    >
      {text.trim() === '' ? (
        <span className="text-[var(--ink-50)]/40">Notes, thoughts, anything that doesn’t fit on a sticky…</span>
      ) : (
        splitStickyBlocks(text).map((block, bi) => {
          if (block.type === 'table') {
            return (
              <div key={`t${bi}`} className="my-1.5 overflow-auto" data-testid={`note-table-${bi}`}>
                <table className="border-collapse text-[0.92em] font-sans">
                  <thead>
                    <tr>
                      {block.headers.map((h, hi) => (
                        <th
                          key={hi}
                          className="border border-[var(--edge-firm)] px-2 py-1 bg-[var(--surface-sunken)] text-left font-semibold align-top"
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri}>
                        {block.headers.map((_, ci) => (
                          <td key={ci} className="border border-[var(--edge-firm)] px-2 py-1 align-top">
                            {renderInline(row[ci] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          if (block.text.trim() === '') return <div key={block.index}>&nbsp;</div>
          return <div key={block.index}>{renderInline(block.text)}</div>
        })
      )}
    </div>
  )

  const editor = (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        userEditRef.current = true
      }}
      onBlur={leaveEdit}
      placeholder="Notes, thoughts, anything that doesn’t fit on a sticky…"
      onContextMenu={(e) => {
        // Shift-right-click for the browser's native menu (cut/copy/paste).
        if (e.shiftKey) return
        e.preventDefault()
        const sel = window.getSelection()?.toString() ?? ''
        setCtxMenu({ x: e.clientX, y: e.clientY, selectionText: sel })
      }}
      className={`w-full h-full resize-none bg-transparent text-[var(--ink-100)] leading-relaxed focus:outline-none placeholder:text-[var(--ink-50)]/40 font-serif ${
        inline ? 'text-base' : 'text-sm'
      }`}
    />
  )

  const content = (
    <div className={`h-full w-full bg-[#fefcf6] ${inline ? 'p-8' : 'p-4'}`}>
      {editing ? editor : rendered}
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

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="note" headerAccent="bg-stone-200/70">
      {content}
    </WidgetFrame>
  )
}
