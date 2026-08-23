import { useEffect, useState } from 'react'
import type { FileEntry } from '@shared/fields'
import Icon from './Icon'

// A small, reusable "choose a folder" modal over the file-manager (Drive) tree.
// Used anywhere we need to file something into a place: filing an office
// document, moving a file, etc. It browses real fb_files folders, supports a
// name search, breadcrumb navigation, creating a folder inline, and picking the
// top level. onPick returns the chosen folder id (null = top level / unfiled).

interface Props {
  title?: string
  // The currently-filed folder id, shown with a check so the user sees where it
  // is now. null = currently at top level / unfiled.
  currentParentId?: string | null
  onPick: (folderId: string | null) => void
  onClose: () => void
}

export default function FolderPickerModal({
  title = 'Choose a folder',
  currentParentId,
  onPick,
  onClose
}: Props): JSX.Element {
  const [parentId, setParentId] = useState<string | null>(null)
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([])
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<FileEntry[] | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [list, path] = await Promise.all([
        window.api.fileManager.list(parentId),
        window.api.fileManager.path(parentId)
      ])
      if (cancelled) return
      setEntries(list.filter((e) => e.kind === 'folder'))
      setCrumbs(path)
    })()
    return () => {
      cancelled = true
    }
  }, [parentId])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchHits(null)
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      void window.api.fileManager.search(q).then((hits) => {
        if (!cancelled) setSearchHits(hits.filter((e) => e.kind === 'folder'))
      })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [query])

  async function createHere(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const folder = await window.api.fileManager.createFolder(parentId, name)
      setNewName('')
      // Enter the new folder so the user can either file here or nest further.
      setParentId(folder.id)
    } finally {
      setCreating(false)
    }
  }

  const shown = searchHits ?? entries
  const rowCls =
    'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]'

  return (
    <div className="fixed inset-0 z-[320] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="folder-picker"
        className="fb-card w-[460px] max-w-[92vw] flex flex-col max-h-[80vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[var(--edge-soft)]">
          <Icon name="drive_file_move" size={16} className="text-[rgb(var(--accent))]" />
          <span className="text-[14px] font-semibold text-[var(--ink-90)]">{title}</span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="px-3 pt-3">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-40)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search folders"
              data-testid="folder-picker-search"
              className="fb-field w-full h-8 pl-7 pr-2 text-[12.5px]"
            />
          </div>
        </div>

        {/* Breadcrumb — only while browsing (not searching). */}
        {!searchHits && (
          <div className="flex items-center gap-1 flex-wrap px-3 pt-2 text-[12px] text-[var(--ink-60)]">
            <button
              onClick={() => setParentId(null)}
              className={`px-1.5 py-0.5 rounded hover:bg-[var(--surface-sunken)] ${parentId === null ? 'text-[var(--ink-100)] font-medium' : ''}`}
            >
              Top level
            </button>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
                <button
                  onClick={() => setParentId(c.id)}
                  className="px-1.5 py-0.5 rounded hover:bg-[var(--surface-sunken)]"
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto mt-2 mx-3 rounded-lg bg-[var(--surface-sunken)] divide-y divide-[var(--edge-soft)]">
          {shown === null ? (
            <div className="px-3 py-2 text-[12px] text-[var(--ink-40)]">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--ink-40)]">
              {searchHits ? 'No folders match.' : 'No sub-folders here.'}
            </div>
          ) : (
            shown.map((f) => (
              <div key={f.id} className={rowCls}>
                <button
                  onClick={() => {
                    setQuery('')
                    setSearchHits(null)
                    setParentId(f.id)
                  }}
                  className="flex-1 flex items-center gap-2 min-w-0"
                  title="Open this folder"
                >
                  <Icon name="folder" size={15} className="text-amber-600 shrink-0" filled />
                  <span className="text-[12.5px] text-[var(--ink-80)] truncate">{f.name}</span>
                  {currentParentId === f.id && (
                    <Icon name="check" size={13} className="text-[rgb(var(--accent))] shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => onPick(f.id)}
                  className="text-[11px] font-medium text-[rgb(var(--accent))] hover:underline shrink-0"
                  data-testid={`folder-pick-${f.id}`}
                >
                  File here
                </button>
              </div>
            ))
          )}
        </div>

        {/* Create a folder in the current location. */}
        {!searchHits && (
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createHere()
              }}
              placeholder="New folder name"
              className="fb-field flex-1 h-8 px-2 text-[12px]"
            />
            <button
              onClick={() => void createHere()}
              disabled={!newName.trim() || creating}
              className="fb-btn-surface inline-flex items-center gap-1 h-8 px-2.5 text-[12px] text-[var(--ink-70)] hover:text-[var(--ink-100)] disabled:opacity-40"
            >
              <Icon name="create_new_folder" size={14} /> Create
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-[var(--edge-soft)]">
          <button
            onClick={() => onPick(null)}
            className="text-[12px] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
          >
            File at top level
          </button>
          <button
            onClick={() => onPick(parentId)}
            data-testid="folder-pick-current"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))]"
          >
            <Icon name="check" size={15} /> File in {crumbs.length ? crumbs[crumbs.length - 1].name : 'Top level'}
          </button>
        </div>
      </div>
    </div>
  )
}
