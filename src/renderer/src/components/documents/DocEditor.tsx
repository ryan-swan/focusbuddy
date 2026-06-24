import { useEffect, useId, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { buildDocExtensions } from './editor/extensions'
import { htmlToDocContent } from '../../lib/docHtml'
import { sanitizeHtml } from '../../lib/htmlSanitize'
import { parseDocBody, wrapDocBody, headingCss, type HeadingStyle, type HeadingStyles } from './editor/headingStyles'
import Toolbar from './editor/Toolbar'
import DocBubbleMenu from './editor/DocBubbleMenu'
import FindReplace from './editor/FindReplace'
import DocOutline from './editor/DocOutline'
import { useDocAi } from './editor/useDocAi'
import { useRegisterEditorCommands, type EditorCommand } from '../../stores/editorCommands'
import type { Doc as YDoc } from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import Icon from '../Icon'

// Focus mode dims every block except the one under the cursor, so a long draft
// collapses to the single sentence being written. The FocusBlock decoration tags
// the active block; this CSS does the fading. Scoped to .fb-focus-mode so it is
// completely inert until focus mode is on.
const FOCUS_CSS = `
.fb-focus-mode .ProseMirror > * { opacity: .24; transition: opacity .4s var(--ease-spring-soft, ease); }
.fb-focus-mode .ProseMirror > .fb-focus-block { opacity: 1; }
`

// Comment-anchored text: a soft amber highlight you can click to open the thread.
const COMMENT_CSS = `
.ProseMirror .fb-comment { background: rgba(250, 204, 21, .22); border-bottom: 2px solid rgba(234, 179, 8, .7); border-radius: 2px; cursor: pointer; }
.ProseMirror .fb-comment:hover { background: rgba(250, 204, 21, .38); }
`

type Paper = 'letter' | 'a4'
type Orientation = 'portrait' | 'landscape'

// Page geometry at 96dpi (the CSS reference), so a Letter portrait sheet is the
// familiar 816x1056 with a 1-inch margin, A4 is 794x1123, and landscape swaps the
// long and short edges. This is what makes the page-view sheet look like real
// paper and gives portrait/landscape a true effect rather than a cosmetic one.
function pageGeometry(paper: Paper, orientation: Orientation): { w: number; h: number; margin: number } {
  const DPI = 96
  const base = paper === 'a4' ? { w: 8.27 * DPI, h: 11.69 * DPI } : { w: 8.5 * DPI, h: 11 * DPI }
  const margin = DPI // a 1-inch margin, Word's default
  const portrait = orientation === 'portrait'
  return {
    w: Math.round(portrait ? base.w : base.h),
    h: Math.round(portrait ? base.h : base.w),
    margin
  }
}

function readPref<T extends string>(key: string, allowed: readonly T[], dflt: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : dflt
  } catch {
    return dflt
  }
}

// Doc editor — a Word-class rich-text surface on Tiptap. The toolbar, bubble
// menu and slash menu expose the full formatting set; Ask AI drafts formatted
// content at the cursor and can rewrite the selection; the Office menu imports
// and exports real .docx and exports PDF. Body edits flow to onChange (the
// store's debounced autosave).

interface Props {
  content: unknown
  title: string
  onChange: (json: unknown) => void
  // When set, the editor is a live collaborator on this Yjs document: content
  // comes from the CRDT (not the `content` prop) and local edits flow to peers
  // through it rather than through onChange.
  ydoc?: YDoc
  // Awareness + the local user's label/colour render other people's live cursors.
  awareness?: Awareness
  user?: { name: string; color: string }
  // Hands the live editor instance to the parent (for comments: apply marks,
  // read the selection, jump to a range). Called with null on teardown.
  onEditorReady?: (editor: Editor | null) => void
  // Clicking commented (highlighted) text opens its thread.
  onCommentClick?: (commentId: string) => void
}

const REWRITE_ACTIONS = [
  'Improve writing',
  'Make it more concise',
  'Fix spelling and grammar',
  'Make the tone more formal',
  'Turn this into a bulleted list',
  'Turn this into a table'
]

