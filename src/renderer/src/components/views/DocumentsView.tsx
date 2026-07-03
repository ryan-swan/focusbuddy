import { useEffect, useState } from 'react'
import type { DocType } from '@shared/types'
import { useDocumentsStore } from '../../stores/documents'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { createLiveDoc } from '../../lib/docCollabClient'
import Icon from '../Icon'

// Documents hub — the home for office files. The top panel is the AI-first
// create flow: pick what you are making, say what it is about and who it is
// for, and PlexiDesk hands you a finished first draft already open for editing.
// Below it are your recent documents, and a quiet "start blank" path for the
// times you want the empty page.

const TYPES: { type: DocType; label: string; icon: string; blurb: string }[] = [
  { type: 'doc', label: 'Document', icon: 'description', blurb: 'Writeups, briefs, proposals' },
  { type: 'sheet', label: 'Spreadsheet', icon: 'table_chart', blurb: 'Plans, budgets, trackers' },
  { type: 'slides', label: 'Slides', icon: 'slideshow', blurb: 'Decks and presentations' },
  { type: 'map', label: 'Map', icon: 'account_tree', blurb: 'Flowcharts and workflow maps' }
]

function typeIcon(t: DocType): string {
  return TYPES.find((x) => x.type === t)?.icon ?? 'description'
}

