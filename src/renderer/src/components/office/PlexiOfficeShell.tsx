import { useEffect, useMemo, useState } from 'react'
import { useDocumentsStore } from '../../stores/documents'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { CHANGELOG } from '../../lib/changelog'
import { promptUpgrade } from '../../stores/upgradePrompt'
import DocumentEditorView from '../views/DocumentEditorView'
import Icon from '../Icon'
import type { DocType, DocumentMeta } from '@shared/types'

// PlexiOffice — the office segment of the system. Its own full-bleed shell with a
// dedicated sidemenu: the place to create Docs, Sheets, Slides, Drawings and
// Designs, and to send documents for signature (PlexiSign) with an audit trail.
// Document-type apps open inline so the office sidebar stays put; Sign and Forms
// route to their own modules.

type OfficePage = 'home' | 'recent' | 'starred' | 'shared' | 'templates' | 'trash'

interface OfficeApp {
  key: string
  label: string
  blurb: string
  icon: string
  // Tailwind classes for the colored icon tile.
  tint: string
  // Document type to create inline, or null when the app routes elsewhere.
  docType: DocType | null
}

const APPS: OfficeApp[] = [
  { key: 'docs', label: 'PlexiDocs', blurb: 'Create documents', icon: 'description', tint: 'bg-sky-500', docType: 'doc' },
  { key: 'sheets', label: 'PlexiSheets', blurb: 'Create spreadsheets', icon: 'table_chart', tint: 'bg-emerald-500', docType: 'sheet' },
  { key: 'slides', label: 'PlexiSlides', blurb: 'Create presentations', icon: 'slideshow', tint: 'bg-orange-500', docType: 'slides' },
  { key: 'draw', label: 'PlexiDraw', blurb: 'Create drawings', icon: 'gesture', tint: 'bg-violet-500', docType: 'map' },
  { key: 'design', label: 'PlexiDesign', blurb: 'Designs, any size', icon: 'palette', tint: 'bg-fuchsia-500', docType: 'design' },
  { key: 'sign', label: 'PlexiSign', blurb: 'Send & sign documents', icon: 'draw', tint: 'bg-teal-500', docType: null }
]

const TYPE_ICON: Record<string, { icon: string; tint: string }> = {
  doc: { icon: 'description', tint: 'text-sky-500' },
  sheet: { icon: 'table_chart', tint: 'text-emerald-500' },
  slides: { icon: 'slideshow', tint: 'text-orange-500' },
  map: { icon: 'gesture', tint: 'text-violet-500' },
  design: { icon: 'palette', tint: 'text-fuchsia-500' }
}

const PRO_FEATURES = ['Advanced collaboration', 'Premium templates', 'AI productivity tools', 'Priority support']

const STAR_KEY = 'fb.office.starred'