export default function DocEditor({ content, title, onChange, ydoc, awareness, user, onEditorReady, onCommentClick }: Props): JSX.Element {
  const [findOpen, setFindOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  // Page vs continuous layout, paper size and orientation — remembered across
  // sessions so the writer's preferred surface is how the document opens.
  const [pageView, setPageView] = useState<boolean>(() => readPref('fb.doc.pageView', ['0', '1'] as const, '0') === '1')
  const [orientation, setOrientation] = useState<Orientation>(() => readPref('fb.doc.orientation', ['portrait', 'landscape'] as const, 'portrait'))
  const [paper, setPaper] = useState<Paper>(() => readPref('fb.doc.paper', ['letter', 'a4'] as const, 'letter'))
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
    extensions: buildDocExtensions({ interactive: true, collab: ydoc, awareness, user }),
    // In collab mode the CRDT owns the content; passing `content` too would
    // double-insert it on top of what Collaboration loads from the Yjs doc.
    ...(ydoc ? {} : { content: (initial.doc as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] } }),
    onUpdate({ editor }) {
      // Non-collab: this IS the save. Collab: peers sync through the Yjs doc, but
      // we still emit the body so the parent can snapshot it to storage (exports
      // and non-live views read that), debounced on its side.
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
      },
      handleClick(view, pos) {
        if (!onCommentClick) return false
        const mark = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'comment')
        const id = mark?.attrs.commentId
        if (typeof id === 'string') onCommentClick(id)
        return false
      }
    }
  })

  const ai = useDocAi(editor)

  // Surface the editor instance to the parent (comments use it). Fire on
  // create + null on teardown; editor identity only changes on remount.
  useEffect(() => {
    onEditorReady?.(editor)
    return () => onEditorReady?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Publish this editor's commands to the global palette (Cmd+K) while it is
  // mounted. Toggles use functional setState so the closures never go stale and
  // the registry only needs to rebuild when the editor instance changes.
  useRegisterEditorCommands(
    'Document',
    () =>
      buildDocCommands(editor, {
        toggleFocus: () => setFocusMode((v) => !v),
        toggleOutline: () => setOutlineOpen((v) => !v),
        togglePageView: () => setPageView((v) => !v),
        setPortrait: () => {
          setOrientation('portrait')
          setPageView(true)
        },
        setLandscape: () => {
          setOrientation('landscape')
          setPageView(true)
        },
        openFind: () => setFindOpen(true),
        draftAi: () => ai.openInsert(),
        rewriteAi: () => ai.openRewrite(),
        insertImage: () => void insertImage(),
        insertTable: () =>
          editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        importDocx: () => void importDocx(),
        exportDocx: () => void exportDocx(),
        exportPdf: () => void exportPdf()
      }),
    [editor]
  )

  // Remember the layout preferences.
  useEffect(() => {
    try {
      localStorage.setItem('fb.doc.pageView', pageView ? '1' : '0')
      localStorage.setItem('fb.doc.orientation', orientation)
      localStorage.setItem('fb.doc.paper', paper)
    } catch {
      /* ignore quota */
    }
  }, [pageView, orientation, paper])

  // In focus mode, Escape leaves it (mirrors the palette's own Esc-to-close).
  useEffect(() => {
    if (!focusMode) return undefined
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setFocusMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusMode])

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

  // Continuous flow keeps its comfortable reading measure; page view hands the
  // sheet its own paper width, so the editor body just renders into whichever
  // container is active. Focus mode always uses the calm continuous flow.
  const showPage = pageView && !focusMode

  return (
    <div className={`relative ${scopeClass} ${focusMode ? 'fb-focus-mode' : ''}`}>
      {/* Named heading styles: one rule per configured level, scoped to this editor. */}
      <style dangerouslySetInnerHTML={{ __html: headingCss(scopeClass, headingStyles) }} />
      <style dangerouslySetInnerHTML={{ __html: FOCUS_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: COMMENT_CSS }} />

      {!focusMode && (
        <div className="max-w-3xl mx-auto px-8 pt-6">
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

          <div className="flex items-center gap-2 mt-2 mb-3 text-[11px] text-stone-500 dark:text-stone-400 flex-wrap">
            <ReadingMeta editor={editor} />

            {/* Continuous vs Page, then orientation + paper when on a page. */}
            <span className="inline-flex rounded-full border border-stone-200 dark:border-stone-700 overflow-hidden" data-testid="doc-layout-toggle">
              <button
                onClick={() => setPageView(false)}
                className={`px-2 py-1 ${!pageView ? 'bg-accent/10 text-accent' : 'hover:bg-stone-100/70 dark:hover:bg-stone-800/50'}`}
                title="Continuous view — one flowing column"
              >
                Continuous
              </button>
              <button
                onClick={() => setPageView(true)}
                className={`px-2 py-1 ${pageView ? 'bg-accent/10 text-accent' : 'hover:bg-stone-100/70 dark:hover:bg-stone-800/50'}`}
                title="Page view — paper sheets with margins"
                data-testid="doc-pageview-btn"
              >
                Page
              </button>
            </span>
            {pageView && (
              <>
                <button
                  onClick={() => setOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'))}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-stone-100/70 dark:hover:bg-stone-800/50 fb-spring-soft"
                  title="Toggle portrait / landscape"
                  data-testid="doc-orientation-btn"
                >
                  <Icon name={orientation === 'portrait' ? 'crop_portrait' : 'crop_landscape'} size={13} />
                  <span>{orientation === 'portrait' ? 'Portrait' : 'Landscape'}</span>
                </button>
                <button
                  onClick={() => setPaper((p) => (p === 'letter' ? 'a4' : 'letter'))}
                  className="px-2 py-1 rounded-full hover:bg-stone-100/70 dark:hover:bg-stone-800/50 fb-spring-soft"
                  title="Paper size"
                  data-testid="doc-paper-btn"
                >
                  {paper === 'a4' ? 'A4' : 'Letter'}
                </button>
              </>
            )}

            <span className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setOutlineOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full fb-spring-soft ${
                  outlineOpen
                    ? 'text-accent bg-accent/10'
                    : 'hover:bg-stone-100/70 dark:hover:bg-stone-800/50'
                }`}
                title="Toggle document outline"
                data-testid="doc-outline-toggle"
              >
                <Icon name="format_list_bulleted" size={13} />
                <span>Outline</span>
              </button>
              <button
                onClick={() => setFocusMode(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-stone-100/70 dark:hover:bg-stone-800/50 fb-spring-soft"
                title="Enter focus mode — dims everything but the line you're writing"
                data-testid="doc-focus-toggle"
              >
                <Icon name="center_focus_strong" size={13} />
                <span>Focus</span>
              </button>
            </span>
          </div>
        </div>
      )}

      {outlineOpen && !focusMode && <DocOutline editor={editor} onClose={() => setOutlineOpen(false)} />}

      {focusMode && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[120] fb-glass-chrome rounded-full border border-[color:var(--glass-chrome-border)] shadow-lg flex items-center gap-2 px-3 py-1.5 text-[11px] text-stone-600 dark:text-stone-300"
          data-testid="doc-focus-bar"
        >
          <Icon name="center_focus_strong" size={13} className="text-accent" />
          <span className="font-medium">Focus</span>
          <span className="w-px h-3 bg-stone-300/60 dark:bg-stone-600/60" />
          <ReadingMeta editor={editor} />
          <button
            onClick={() => setFocusMode(false)}
            className="inline-flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100"
            title="Exit focus mode (Esc)"
          >
            <Icon name="close" size={12} />
            <span>Exit · Esc</span>
          </button>
        </div>
      )}

      <DocBubbleMenu editor={editor} onAiRewrite={ai.openRewrite} />

      {findOpen && <FindReplace editor={editor} onClose={() => setFindOpen(false)} />}

      <div className="max-w-3xl mx-auto px-8">
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
      </div>

      {showPage ? (
        <PageSheet editor={editor} paper={paper} orientation={orientation} />
      ) : (
        <div className="max-w-3xl mx-auto px-8 pb-16">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  )
}

// The page-view surface: the editor body rendered onto a paper-sized sheet with
// real margins and a drop shadow on a soft canvas, with dashed page-break guides
// drawn at each page boundary as the content grows. Portrait/landscape and paper
// size flow straight from the chosen geometry. The breaks are honest guides — the
// text stays one continuous flow underneath rather than being silently split.
function PageSheet({
  editor,
  paper,
  orientation
}: {
  editor: Editor
  paper: Paper
  orientation: Orientation
}): JSX.Element {
  const geom = pageGeometry(paper, orientation)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentH, setContentH] = useState(0)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContentH(el.scrollHeight))
    ro.observe(el)
    setContentH(el.scrollHeight)
    return () => ro.disconnect()
  }, [paper, orientation])

  const usable = geom.h - geom.margin * 2
  const breaks: number[] = []
  for (let y = usable; y < contentH && breaks.length < 400; y += usable) breaks.push(y)

  return (
    <div
      className="flex justify-center py-8 px-4 overflow-x-auto bg-stone-300/40 dark:bg-black/30"
      data-testid="doc-page-canvas"
    >
      <div
        className="relative bg-white dark:bg-stone-900 shadow-xl rounded-[2px]"
        data-testid="doc-page"
        data-orientation={orientation}
        style={{
          width: geom.w,
          minHeight: geom.h,
          paddingTop: geom.margin,
          paddingBottom: geom.margin,
          paddingLeft: geom.margin,
          paddingRight: geom.margin
        }}
      >
        <div ref={contentRef}>
          <EditorContent editor={editor} />
        </div>
        {breaks.map((y, i) => (
          <div
            key={i}
            data-testid="doc-page-break"
            style={{ position: 'absolute', left: 0, right: 0, top: geom.margin + y, pointerEvents: 'none' }}
          >
            <div style={{ borderTop: '1px dashed rgba(120,120,120,0.45)' }} />
            <span
              style={{
                position: 'absolute',
                right: 10,
                top: 3,
                fontSize: 9,
                letterSpacing: '0.04em',
                color: 'rgba(120,120,120,0.75)'
              }}
            >
              Page {i + 2}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Live word count and reading-time estimate. Isolated into its own component so
// it can subscribe to every keystroke without re-rendering the whole editor.
// 220 wpm is a standard silent-reading pace; we show it as a real estimate, not
// a fabricated metric — an empty document reads as empty, not "1 min".
function ReadingMeta({ editor }: { editor: Editor }): JSX.Element {
  const [words, setWords] = useState<number>(() => editor.storage.characterCount?.words?.() ?? 0)
  useEffect(() => {
    const update = (): void => setWords(editor.storage.characterCount?.words?.() ?? 0)
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
    }
  }, [editor])
  const mins = Math.max(1, Math.round(words / 220))
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="doc-reading-meta">
      <Icon name="schedule" size={12} />
      <span>
        {words === 0
          ? 'Empty document'
          : `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${mins} min read`}
      </span>
    </span>
  )
}

interface DocCommandHandlers {
  toggleFocus: () => void
  toggleOutline: () => void
  togglePageView: () => void
  setPortrait: () => void
  setLandscape: () => void
  openFind: () => void
  draftAi: () => void
  rewriteAi: () => void
  insertImage: () => void
  insertTable: () => void
  importDocx: () => void
  exportDocx: () => void
  exportPdf: () => void
}

// The document editor's command catalog, published to the Cmd+K palette. Every
// formatting, structure, insert, view and Office action lives here so a power
// user never has to reach for the toolbar, which is the keyboard-first promise
// Word and Google Docs never delivered.
function buildDocCommands(editor: Editor | null, h: DocCommandHandlers): EditorCommand[] {
  if (!editor) return []
  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()
  return [
    // Format
    { id: 'doc-bold', label: 'Bold', icon: 'format_bold', shortcut: '⌘B', group: 'Format', keywords: 'strong', run: () => chain().toggleBold().run() },
    { id: 'doc-italic', label: 'Italic', icon: 'format_italic', shortcut: '⌘I', group: 'Format', keywords: 'emphasis', run: () => chain().toggleItalic().run() },
    { id: 'doc-underline', label: 'Underline', icon: 'format_underlined', shortcut: '⌘U', group: 'Format', run: () => chain().toggleUnderline().run() },
    { id: 'doc-strike', label: 'Strikethrough', icon: 'strikethrough_s', group: 'Format', keywords: 'cross out', run: () => chain().toggleStrike().run() },
    { id: 'doc-code', label: 'Inline code', icon: 'code', group: 'Format', keywords: 'monospace', run: () => chain().toggleCode().run() },
    { id: 'doc-highlight', label: 'Highlight', icon: 'ink_highlighter', group: 'Format', keywords: 'mark', run: () => chain().toggleHighlight().run() },
    { id: 'doc-clear-format', label: 'Clear formatting', icon: 'format_clear', group: 'Format', keywords: 'remove strip reset marks', run: () => chain().unsetAllMarks().clearNodes().run() },
    // Structure
    { id: 'doc-h1', label: 'Heading 1', icon: 'title', group: 'Style', keywords: 'title big', run: () => chain().toggleHeading({ level: 1 }).run() },
    { id: 'doc-h2', label: 'Heading 2', icon: 'title', group: 'Style', keywords: 'subheading', run: () => chain().toggleHeading({ level: 2 }).run() },
    { id: 'doc-h3', label: 'Heading 3', icon: 'title', group: 'Style', keywords: 'subheading', run: () => chain().toggleHeading({ level: 3 }).run() },
    { id: 'doc-paragraph', label: 'Body text', icon: 'notes', group: 'Style', keywords: 'normal paragraph', run: () => chain().setParagraph().run() },
    { id: 'doc-bullets', label: 'Bulleted list', icon: 'format_list_bulleted', group: 'Style', keywords: 'unordered', run: () => chain().toggleBulletList().run() },
    { id: 'doc-numbers', label: 'Numbered list', icon: 'format_list_numbered', group: 'Style', keywords: 'ordered', run: () => chain().toggleOrderedList().run() },
    { id: 'doc-checklist', label: 'Checklist', icon: 'checklist', group: 'Style', keywords: 'task todo', run: () => chain().toggleTaskList().run() },
    { id: 'doc-quote', label: 'Quote block', icon: 'format_quote', group: 'Style', keywords: 'blockquote', run: () => chain().toggleBlockquote().run() },
    { id: 'doc-codeblock', label: 'Code block', icon: 'data_object', group: 'Style', keywords: 'snippet syntax', run: () => chain().toggleCodeBlock().run() },
    { id: 'doc-divider', label: 'Divider', icon: 'horizontal_rule', group: 'Style', keywords: 'horizontal rule separator', run: () => chain().setHorizontalRule().run() },
    // Align
    { id: 'doc-align-left', label: 'Align left', icon: 'format_align_left', group: 'Align', run: () => chain().setTextAlign('left').run() },
    { id: 'doc-align-center', label: 'Align centre', icon: 'format_align_center', group: 'Align', keywords: 'center', run: () => chain().setTextAlign('center').run() },
    { id: 'doc-align-right', label: 'Align right', icon: 'format_align_right', group: 'Align', run: () => chain().setTextAlign('right').run() },
    { id: 'doc-align-justify', label: 'Justify', icon: 'format_align_justify', group: 'Align', run: () => chain().setTextAlign('justify').run() },
    // Insert
    { id: 'doc-insert-image', label: 'Insert image', icon: 'image', group: 'Insert', keywords: 'picture photo', run: h.insertImage },
    { id: 'doc-insert-table', label: 'Insert table', icon: 'table_chart', group: 'Insert', keywords: 'grid', run: h.insertTable },
    // Find
    { id: 'doc-find', label: 'Find and replace', icon: 'search', shortcut: '⌘F', group: 'Edit', keywords: 'search replace', run: h.openFind },
    // AI
    { id: 'doc-ai-draft', label: 'Draft with AI', icon: 'auto_awesome', group: 'AI', keywords: 'generate write', run: h.draftAi },
    { id: 'doc-ai-rewrite', label: 'Rewrite selection with AI', icon: 'auto_fix_high', group: 'AI', keywords: 'improve tone', run: h.rewriteAi },
    // View
    { id: 'doc-focus', label: 'Toggle focus mode', icon: 'center_focus_strong', group: 'View', keywords: 'zen distraction free writing', run: h.toggleFocus },
    { id: 'doc-outline', label: 'Toggle outline', icon: 'format_list_bulleted', group: 'View', keywords: 'navigation headings map', run: h.toggleOutline },
    { id: 'doc-pageview', label: 'Toggle page view', icon: 'description', group: 'View', keywords: 'page continuous print layout paper', run: h.togglePageView },
    { id: 'doc-portrait', label: 'Page orientation: portrait', icon: 'crop_portrait', group: 'View', keywords: 'orientation vertical tall', run: h.setPortrait },
    { id: 'doc-landscape', label: 'Page orientation: landscape', icon: 'crop_landscape', group: 'View', keywords: 'orientation horizontal wide', run: h.setLandscape },
    // Office
    { id: 'doc-import-docx', label: 'Import Word (.docx)', icon: 'upload_file', group: 'File', keywords: 'open word', run: h.importDocx },
    { id: 'doc-export-docx', label: 'Export Word (.docx)', icon: 'description', group: 'File', keywords: 'save word', run: h.exportDocx },
    { id: 'doc-export-pdf', label: 'Export PDF', icon: 'picture_as_pdf', group: 'File', keywords: 'save pdf', run: h.exportPdf }
  ]
}
