import { useEffect, useState } from 'react'
import type { DocType } from '@office'
import type { FileEntry } from '@shared/fields'
import { useFileManagerStore, sortEntries } from '../../stores/fileManager'
import { useDocumentsStore } from '../../stores/documents'
import { useSharesStore } from '../../stores/shares'
import { materializeDocFolder } from '../../lib/officeShareImport'
import type { DocFolderSnapshot } from '../../lib/shareSnapshot'
import Icon from '../Icon'

// Pull the share token out of a pasted viewer URL (…/share/<token>) or a bare token.
function extractToken(input: string): string {
  const m = input.trim().match(/\/share\/([a-z0-9]+)/i)
  return m ? m[1] : input.trim()
}

// PlexiOffice Drive — the folder tree for the standalone app, reusing PlexiDesk's
// file-manager store + IPC verbatim (window.api.fileManager). Folders organise
// documents; new documents are filed into the current folder; existing unfiled
// documents surface at the root so nothing a user already made is hidden. Drag a
// row onto a folder (or a breadcrumb) to move it.

// The drag payload type for an entry id, shared with the PlexiDesk file view so a
// drag started in one Drive can be dropped in the other. Carrying the id on the
// browser's dataTransfer (rather than React state) is what makes drops land.
const ENTRY_MIME = 'application/fb-entry-id'

const NEW_KINDS: { type: DocType; label: string; icon: string }[] = [
  { type: 'doc', label: 'Document', icon: 'description' },
  { type: 'sheet', label: 'Spreadsheet', icon: 'table' },
  { type: 'slides', label: 'Slides', icon: 'slideshow' },
  { type: 'map', label: 'Map', icon: 'account_tree' }
]