function relTime(ms: number): string {
  const d = Date.now() - ms
  const mins = Math.round(d / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export default function DocumentsView(): JSX.Element {
  const list = useDocumentsStore((s) => s.list)
  const trashed = useDocumentsStore((s) => s.trashed)
  const refresh = useDocumentsStore((s) => s.refresh)
  const refreshTrashed = useDocumentsStore((s) => s.refreshTrashed)
  const createWithAI = useDocumentsStore((s) => s.createWithAI)
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const remove = useDocumentsStore((s) => s.remove)
  const restore = useDocumentsStore((s) => s.restore)
  const purge = useDocumentsStore((s) => s.purge)
  const goDocument = useViewStore((s) => s.goDocument)
  const goLiveDoc = useViewStore((s) => s.goLiveDoc)
  const token = useAccountStore((s) => s.sessionToken)

  const [docType, setDocType] = useState<DocType>('doc')
  const [prompt, setPrompt] = useState('')
  const [audience, setAudience] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  useEffect(() => {
    void refresh()
    void refreshTrashed()
    // Backfill document embeddings so "ask your workspace" grounds by meaning.
    // Best-effort and silent: with no embedding key it is a no-op and grounding
    // stays keyword-based.
    void window.api.documents.reindex()
  }, [refresh, refreshTrashed])

  // Turn a local document into a live, shared one and open it. Its current body
  // becomes the server-canonical copy; from there it's check-out collaborative.
  // Once live, it appears in the dedicated Collaborations section.
  async function collaborate(id: string): Promise<void> {
    if (!token) {
      setError('Sign in to collaborate on a document.')
      return
    }
    const full = await window.api.documents.get(id)
    if (!full) return
    const created = await createLiveDoc(token, {
      docType: full.docType,
      title: full.title,
      body: JSON.stringify(full.body)
    })
    if (created) {
      goLiveDoc(created.id)
    } else {
      setError('Could not start collaboration. Check your connection and that you are signed in.')
    }
  }

  async function create(): Promise<void> {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    const r = await createWithAI({ docType, prompt: prompt.trim(), audience: audience.trim() || undefined })
    setBusy(false)
    if (!r.ok) {
      setError(
        r.needsApiKey
          ? 'Add your Anthropic API key in Settings → AI to create with AI. You can still start blank.'
          : r.error || 'Could not create that.'
      )
      return
    }
    setPrompt('')
    setAudience('')
    if (r.id) goDocument(r.id)
  }

  async function blank(t: DocType): Promise<void> {
    const doc = await createBlank(t)
    goDocument(doc.id)
  }

  const verb = docType === 'doc' ? 'document' : docType === 'sheet' ? 'spreadsheet' : 'deck'

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Documents</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-0.5">
            Start with AI and get a real first draft, then make it yours. Documents, spreadsheets and
            slides, all in your workspace.
          </p>
        </header>

        {/* Create with AI */}
        <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/80 shadow-sm p-5 mb-8">
          <div className="flex gap-2 mb-4">
            {TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setDocType(t.type)}
                className={`flex-1 rounded-xl border p-3 text-left transition-colors ${
                  docType === t.type
                    ? 'border-accent bg-accent/[0.06]'
                    : 'border-stone-200 dark:border-stone-700 hover:border-accent/50'
                }`}
              >
                <Icon name={t.icon} size={20} className={docType === t.type ? 'text-accent' : 'text-stone-400'} />
                <div className="text-[13px] font-medium text-stone-800 dark:text-stone-100 mt-1.5">{t.label}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">{t.blurb}</div>
              </button>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void create()
            }}
            placeholder={`Describe the ${verb} you want. For example: a one-page launch plan for our new pricing, with goals, timeline and risks.`}
            rows={3}
            className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-xl px-3.5 py-2.5 text-[14px] focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex items-center gap-2 mt-3">
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Who is it for? (optional)"
              className="flex-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            />
            <button onClick={() => void create()} disabled={busy || !prompt.trim()} className="btn-primary shrink-0">
              <Icon name="auto_awesome" size={15} />
              {busy ? 'Creating…' : 'Create with AI'}
            </button>
          </div>
          {error && <div className="text-[12px] text-red-600 dark:text-red-400 mt-2">{error}</div>}

          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center gap-3 text-[12px] text-stone-500 dark:text-stone-400">
            <span>Or start blank:</span>
            {TYPES.map((t) => (
              <button key={t.type} onClick={() => void blank(t.type)} className="inline-flex items-center gap-1 hover:text-accent">
                <Icon name={t.icon} size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent */}
        <h2 className="text-[13px] font-semibold text-stone-700 dark:text-stone-300 mb-2">Recent</h2>
        {list.length === 0 ? (
          <p className="text-[13px] text-stone-500 dark:text-stone-400 py-6 text-center rounded-xl border border-dashed border-stone-300 dark:border-stone-700">
            No documents yet. Create your first one above.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {list.map((d) => (
              <div
                key={d.id}
                onClick={() => goDocument(d.id)}
                className="group flex items-center gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 px-3.5 py-3 cursor-pointer hover:border-accent/50 hover:shadow-sm transition"
              >
                <div className="h-9 w-9 rounded-lg bg-accent/10 text-accent inline-flex items-center justify-center shrink-0">
                  <Icon name={typeIcon(d.docType)} size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">{d.title}</div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500">Edited {relTime(d.updatedAt)}</div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void collaborate(d.id)
                    }}
                    className="text-stone-400 hover:text-accent p-1"
                    title="Collaborate (share live)"
                    data-testid="doc-collaborate"
                  >
                    <Icon name="group_add" size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Recoverable: lands in the Trash below, with an Undo toast.
                      void remove(d.id)
                    }}
                    className="text-stone-400 hover:text-red-500 p-1 focus-visible:opacity-100"
                    title="Move to trash (recoverable below)"
                  >
                    <Icon name="delete" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Live, shared documents now live in their own Collaborations section. */}

        {/* Trash — soft-deleted documents. Restore any time, or delete forever. */}
        {trashed.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowTrash((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              aria-expanded={showTrash}
            >
              <Icon name={showTrash ? 'expand_more' : 'chevron_right'} size={15} />
              Trash ({trashed.length})
            </button>
            {showTrash && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {trashed.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/40 dark:bg-stone-900/40 px-3.5 py-3"
                  >
                    <div className="h-9 w-9 rounded-lg bg-stone-200/60 dark:bg-stone-800 text-stone-400 inline-flex items-center justify-center shrink-0">
                      <Icon name={typeIcon(d.docType)} size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-stone-500 dark:text-stone-400 truncate line-through decoration-stone-300 dark:decoration-stone-600">
                        {d.title}
                      </div>
                      <div className="text-[11px] text-stone-400 dark:text-stone-500">In trash</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void restore(d.id)}
                        className="text-stone-400 hover:text-accent p-1"
                        title="Restore"
                        data-testid="doc-restore"
                      >
                        <Icon name="restore_from_trash" size={15} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${d.title}" forever? This cannot be undone.`)) void purge(d.id)
                        }}
                        className="text-stone-400 hover:text-red-500 p-1"
                        title="Delete forever"
                        data-testid="doc-purge"
                      >
                        <Icon name="delete_forever" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
