import { useEffect, useState } from 'react'
import type { DocType } from '@office'
import type { FileEntry } from '@shared/fields'
import { useFileManagerStore, sortEntries } from '../../stores/fileManager'
import { useDocumentsStore } from '../../stores/documents'
import Icon from '../Icon'

// PlexiOffice Drive — the folder tree for the standalone app, reusing PlexiDesk's
// file-manager store + IPC verbatim (window.api.fileManager). Folders organise
// documents; new documents are filed into the current folder; existing unfiled
// documents surface at the root so nothing a user already made is hidden. Drag a
// row onto a folder (or a breadcrumb) to move it.

const NEW_KINDS: { type: DocType; label: string; icon: string }[] = [
  { type: 'doc', label: 'Document', icon: 'description' },
  { type: 'sheet', label: 'Spreadsheet', icon: 'table' },
  { type: 'slides', label: 'Slides', icon: 'slideshow' },
  { type: 'map', label: 'Map', icon: 'account_tree' }
]

function docIcon(t: string | undefined): string {
  return t === 'sheet' ? 'table' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeDrive(): JSX.Element {
  const cwd = useFileManagerStore((s) => s.cwd)
  const crumbs = useFileManagerStore((s) => s.crumbs)
  const entries = useFileManagerStore((s) => s.entries)
  const refresh = useFileManagerStore((s) => s.refresh)
  const openFolder = useFileManagerStore((s) => s.openFolder)
  const createFolder = useFileManagerStore((s) => s.createFolder)
  const move = useFileManagerStore((s) => s.move)
  const remove = useFileManagerStore((s) => s.remove)

  const open = useDocumentsStore((s) => s.open)
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const active = useDocumentsStore((s) => s.active)

  const [unfiled, setUnfiled] = useState<Array<{ id: string; title: string; docType: string }>>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

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

  async function onDropOnFolder(folderId: string | null): Promise<void> {
    const id = dragId
    setDragId(null)
    setDropTarget(null)
    if (!id || id === folderId) return
    await move(id, folderId)
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
      </div>

      {/* Breadcrumbs */}
      <div className="px-3 pb-1 flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 flex-wrap">
        <button
          onClick={() => void openFolder(null)}
          onDragOver={(e) => {
            e.preventDefault()
            setDropTarget('root')
          }}
          onDragLeave={() => setDropTarget((t) => (t === 'root' ? null : t))}
          onDrop={() => void onDropOnFolder(null)}
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
        {sorted.length === 0 && unfiled.length === 0 ? (
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
                onDelete={() => void remove(e.id)}
                draggable
                onDragStart={() => setDragId(e.id)}
                onDragOver={
                  e.kind === 'folder'
                    ? (ev) => {
                        ev.preventDefault()
                        setDropTarget(e.id)
                      }
                    : undefined
                }
                onDragLeave={() => setDropTarget((t) => (t === e.id ? null : t))}
                onDrop={e.kind === 'folder' ? () => void onDropOnFolder(e.id) : undefined}
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
                    onDragStart={() => setDragId(d.id)}
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
  onDelete: () => void
  draggable: boolean
  onDragStart: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: () => void
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
      data-testid={isFolder ? `office-folder-${entry.name}` : undefined}
      className={`group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] ${
        active ? 'bg-accent/[0.12] text-accent' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
      } ${isDropTarget ? 'ring-1 ring-accent bg-accent/[0.08]' : ''}`}
    >
      <button onClick={onOpen} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Icon name={icon} size={14} className={`shrink-0 ${isFolder ? 'text-accent' : 'text-stone-400'}`} />
        <span className="truncate">{entry.name || 'Untitled'}</span>
      </button>
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
