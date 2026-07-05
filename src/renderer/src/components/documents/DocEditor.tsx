import { useEffect, useId, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { buildDocExtensions } from './editor/extensions'
import { htmlToDocContent } from '../../lib/docHtml'
import { sanitizeHtml } from '../../lib/htmlSanitize'
import {
  parseDocBody,
  wrapDocBody,
  headingCss,
  MARGIN_PRESETS,
  type HeadingStyle,
  type HeadingStyles,
  type PageSetup,
  type PageMargins,
  type PageHeaderFooter
} from './editor/headingStyles'
import Toolbar from './editor/Toolbar'
import DocMenuBar from './editor/DocMenuBar'
import { setPaginationConfig } from './editor/pagination'
import DocBubbleMenu from './editor/DocBubbleMenu'
import FindReplace from './editor/FindReplace'
import DocSidePanel, { type DocSidePanelTab, type PanelCommentThread } from './editor/DocSidePanel'
import { useDocAi } from './editor/useDocAi'
import { useRegisterEditorCommands, type EditorCommand } from '../../stores/editorCommands'
import type { Doc as YDoc } from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import Icon from '../Icon'
import WidgetPickerDialog from './embed/WidgetPickerDialog'

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

// Page geometry at 96dpi (the CSS reference), so a Letter portrait sheet is the
// familiar 816x1056, A4 is 794x1123, and landscape swaps the long and short
// edges. Margins come from the document's own page setup (per side, in inches),
// so what the writer sets is what the sheet and the exports show. This is what
// makes the page-view sheet look like real paper and gives portrait/landscape a
// true effect rather than a cosmetic one.
function pageGeometry(page: PageSetup): {
  w: number
  h: number
  mTop: number
  mRight: number
  mBottom: number
  mLeft: number
} {
  const DPI = 96
  const base = page.size === 'a4' ? { w: 8.27 * DPI, h: 11.69 * DPI } : { w: 8.5 * DPI, h: 11 * DPI }
  const portrait = page.orientation === 'portrait'
  return {
    w: Math.round(portrait ? base.w : base.h),
    h: Math.round(portrait ? base.h : base.w),
    mTop: Math.round(page.margin.top * DPI),
    mRight: Math.round(page.margin.right * DPI),
    mBottom: Math.round(page.margin.bottom * DPI),
    mLeft: Math.round(page.margin.left * DPI)
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
  // The real comment threads for the Comments tab of the side panel. The parent
  // owns the data and the handlers; when it has no comment backend it passes an
  // empty list and leaves the handlers off, and the panel shows an honest empty
  // state. Never fabricate threads here.
  comments?: PanelCommentThread[]
  canComment?: boolean
  onAddComment?: () => void
  onReplyComment?: (threadId: string, body: string) => void
  onJumpComment?: (threadId: string) => void
  // The name to greet the writer with in the AI Assistant tab. Omit when the user
  // is not signed in; the panel falls back to a neutral greeting.
  userName?: string | null
}

const REWRITE_ACTIONS = [
  'Improve writing',
  'Make it more concise',
  'Fix spelling and grammar',
  'Make the tone more formal',
  'Turn this into a bulleted list',
  'Turn this into a table'
]

export default function DocEditor({
  content,
  title,
  onChange,
  ydoc,
  awareness,
  user,
  onEditorReady,
  onCommentClick,
  comments = [],
  canComment = false,
  onAddComment,
  onReplyComment,
  onJumpComment,
  userName
}: Props): JSX.Element {
  const [findOpen, setFindOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  // The persistent right-side panel: open/collapsed plus the active tab. The old
  // floating-outline toggle now drives this panel's Outline tab instead.
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<DocSidePanelTab>('ai')
  // Page vs continuous layout is a personal viewing preference (remembered across
  // sessions). Paper size, orientation and margins are part of the document and
  // travel with it, so they live on the body, not in localStorage.
  const [pageView, setPageView] = useState<boolean>(() => readPref('fb.doc.pageView', ['0', '1'] as const, '0') === '1')
  const [showMargins, setShowMargins] = useState(false)
  const [showHeaderFooter, setShowHeaderFooter] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [busyOffice, setBusyOffice] = useState<string | null>(null)
  const [officeMsg, setOfficeMsg] = useState<string | null>(null)
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false)

  // Parse the (possibly legacy) body once into the Tiptap doc + named heading
  // styles + page setup. The body is persisted wrapped as { doc, headingStyles,
  // page } so all three survive save/reopen; legacy raw-Tiptap bodies still open.
  const initial = parseDocBody(content)
  const [headingStyles, setHeadingStyles] = useState<HeadingStyles>(initial.headingStyles)
  const [page, setPage] = useState<PageSetup>(initial.page)
  // The editor's onUpdate closure is created once at mount, so reading state
  // there would save stale heading styles / page setup over a fresh edit. This
  // ref always holds the current values; every save reads from it.
  const metaRef = useRef<{ headingStyles: HeadingStyles; page: PageSetup }>({
    headingStyles: initial.headingStyles,
    page: initial.page
  })
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
      // and non-live views read that), debounced on its side. Read meta from the
      // ref so a save never reverts a just-changed heading style or page setup.
      onChange(wrapDocBody(editor.getJSON(), metaRef.current.headingStyles, metaRef.current.page))
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
        toggleOutline: () => {
          setPanelTab('outline')
          setPanelOpen(true)
        },
        togglePageView: () => setPageView((v) => !v),
        setPortrait: () => {
          updatePageSetup({ orientation: 'portrait' })
          setPageView(true)
        },
        setLandscape: () => {
          updatePageSetup({ orientation: 'landscape' })
          setPageView(true)
        },
        openFind: () => setFindOpen(true),
        draftAi: () => ai.openInsert(),
        rewriteAi: () => ai.openRewrite(),
        insertImage: () => void insertImage(),
        insertTable: () =>
          editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        insertWidget: () => setWidgetPickerOpen(true),
        importDocx: () => void importDocx(),
        exportDocx: () => void exportDocx(),
        exportPdf: () => void exportPdf()
      }),
    [editor]
  )

  // Remember the page-vs-continuous viewing preference (a personal one).
  useEffect(() => {
    try {
      localStorage.setItem('fb.doc.pageView', pageView ? '1' : '0')
    } catch {
      /* ignore quota */
    }
  }, [pageView])

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
      metaRef.current.headingStyles = next
      onChange(wrapDocBody(editor?.getJSON() ?? initial.doc, next, metaRef.current.page))
      return next
    })
  }

  // Update the page setup (size, orientation, margins) and persist it on the body
  // so the sheet and the exports both follow it.
  function updatePageSetup(patch: Partial<PageSetup>): void {
    setPage((prev) => {
      const next: PageSetup = { ...prev, ...patch, margin: { ...prev.margin, ...(patch.margin ?? {}) } }
      metaRef.current.page = next
      onChange(wrapDocBody(editor?.getJSON() ?? initial.doc, metaRef.current.headingStyles, next))
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
      const res = await window.api.office.exportDocx({ html: editor.getHTML(), title, page })
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
      const res = await window.api.office.exportPdf({ html: editor.getHTML(), title, page })
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

  // The persistent right panel sits next to the writing column in a flex row. It
  // is never shown in focus mode, which keeps its calm single-column feel.
  const showPanel = panelOpen && !focusMode

  return (
    <div className={`relative flex h-full ${scopeClass} ${focusMode ? 'fb-focus-mode' : ''}`}>
      {/* Named heading styles: one rule per configured level, scoped to this editor. */}
      <style dangerouslySetInnerHTML={{ __html: headingCss(scopeClass, headingStyles) }} />
      <style dangerouslySetInnerHTML={{ __html: FOCUS_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: COMMENT_CSS }} />

      <div className="relative flex-1 min-w-0 overflow-auto">
      {!focusMode && (
        <div className="max-w-3xl mx-auto px-8 pt-6">
          {/* Google-Docs-style menu bar sits above the formatting toolbar. Every
              item is wired to a real editor command, store action or export. */}
          <div className="mb-1.5 pb-1.5 border-b border-[var(--edge-soft)]">
            <DocMenuBar
              editor={editor}
              title={title}
              onInsertImage={() => void insertImage()}
              onInsertWidget={() => setWidgetPickerOpen(true)}
              onExportDocx={() => void exportDocx()}
              onExportPdf={() => void exportPdf()}
              onFind={() => setFindOpen(true)}
              onFocusMode={() => setFocusMode(true)}
              pageView={pageView}
              onSetPageView={setPageView}
              onOutline={() => {
                setPanelTab('outline')
                setPanelOpen(true)
              }}
              onComments={() => {
                setPanelTab('comments')
                setPanelOpen(true)
              }}
            />
          </div>
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

          <div className="flex items-center gap-2 mt-2 mb-3 text-[11px] text-[var(--ink-50)] flex-wrap">
            <ReadingMeta editor={editor} />

            {/* Continuous vs Page, then orientation + paper when on a page. */}
            <span className="inline-flex rounded-full border border-[var(--edge-soft)] overflow-hidden" data-testid="doc-layout-toggle">
              <button
                onClick={() => setPageView(false)}
                className={`px-2 py-1 ${!pageView ? 'bg-accent/10 text-accent' : 'hover:bg-[var(--surface-sunken)]/70'}`}
                title="Continuous view — one flowing column"
              >
                Continuous
              </button>
              <button
                onClick={() => setPageView(true)}
                className={`px-2 py-1 ${pageView ? 'bg-accent/10 text-accent' : 'hover:bg-[var(--surface-sunken)]/70'}`}
                title="Page view — paper sheets with margins"
                data-testid="doc-pageview-btn"
              >
                Page
              </button>
            </span>
            {pageView && (
              <>
                <button
                  onClick={() => updatePageSetup({ orientation: page.orientation === 'portrait' ? 'landscape' : 'portrait' })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--surface-sunken)]/70 fb-spring-soft"
                  title="Toggle portrait / landscape"
                  data-testid="doc-orientation-btn"
                >
                  <Icon name={page.orientation === 'portrait' ? 'crop_portrait' : 'crop_landscape'} size={13} />
                  <span>{page.orientation === 'portrait' ? 'Portrait' : 'Landscape'}</span>
                </button>
                <button
                  onClick={() => updatePageSetup({ size: page.size === 'letter' ? 'a4' : 'letter' })}
                  className="px-2 py-1 rounded-full hover:bg-[var(--surface-sunken)]/70 fb-spring-soft"
                  title="Paper size"
                  data-testid="doc-paper-btn"
                >
                  {page.size === 'a4' ? 'A4' : 'Letter'}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowMargins((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--surface-sunken)]/70 fb-spring-soft"
                    title="Page margins"
                    data-testid="doc-margins-btn"
                  >
                    <Icon name="margin" size={13} />
                    <span>Margins</span>
                  </button>
                  {showMargins && (
                    <MarginMenu margin={page.margin} onPick={(m) => updatePageSetup({ margin: m })} onClose={() => setShowMargins(false)} />
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowHeaderFooter((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--surface-sunken)]/70 fb-spring-soft"
                    title="Header & footer"
                    data-testid="doc-headerfooter-btn"
                  >
                    <Icon name="web_asset" size={13} />
                    <span>Header/Footer</span>
                  </button>
                  {showHeaderFooter && (
                    <HeaderFooterMenu
                      header={page.header}
                      footer={page.footer}
                      onChange={(patch) => updatePageSetup(patch)}
                      onClose={() => setShowHeaderFooter(false)}
                    />
                  )}
                </div>
              </>
            )}

            <span className="ml-auto flex items-center gap-1">
              <button
                onClick={() => {
                  // Toggle: collapse the panel if its Outline tab is already
                  // showing, otherwise open the panel on that tab.
                  if (panelOpen && panelTab === 'outline') setPanelOpen(false)
                  else {
                    setPanelTab('outline')
                    setPanelOpen(true)
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full fb-spring-soft ${
                  panelOpen && panelTab === 'outline'
                    ? 'text-accent bg-accent/10'
                    : 'hover:bg-[var(--surface-sunken)]/70'
                }`}
                title="Show the document outline"
                data-testid="doc-outline-toggle"
              >
                <Icon name="format_list_bulleted" size={13} />
                <span>Outline</span>
              </button>
              <button
                onClick={() => {
                  if (panelOpen && panelTab === 'comments') setPanelOpen(false)
                  else {
                    setPanelTab('comments')
                    setPanelOpen(true)
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full fb-spring-soft ${
                  panelOpen && panelTab === 'comments'
                    ? 'text-accent bg-accent/10'
                    : 'hover:bg-[var(--surface-sunken)]/70'
                }`}
                title="Show comments"
                data-testid="doc-comments-toggle"
              >
                <Icon name="comment" size={13} />
                <span>Comments</span>
              </button>
              <button
                onClick={() => {
                  if (panelOpen && panelTab === 'ai') setPanelOpen(false)
                  else {
                    setPanelTab('ai')
                    setPanelOpen(true)
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full fb-spring-soft ${
                  panelOpen && panelTab === 'ai'
                    ? 'text-accent bg-accent/10'
                    : 'hover:bg-[var(--surface-sunken)]/70'
                }`}
                title="Show the AI assistant"
                data-testid="doc-assistant-toggle"
              >
                <Icon name="auto_awesome" size={13} />
                <span>Assistant</span>
              </button>
              <button
                onClick={() => setFocusMode(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--surface-sunken)]/70 fb-spring-soft"
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

      {focusMode && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[120] fb-glass-chrome rounded-full border border-[color:var(--glass-chrome-border)] shadow-lg flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--ink-70)]"
          data-testid="doc-focus-bar"
        >
          <Icon name="center_focus_strong" size={13} className="text-accent" />
          <span className="font-medium">Focus</span>
          <span className="w-px h-3 bg-[var(--edge-firm)]/60" />
          <ReadingMeta editor={editor} />
          <button
            onClick={() => setFocusMode(false)}
            className="inline-flex items-center gap-1 hover:text-[var(--ink-100)]"
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
        <div className="mb-3 text-[12px] text-[var(--ink-50)] flex items-center gap-1.5" data-testid="doc-office-status">
          {busyOffice && <Icon name="autorenew" size={13} className="animate-spin" />}
          <span>{busyOffice ?? officeMsg}</span>
          {officeMsg && !busyOffice && (
            <button onClick={() => setOfficeMsg(null)} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]">
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
                  className="text-[11px] px-2 py-1 rounded-full border border-[var(--edge-firm)] hover:bg-accent/10 hover:border-accent disabled:opacity-50"
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
            className="w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
          />

          {ai.error && <div className="text-[12px] text-red-600 dark:text-red-400 mt-1">{ai.error}</div>}

          {ai.previewHtml != null && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-40)] mb-1">Preview</div>
              <div
                className="prose prose-sm prose-stone dark:prose-invert max-w-none max-h-60 overflow-auto rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-base)] p-3"
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
                  className="text-[12px] px-3 py-1.5 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]"
                >
                  Regenerate
                </button>
              </>
            )}
            <span className="text-[11px] text-[var(--ink-40)]">Previewed before it touches the document. Cmd+Enter</span>
          </div>
        </div>
      )}
      </div>

      {showPage ? (
        <PageSheet editor={editor} page={page} />
      ) : (
        <div className="max-w-3xl mx-auto px-8 pb-16">
          <EditorContent editor={editor} />
        </div>
      )}

      {/* Collapsed: a slim tab on the right edge to bring the panel back. */}
      {!showPanel && !focusMode && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-3 right-3 z-[55] inline-flex items-center gap-1 rounded-full border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] text-[var(--ink-70)] hover:text-[rgb(var(--accent))] hover:border-[rgb(var(--accent)/0.5)] shadow-sm"
          title="Show the assistant panel"
          data-testid="doc-side-panel-expand"
        >
          <Icon name="chevron_left" size={14} />
          <span>Assistant</span>
        </button>
      )}
      </div>

      {widgetPickerOpen && (
        <WidgetPickerDialog
          onPick={(widgetId) => {
            setWidgetPickerOpen(false)
            editor.chain().focus().insertWidgetEmbed(widgetId).run()
          }}
          onClose={() => setWidgetPickerOpen(false)}
        />
      )}

      {showPanel && (
        <DocSidePanel
          editor={editor}
          ai={ai}
          userName={userName}
          tab={panelTab}
          onTab={setPanelTab}
          onCollapse={() => setPanelOpen(false)}
          comments={comments}
          canComment={canComment}
          onAddComment={onAddComment}
          onReply={onReplyComment}
          onJumpComment={onJumpComment}
        />
      )}
    </div>
  )
}

// The page-margins menu: the named presets Word offers plus a custom editor for
// the four sides (in inches). Picking a preset or editing a side updates the
// Header & footer editor popover. Writes header/footer straight onto the page
// setup, so the running header/footer on every sheet and the .docx export follow.
function HeaderFooterMenu({
  header,
  footer,
  onChange,
  onClose
}: {
  header?: PageHeaderFooter
  footer?: PageHeaderFooter
  onChange: (patch: Partial<PageSetup>) => void
  onClose: () => void
}): JSX.Element {
  const inputCls =
    'w-full bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent'
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute left-0 mt-1.5 z-40 w-64 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg p-2.5 text-[var(--ink-70)] space-y-2.5"
        data-testid="doc-headerfooter-menu"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-40)] mb-1">Header</p>
          <input
            className={inputCls}
            data-testid="doc-header-input"
            placeholder="Header text"
            value={header?.text ?? ''}
            onChange={(e) => onChange({ header: { ...header, text: e.target.value } })}
          />
          <label className="flex items-center gap-1.5 mt-1 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              data-testid="doc-header-pageno"
              checked={!!header?.showPageNumber}
              onChange={(e) => onChange({ header: { ...header, showPageNumber: e.target.checked } })}
            />
            Show page number
          </label>
        </div>
        <div className="pt-1.5 border-t border-[var(--edge-soft)]">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-40)] mb-1">Footer</p>
          <input
            className={inputCls}
            data-testid="doc-footer-input"
            placeholder="Footer text"
            value={footer?.text ?? ''}
            onChange={(e) => onChange({ footer: { ...footer, text: e.target.value } })}
          />
          <label className="flex items-center gap-1.5 mt-1 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              data-testid="doc-footer-pageno"
              checked={!!footer?.showPageNumber}
              onChange={(e) => onChange({ footer: { ...footer, showPageNumber: e.target.checked } })}
            />
            Show page number
          </label>
        </div>
      </div>
    </>
  )
}

// document's page setup, so the sheet and the exports follow immediately.
function MarginMenu({
  margin,
  onPick,
  onClose
}: {
  margin: PageMargins
  onPick: (m: PageMargins) => void
  onClose: () => void
}): JSX.Element {
  const sides: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'right', label: 'Right' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' }
  ]
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute left-0 mt-1.5 z-40 w-56 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg p-2 text-[var(--ink-70)]"
        data-testid="doc-margins-menu"
      >
        {MARGIN_PRESETS.map((p) => {
          const active = p.margin.top === margin.top && p.margin.right === margin.right && p.margin.bottom === margin.bottom && p.margin.left === margin.left
          return (
            <button
              key={p.id}
              onClick={() => onPick({ ...p.margin })}
              data-testid={`doc-margin-preset-${p.id}`}
              className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] ${active ? 'bg-accent/10 text-accent' : 'hover:bg-[var(--surface-sunken)]'}`}
            >
              {p.label}
            </button>
          )
        })}
        <div className="mt-1.5 pt-1.5 border-t border-[var(--edge-soft)]">
          <p className="px-2 text-[10px] uppercase tracking-[0.1em] text-[var(--ink-40)] mb-1">Custom (inches)</p>
          <div className="grid grid-cols-2 gap-1.5 px-1">
            {sides.map((s) => (
              <label key={s.key} className="flex items-center gap-1 text-[11px]">
                <span className="w-12 text-[var(--ink-50)]">{s.label}</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  step={0.05}
                  value={margin[s.key]}
                  data-testid={`doc-margin-${s.key}`}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) onPick({ ...margin, [s.key]: Math.max(0, Math.min(4, v)) })
                  }}
                  className="w-full rounded border border-[var(--edge-firm)] bg-transparent px-1.5 py-0.5"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// The gap drawn between two sheets in page view. The pagination plugin pushes
// content onto the next sheet with a transparent spacer of matching height, so
// this is a genuine gap between discrete pages, not a line through one long sheet.
const PAGE_GAP = 28

// The page-view surface: content laid out onto discrete paper-sized sheets, each
// at the document's real paper size, orientation and margins, separated by a true
// gap. The pagination extension measures the blocks and inserts spacers so a block
// never straddles a page edge; this component draws one white sheet per page under
// the flowing content and lets the grey canvas show through the gaps.
function PageSheet({ editor, page }: { editor: Editor; page: PageSetup }): JSX.Element {
  const geom = pageGeometry(page)
  const usable = Math.max(1, geom.h - geom.mTop - geom.mBottom)
  const [pageCount, setPageCount] = useState(1)

  // Feed the live page metrics to the pagination plugin while this sheet is
  // mounted, and switch pagination off again when we leave page view.
  useEffect(() => {
    setPaginationConfig({
      enabled: true,
      pageContentPx: usable,
      gapPx: PAGE_GAP,
      mTop: geom.mTop,
      mBottom: geom.mBottom,
      onPages: setPageCount
    })
    return () => setPaginationConfig({ enabled: false, onPages: null })
  }, [usable, geom.mTop, geom.mBottom])

  const stride = geom.h + PAGE_GAP
  const totalH = pageCount * geom.h + (pageCount - 1) * PAGE_GAP

  return (
    <div
      className="flex justify-center py-8 px-4 overflow-x-auto bg-stone-300/50 dark:bg-black/40"
      data-testid="doc-page-canvas"
    >
      <div className="relative" data-testid="doc-page" data-orientation={page.orientation} data-pages={pageCount} style={{ width: geom.w, minHeight: totalH }}>
        {/* One white sheet per page, each the real paper height, stacked with the
            gap between them so the grey canvas shows through as a true page split. */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              data-testid="doc-page-sheet"
              className="absolute left-0 right-0 bg-white dark:bg-stone-900 shadow-xl rounded-[2px]"
              style={{ top: i * stride, height: geom.h }}
            />
          ))}
          {/* A small page number in each gap. */}
          {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, i) => (
            <span
              key={i}
              data-testid="doc-page-break"
              className="absolute right-2 text-[var(--ink-50)] fb-tabular"
              style={{ top: (i + 1) * stride - PAGE_GAP + Math.round((PAGE_GAP - 10) / 2), fontSize: 9, letterSpacing: '0.04em' }}
            >
              Page {i + 2}
            </span>
          ))}
          {/* Running header + footer in the top/bottom margin of every page. */}
          {(page.header?.text || page.header?.showPageNumber || page.footer?.text || page.footer?.showPageNumber) &&
            Array.from({ length: pageCount }).map((_, i) => (
              <div key={`hf-${i}`} data-testid={`doc-hf-${i}`}>
                {(page.header?.text || page.header?.showPageNumber) && (
                  <div
                    data-testid="doc-header"
                    className="absolute flex items-center text-[var(--ink-50)]"
                    style={{
                      top: i * stride + Math.max(6, geom.mTop / 2 - 7),
                      left: geom.mLeft,
                      width: geom.w - geom.mLeft - geom.mRight,
                      height: 14,
                      fontSize: 11
                    }}
                  >
                    <span className="flex-1 text-center truncate">{page.header?.text ?? ''}</span>
                    {page.header?.showPageNumber && <span className="fb-tabular pl-2">Page {i + 1}</span>}
                  </div>
                )}
                {(page.footer?.text || page.footer?.showPageNumber) && (
                  <div
                    data-testid="doc-footer"
                    className="absolute flex items-center text-[var(--ink-50)]"
                    style={{
                      top: i * stride + geom.h - Math.max(20, geom.mBottom / 2 + 7),
                      left: geom.mLeft,
                      width: geom.w - geom.mLeft - geom.mRight,
                      height: 14,
                      fontSize: 11
                    }}
                  >
                    <span className="flex-1 text-center truncate">{page.footer?.text ?? ''}</span>
                    {page.footer?.showPageNumber && <span className="fb-tabular pl-2">Page {i + 1}</span>}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* The flowing content sits on top of the sheets; the plugin's spacers
            create the real gaps that align it to each sheet. */}
        <div
          className="relative"
          data-testid="doc-page-content"
          style={{
            paddingTop: geom.mTop,
            paddingBottom: geom.mBottom,
            paddingLeft: geom.mLeft,
            paddingRight: geom.mRight
          }}
        >
          <EditorContent editor={editor} />
        </div>
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
  insertWidget: () => void
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
    { id: 'doc-insert-widget', label: 'Insert widget from a desk', icon: 'widgets', group: 'Insert', keywords: 'embed desk canvas', run: h.insertWidget },
    // Find
    { id: 'doc-find', label: 'Find and replace', icon: 'search', shortcut: '⌘F', group: 'Edit', keywords: 'search replace', run: h.openFind },
    // AI
    { id: 'doc-ai-draft', label: 'Draft with AI', icon: 'auto_awesome', group: 'AI', keywords: 'generate write', run: h.draftAi },
    { id: 'doc-ai-rewrite', label: 'Rewrite selection with AI', icon: 'auto_awesome', group: 'AI', keywords: 'improve tone', run: h.rewriteAi },
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