function relTime(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const hrs = Math.round(m / 60)
  if (hrs < 24) return `${hrs}h ago`
  const d = Math.round(hrs / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PlexiOfficeShell(): JSX.Element {
  const list = useDocumentsStore((s) => s.list)
  const refresh = useDocumentsStore((s) => s.refresh)
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const remove = useDocumentsStore((s) => s.remove)
  const goHome = useViewStore((s) => s.goHome)
  const goSign = useViewStore((s) => s.goSign)
  const account = useAccountStore((s) => s.account)

  const [page, setPage] = useState<OfficePage>('home')
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | DocType>('all')
  const [busy, setBusy] = useState(false)
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STAR_KEY) || '[]'))
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    void refresh()
  }, [refresh])

  const officeDocs = useMemo(
    () => list.filter((d) => ['doc', 'sheet', 'slides', 'map', 'design'].includes(d.docType)).sort((a, b) => b.updatedAt - a.updatedAt),
    [list]
  )
  const ownerName = account?.handle || 'You'

  function toggleStar(id: string): void {
    setStarred((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(STAR_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function launch(app: OfficeApp): Promise<void> {
    if (app.docType === null) {
      if (app.key === 'sign') goSign()
      return
    }
    if (busy) return
    setBusy(true)
    try {
      const doc = await createBlank(app.docType, app.label.replace('Plexi', '') + ' draft')
      await refresh()
      setOpenDocId(doc.id)
    } finally {
      setBusy(false)
    }
  }

  async function createType(docType: DocType, title: string): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const doc = await createBlank(docType, title)
      await refresh()
      setOpenDocId(doc.id)
    } finally {
      setBusy(false)
    }
  }

  // An open document takes over the content area; the office sidebar stays.
  if (openDocId) {
    return (
      <div className="h-full flex bg-[var(--surface-base)]">
        <OfficeSidebar page={page} onPage={(p) => { setOpenDocId(null); setPage(p) }} onLaunch={(a) => void launch(a)} onExit={goHome} starredCount={starred.size} />
        <div className="flex-1 min-w-0">
          <DocumentEditorView documentId={openDocId} onBack={() => { setOpenDocId(null); void refresh() }} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-[var(--surface-base)] text-[var(--ink-100)]">
      <OfficeSidebar page={page} onPage={setPage} onLaunch={(a) => void launch(a)} onExit={goHome} starredCount={starred.size} />

      <div className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold">PlexiOffice {pageTitle(page)}</h1>
              <p className="text-[13px] text-[var(--ink-50)]">Create, collaborate and get more done with PlexiOffice.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => void createType('doc', 'Untitled document')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[13px] font-medium hover:bg-[rgb(var(--accent-hover))]"
                data-testid="office-create"
              >
                <Icon name="add" size={16} /> Create
              </button>
            </div>
          </div>

          {/* App tiles */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-6">
            {APPS.map((a) => (
              <button
                key={a.key}
                onClick={() => void launch(a)}
                data-testid={`office-app-${a.key}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-3.5 hover:border-[rgb(var(--accent)/0.5)] hover:shadow-sm transition"
              >
                <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-white ${a.tint}`}>
                  <Icon name={a.icon} size={22} />
                </span>
                <span className="text-[12.5px] font-medium">{a.label}</span>
                <span className="text-[10.5px] text-[var(--ink-50)] text-center leading-tight">{a.blurb}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-5">
            {/* Main column */}
            <div className="flex-1 min-w-0 space-y-5">
              {/* Templates */}
              <section className="rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[15px] font-semibold">Start with a template</h2>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(['all', 'doc', 'sheet', 'slides', 'map', 'design'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-2.5 py-1 rounded-full text-[12px] ${tab === t ? 'bg-[rgb(var(--accent))] text-white' : 'border border-[var(--edge-soft)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'}`}
                    >
                      {tabLabel(t)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {TEMPLATES.filter((tp) => tab === 'all' || tp.docType === tab).map((tp) => (
                    <button
                      key={tp.id}
                      onClick={() => void createType(tp.docType, tp.label)}
                      data-testid={`office-template-${tp.id}`}
                      className="group text-left rounded-xl border border-[var(--edge-soft)] overflow-hidden hover:border-[rgb(var(--accent)/0.5)] transition"
                    >
                      <div className={`h-24 ${tp.preview} flex items-center justify-center`}>
                        <Icon name={TYPE_ICON[tp.docType]?.icon ?? 'description'} size={26} className="text-white/90" />
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="text-[12px] font-medium truncate">{tp.label}</div>
                        <div className="text-[10.5px] text-[var(--ink-50)]">{appLabel(tp.docType)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Recent files — real documents, honest empty state. */}
              <section className="rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-4">
                <h2 className="text-[15px] font-semibold mb-3">{page === 'trash' ? 'Trash' : page === 'starred' ? 'Starred' : 'Recent files'}</h2>
                {visibleDocs(officeDocs, page, starred).length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ink-50)] py-6 text-center">
                    {page === 'starred' ? 'Star a file to keep it here.' : page === 'shared' ? 'Files shared with you will appear here.' : 'No files yet. Create one above to get started.'}
                  </p>
                ) : (
                  <div className="text-[12.5px]">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 pb-1.5 text-[11px] uppercase tracking-wide text-[var(--ink-50)] border-b border-[var(--edge-soft)]">
                      <span>Name</span>
                      <span>Owner</span>
                      <span>Last opened</span>
                      <span />
                    </div>
                    {visibleDocs(officeDocs, page, starred).map((d) => {
                      const ti = TYPE_ICON[d.docType] ?? { icon: 'description', tint: 'text-stone-400' }
                      return (
                        <div
                          key={d.id}
                          onClick={() => setOpenDocId(d.id)}
                          data-testid={`office-file-${d.id}`}
                          className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 py-2 items-center border-b border-[var(--edge-soft)]/60 cursor-pointer hover:bg-[var(--surface-sunken)] rounded"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Icon name={ti.icon} size={16} className={ti.tint} />
                            <span className="truncate">{d.title || 'Untitled'}</span>
                          </span>
                          <span className="text-[var(--ink-60)] whitespace-nowrap">{ownerName}</span>
                          <span className="text-[var(--ink-60)] whitespace-nowrap fb-tabular">{relTime(d.updatedAt)}</span>
                          <span className="flex items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleStar(d.id) }} className={starred.has(d.id) ? 'text-amber-400' : 'text-[var(--ink-40)] hover:text-amber-400'} title="Star">
                              <Icon name="star" size={15} filled={starred.has(d.id)} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); void remove(d.id) }} className="text-[var(--ink-40)] hover:text-rose-500" title="Delete">
                              <Icon name="delete" size={15} />
                            </button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Right rail */}
            <div className="w-[260px] shrink-0 space-y-4 hidden lg:block">
              <RailCard title="Pinned">
                {[...officeDocs].filter((d) => starred.has(d.id)).slice(0, 5).length === 0 ? (
                  <p className="text-[11.5px] text-[var(--ink-50)]">Star files to pin them here.</p>
                ) : (
                  officeDocs.filter((d) => starred.has(d.id)).slice(0, 5).map((d) => (
                    <button key={d.id} onClick={() => setOpenDocId(d.id)} className="flex items-center gap-2 w-full text-left py-1 hover:text-[rgb(var(--accent))]">
                      <Icon name={(TYPE_ICON[d.docType] ?? { icon: 'description' }).icon} size={14} className={(TYPE_ICON[d.docType] ?? { tint: '' }).tint} />
                      <span className="truncate text-[12px]">{d.title || 'Untitled'}</span>
                    </button>
                  ))
                )}
              </RailCard>

              <RailCard title="Storage">
                <p className="text-[12px] text-[var(--ink-70)]">
                  {officeDocs.length} document{officeDocs.length === 1 ? '' : 's'} in this workspace.
                </p>
                <p className="text-[11px] text-[var(--ink-50)] mt-1">Stored locally on this device.</p>
              </RailCard>

              <RailCard title="What's new">
                {CHANGELOG.slice(0, 3).map((c) => (
                  <div key={c.version} className="py-1">
                    <div className="text-[12px] font-medium truncate">{(c.title ?? c.version).replace(/^v?[0-9.]+\s*—\s*/, '')}</div>
                    <div className="text-[10.5px] text-[var(--ink-50)] fb-tabular">{c.version}</div>
                  </div>
                ))}
              </RailCard>

              <button
                onClick={() => promptUpgrade('PlexiOffice Pro')}
                className="w-full rounded-2xl border border-[rgb(var(--accent)/0.3)] bg-[rgb(var(--accent)/0.06)] p-4 text-left"
                data-testid="office-upgrade"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon name="auto_awesome" size={15} className="text-[rgb(var(--accent))]" />
                  <span className="text-[13px] font-semibold">Get more with PlexiOffice Pro</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-70)]">
                      <Icon name="check" size={13} className="text-emerald-500" /> {f}
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center justify-center w-full h-8 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium">Upgrade Now</span>
              </button>
            </div>
          </div>

          {/* AI assistant bar */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-4 py-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))]">
              <Icon name="auto_awesome" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">AI Assistant</div>
              <div className="text-[11.5px] text-[var(--ink-50)] truncate">Ask anything about your documents, data or presentations.</div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('fb:open-ai-bar'))}
              data-testid="office-ask-ai"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[rgb(var(--accent))] text-white text-[13px] font-medium hover:bg-[rgb(var(--accent-hover))]"
            >
              Ask AI
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function pageTitle(p: OfficePage): string {
  return p === 'home' ? 'Home' : p[0].toUpperCase() + p.slice(1)
}
function tabLabel(t: 'all' | DocType): string {
  return t === 'all' ? 'All' : t === 'doc' ? 'Docs' : t === 'sheet' ? 'Sheets' : t === 'slides' ? 'Slides' : t === 'map' ? 'Drawings' : t === 'design' ? 'Designs' : t
}
function appLabel(t: DocType): string {
  return t === 'doc' ? 'PlexiDocs' : t === 'sheet' ? 'PlexiSheets' : t === 'slides' ? 'PlexiSlides' : t === 'map' ? 'PlexiDraw' : t === 'design' ? 'PlexiDesign' : 'PlexiOffice'
}
function visibleDocs(docs: DocumentMeta[], page: OfficePage, starred: Set<string>): DocumentMeta[] {
  if (page === 'starred') return docs.filter((d) => starred.has(d.id))
  if (page === 'shared') return []
  return docs.slice(0, 12)
}

const TEMPLATES: { id: string; label: string; docType: DocType; preview: string }[] = [
  { id: 'blank-doc', label: 'Blank document', docType: 'doc', preview: 'bg-gradient-to-br from-sky-500 to-sky-700' },
  { id: 'blank-sheet', label: 'Blank spreadsheet', docType: 'sheet', preview: 'bg-gradient-to-br from-emerald-500 to-emerald-700' },
  { id: 'blank-slides', label: 'Blank presentation', docType: 'slides', preview: 'bg-gradient-to-br from-orange-500 to-orange-700' },
  { id: 'blank-draw', label: 'Blank drawing', docType: 'map', preview: 'bg-gradient-to-br from-violet-500 to-violet-700' },
  { id: 'blank-design', label: 'Blank design', docType: 'design', preview: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-700' }
]

function RailCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-3.5">
      <h3 className="text-[12px] font-semibold mb-2">{title}</h3>
      {children}
    </div>
  )
}

// ── The PlexiOffice-specific sidebar ─────────────────────────────────────────
function OfficeSidebar({
  page,
  onPage,
  onLaunch,
  onExit,
  starredCount
}: {
  page: OfficePage
  onPage: (p: OfficePage) => void
  onLaunch: (a: OfficeApp) => void
  onExit: () => void
  starredCount: number
}): JSX.Element {
  const NAV: { id: OfficePage; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'recent', label: 'Recent', icon: 'schedule' },
    { id: 'starred', label: 'Starred', icon: 'star' },
    { id: 'shared', label: 'Shared with me', icon: 'group' },
    { id: 'templates', label: 'Templates', icon: 'dashboard' },
    { id: 'trash', label: 'Trash', icon: 'delete' }
  ]
  return (
    <aside className="w-60 shrink-0 h-full overflow-auto border-r border-[var(--edge-soft)] bg-[var(--surface-raised)] flex flex-col" data-testid="office-sidebar">
      {/* Logo + app switcher */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--edge-soft)]">
        <span className="text-[15px] font-bold tracking-[0.14em] text-[var(--ink-100)]">PLEXIOFFICE</span>
        <button onClick={onExit} className="ml-auto text-[var(--ink-50)] hover:text-[var(--ink-90)]" title="Back to PlexiDesk" data-testid="office-exit">
          <Icon name="apps" size={18} />
        </button>
      </div>

      <nav className="px-2 py-3">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onPage(n.id)}
            data-testid={`office-nav-${n.id}`}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] mb-0.5 ${
              page === n.id ? 'bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))] font-medium' : 'text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            <Icon name={n.icon} size={17} />
            <span>{n.label}</span>
            {n.id === 'starred' && starredCount > 0 && <span className="ml-auto text-[10px] text-[var(--ink-50)] fb-tabular">{starredCount}</span>}
          </button>
        ))}
      </nav>

      <div className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">Apps</div>
      <div className="px-2">
        {APPS.map((a) => (
          <button
            key={a.key}
            onClick={() => onLaunch(a)}
            data-testid={`office-sideapp-${a.key}`}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[13px] mb-0.5 text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]"
          >
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white ${a.tint}`}>
              <Icon name={a.icon} size={14} />
            </span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">Workspaces</div>
      <div className="px-2 pb-3">
        <button className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[13px] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]">
          <Icon name="add" size={16} />
          <span>New Workspace</span>
        </button>
      </div>

      <div className="mt-auto p-3">
        <div className="rounded-xl border border-[rgb(var(--accent)/0.3)] bg-[rgb(var(--accent)/0.06)] p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon name="auto_awesome" size={14} className="text-[rgb(var(--accent))]" />
            <span className="text-[12px] font-semibold">PlexiOffice Pro</span>
          </div>
          <button onClick={() => promptUpgrade('PlexiOffice Pro')} className="w-full h-7 rounded-lg bg-[rgb(var(--accent))] text-white text-[11.5px] font-medium">
            Upgrade Now
          </button>
        </div>
      </div>
    </aside>
  )
}