function docIcon(t: string | undefined): string {
  return t === 'sheet' ? 'table' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeDrive({
  onShareFolder
}: {
  onShareFolder?: (folderId: string, name: string) => void
}): JSX.Element {
  const cwd = useFileManagerStore((s) => s.cwd)
  const crumbs = useFileManagerStore((s) => s.crumbs)
  const entries = useFileManagerStore((s) => s.entries)
  const refresh = useFileManagerStore((s) => s.refresh)
  const openFolder = useFileManagerStore((s) => s.openFolder)
  const createFolder = useFileManagerStore((s) => s.createFolder)
  const move = useFileManagerStore((s) => s.move)
  const remove = useFileManagerStore((s) => s.remove)
  const search = useFileManagerStore((s) => s.search)
  const searchResults = useFileManagerStore((s) => s.searchResults)
  const searching = useFileManagerStore((s) => s.searching)
  const runSearch = useFileManagerStore((s) => s.runSearch)
  const clearSearch = useFileManagerStore((s) => s.clearSearch)
  const trashed = useFileManagerStore((s) => s.trashed)
  const loadTrash = useFileManagerStore((s) => s.loadTrash)
  const restoreFromTrash = useFileManagerStore((s) => s.restoreFromTrash)
  const purge = useFileManagerStore((s) => s.purge)

  const open = useDocumentsStore((s) => s.open)
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const active = useDocumentsStore((s) => s.active)

  const acceptByToken = useSharesStore((s) => s.acceptByToken)

  const [unfiled, setUnfiled] = useState<Array<{ id: string; title: string; docType: string }>>([])
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  function toggleTrash(): void {
    setTrashOpen((v) => {
      const next = !v
      if (next) void loadTrash()
      return next
    })
  }

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Surface documents that aren't filed in any folder, but only at the root so
  // they read as "loose" items rather than appearing in every folder.
  useEffect(() => {
    if (cwd === null) {
      void window.api.fileManager
        .unfiledDocuments()
        .then(setUnfiled)
        .catch(() => setUnfiled([]))
    } else {
      setUnfiled([])
    }
  }, [cwd, entries])

  async function newDoc(type: DocType): Promise<void> {
    const doc = await createBlank(type)
    // File the new document into the folder you're currently looking at.
    await window.api.fileManager.fileDocument(doc.id, cwd).catch(() => {})
    await refresh()
    await open(doc.id)
  }

  async function newFolder(): Promise<void> {
    await createFolder('New folder')
  }

  // Open a shared link: fetch the snapshot and, for a copy-scope folder, import a
  // real editable copy into the current folder. View-only shares open in a browser.
  async function importLink(): Promise<void> {
    const token = extractToken(importUrl)
    if (!token || importBusy) return
    setImportBusy(true)
    setImportMsg(null)
    try {
      const item = await acceptByToken(token)
      const snap = item.snapshot as { kind?: string } | undefined
      if (snap?.kind === 'docfolder') {
        if (item.scope !== 'copy') {
          setImportMsg('This folder was shared view-only. Open the link in a browser to view it.')
        } else {
          await materializeDocFolder(item.snapshot as DocFolderSnapshot, cwd)
          await refresh()
          setImportMsg('Imported into this folder.')
          setImportUrl('')
        }
      } else {
        setImportMsg('That link is not an importable folder. View-only links open in a browser.')
      }
    } catch (e) {
      setImportMsg((e as Error).message || 'Could not open that link.')
    } finally {
      setImportBusy(false)
    }
  }

  async function onDropOnFolder(folderId: string | null, draggedId: string): Promise<void> {
    setDropTarget(null)
    if (!draggedId || draggedId === folderId) return
    await move(draggedId, folderId)
    // A doc dragged out of "unfiled" needs the unfiled list refreshed too.
    if (cwd === null) {
      window.api.fileManager.unfiledDocuments().then(setUnfiled).catch(() => {})
    }
  }

  const sorted = sortEntries(entries, 'name', 'asc')

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* New-document + new-folder actions (file into the current folder). */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Drive-wide search */}
        <div className="relative">
          <Icon name="search" size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search Drive"
            data-testid="office-search"
            className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg pl-7 pr-7 py-1.5 text-[12px] focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              onClick={clearSearch}
              data-testid="office-search-clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-accent"
              title="Clear search"
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {NEW_KINDS.map((k) => (
            <button
              key={k.type}
              onClick={() => void newDoc(k.type)}
              data-testid={`office-new-${k.type}`}
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 px-2 py-1.5 text-[11.5px] hover:border-accent hover:bg-accent/[0.05]"
              title={`New ${k.label.toLowerCase()}`}
            >
              <Icon name={k.icon} size={14} className="text-accent" />
              {k.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void newFolder()}
          data-testid="office-new-folder"
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 px-2 py-1.5 text-[11.5px] text-stone-600 dark:text-stone-300 hover:border-accent hover:text-accent"
        >
          <Icon name="create_new_folder" size={14} />
          New folder
        </button>
        <button
          onClick={() => setImportOpen((v) => !v)}
          data-testid="office-import-link"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-stone-500 dark:text-stone-400 hover:text-accent"
        >
          <Icon name="link" size={13} />
          Open a shared link
        </button>
        <button
          onClick={toggleTrash}
          data-testid="office-trash-toggle"
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
            trashOpen ? 'text-accent' : 'text-stone-500 dark:text-stone-400 hover:text-accent'
          }`}
        >
          <Icon name={trashOpen ? 'arrow_back' : 'delete'} size={13} />
          {trashOpen ? 'Back to Drive' : 'Trash'}
        </button>
        {importOpen && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void importLink()
                }}
                placeholder="Paste a share link"
                data-testid="office-import-url"
                className="flex-1 min-w-0 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-[11.5px] focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => void importLink()}
                disabled={importBusy || !importUrl.trim()}
                data-testid="office-import-go"
                className="btn-primary text-[11px] px-2 py-1 disabled:opacity-50"
              >
                {importBusy ? '…' : 'Open'}
              </button>
            </div>
            {importMsg && <div className="text-[10.5px] text-stone-500">{importMsg}</div>}
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="px-3 pb-1 flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 flex-wrap">
        <button
          onClick={() => void openFolder(null)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(ENTRY_MIME)) {
              e.preventDefault()
              setDropTarget('root')
            }
          }}
          onDragLeave={() => setDropTarget((t) => (t === 'root' ? null : t))}
          onDrop={(e) => void onDropOnFolder(null, e.dataTransfer.getData(ENTRY_MIME))}
          className={`inline-flex items-center gap-1 rounded px-1 hover:text-accent ${dropTarget === 'root' ? 'bg-accent/[0.12] text-accent' : ''}`}
          data-testid="office-crumb-home"
        >
          <Icon name="home" size={12} />
          Home
        </button>
        {crumbs.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <Icon name="chevron_right" size={12} className="text-stone-300 dark:text-stone-600" />
            <button onClick={() => void openFolder(c.id)} className="hover:text-accent truncate max-w-[100px]">
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-auto px-2 pb-3">
        {trashOpen ? (
          trashed.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-stone-400" data-testid="office-trash-empty">
              Trash is empty.
            </div>
          ) : (
            <div data-testid="office-trash-list">
              <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-stone-400">
                Trash — deleted items, recoverable for 7 days
              </div>
              {trashed.map((e) => (
                <TrashRow
                  key={e.id}
                  entry={e}
                  onRestore={() => void restoreFromTrash(e.id)}
                  onPurge={() => void purge(e.id)}
                />
              ))}
            </div>
          )
        ) : search.trim() ? (
          searchResults.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-stone-400" data-testid="office-search-empty">
              {searching ? 'Searching…' : `No matches for “${search.trim()}”.`}
            </div>
          ) : (
            <div data-testid="office-search-results">
              {searchResults.map((e) => (
                <DriveRow
                  key={e.id}
                  entry={e}
                  active={!!e.docId && active?.id === e.docId}
                  isDropTarget={false}
                  onOpen={() => {
                    if (e.kind === 'folder') {
                      clearSearch()
                      void openFolder(e.id)
                    } else if (e.kind === 'doc' && e.docId) void open(e.docId)
                    else void window.api.files.open(e.id)
                  }}
                  onDelete={() => {
                    void remove(e.id)
                    void runSearch(search)
                  }}
                  draggable={false}
                  onDragStart={() => {}}
                />
              ))}
            </div>
          )
        ) : sorted.length === 0 && unfiled.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-stone-400">
            {cwd === null ? 'No documents yet.' : 'This folder is empty.'}
          </div>
        ) : (
          <>
            {sorted.map((e) => (
              <DriveRow
                key={e.id}
                entry={e}
                active={!!e.docId && active?.id === e.docId}
                isDropTarget={dropTarget === e.id && e.kind === 'folder'}
                onOpen={() => {
                  if (e.kind === 'folder') void openFolder(e.id)
                  else if (e.kind === 'doc' && e.docId) void open(e.docId)
                  else void window.api.files.open(e.id)
                }}
                onShare={
                  e.kind === 'folder' && onShareFolder ? () => onShareFolder(e.id, e.name) : undefined
                }
                onDelete={() => void remove(e.id)}
                draggable
                onDragStart={(ev) => ev.dataTransfer.setData(ENTRY_MIME, e.id)}
                onDragOver={
                  e.kind === 'folder'
                    ? (ev) => {
                        if (ev.dataTransfer.types.includes(ENTRY_MIME)) {
                          ev.preventDefault()
                          setDropTarget(e.id)
                        }
                      }
                    : undefined
                }
                onDragLeave={() => setDropTarget((t) => (t === e.id ? null : t))}
                onDrop={
                  e.kind === 'folder'
                    ? (ev) => void onDropOnFolder(e.id, ev.dataTransfer.getData(ENTRY_MIME))
                    : undefined
                }
              />
            ))}

            {unfiled.length > 0 && (
              <>
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-stone-400">
                  Not in a folder
                </div>
                {unfiled.map((d) => (
                  <button
                    key={d.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData(ENTRY_MIME, d.id)}
                    onClick={() => void open(d.id)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] truncate ${
                      active?.id === d.id ? 'bg-accent/[0.12] text-accent' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <Icon name={docIcon(d.docType)} size={14} className="shrink-0 text-stone-400" />
                    <span className="truncate">{d.title || 'Untitled'}</span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DriveRow({
  entry,
  active,
  isDropTarget,
  onOpen,
  onShare,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  entry: FileEntry
  active: boolean
  isDropTarget: boolean
  onOpen: () => void
  onShare?: () => void
  onDelete: () => void
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent) => void
}): JSX.Element {
  const isFolder = entry.kind === 'folder'
  const icon = isFolder ? 'folder' : entry.kind === 'doc' ? docIcon(entry.docType) : 'draft'
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid={isFolder ? `office-folder-${entry.name}` : `office-${entry.kind}-${entry.name}`}
      data-entry-id={entry.id}
      className={`group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] ${
        active ? 'bg-accent/[0.12] text-accent' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
      } ${isDropTarget ? 'ring-1 ring-accent bg-accent/[0.08]' : ''}`}
    >
      <button onClick={onOpen} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Icon name={icon} size={14} className={`shrink-0 ${isFolder ? 'text-accent' : 'text-stone-400'}`} />
        <span className="truncate">{entry.name || 'Untitled'}</span>
      </button>
      {onShare && (
        <button
          onClick={onShare}
          data-testid={`office-folder-share-${entry.name}`}
          className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-accent shrink-0"
          title="Share folder"
        >
          <Icon name="share" size={13} />
        </button>
      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-500 shrink-0"
        title={isFolder ? 'Delete folder' : 'Remove'}
      >
        <Icon name="delete" size={13} />
      </button>
    </div>
  )
}

// A row in the Trash view: the deleted item with restore and delete-forever.
function TrashRow({
  entry,
  onRestore,
  onPurge
}: {
  entry: FileEntry
  onRestore: () => void
  onPurge: () => void
}): JSX.Element {
  const isFolder = entry.kind === 'folder'
  const icon = isFolder ? 'folder' : entry.kind === 'doc' ? docIcon(entry.docType) : 'draft'
  return (
    <div
      className="group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-stone-100 dark:hover:bg-stone-800"
      data-testid={`office-trash-row-${entry.name}`}
    >
      <Icon name={icon} size={14} className="shrink-0 text-stone-400" />
      <span className="truncate flex-1 text-stone-500 dark:text-stone-400 line-through decoration-stone-300 dark:decoration-stone-600">
        {entry.name || 'Untitled'}
      </span>
      <button
        onClick={onRestore}
        data-testid={`office-trash-restore-${entry.name}`}
        className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-accent shrink-0"
        title="Restore"
      >
        <Icon name="restore_from_trash" size={14} />
      </button>
      <button
        onClick={onPurge}
        data-testid={`office-trash-purge-${entry.name}`}
        className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-500 shrink-0"
        title="Delete forever"
      >
        <Icon name="delete_forever" size={14} />
      </button>
    </div>
  )
}
