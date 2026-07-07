import { useCallback, useEffect, useState } from 'react'
import type { DocType } from '@office'
import type { FileEntry } from '@shared/fields'
import { useFileManagerStore, sortEntries } from '../../stores/fileManager'
import { useDocumentsStore } from '../../stores/documents'
import { useSharesStore } from '../../stores/shares'
import { useCapabilityStore } from '../../stores/capabilities'
import { useOrgStore } from '../../stores/org'
import { computeEntitlement, capabilityForDocType, DOC_TYPE_LABEL } from '../../lib/entitlementReason'
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
  const tags = useFileManagerStore((s) => s.tags)
  const activeTag = useFileManagerStore((s) => s.activeTag)
  const tagEntries = useFileManagerStore((s) => s.tagEntries)
  const loadTags = useFileManagerStore((s) => s.loadTags)
  const addTags = useFileManagerStore((s) => s.addTags)
  const removeTag = useFileManagerStore((s) => s.removeTag)
  const openTag = useFileManagerStore((s) => s.openTag)
  const clearTag = useFileManagerStore((s) => s.clearTag)
  const smartFolders = useFileManagerStore((s) => s.smartFolders)
  const activeSmart = useFileManagerStore((s) => s.activeSmart)
  const smartEntries = useFileManagerStore((s) => s.smartEntries)
  const loadSmartFolders = useFileManagerStore((s) => s.loadSmartFolders)
  const createSmart = useFileManagerStore((s) => s.createSmart)
  const deleteSmart = useFileManagerStore((s) => s.deleteSmart)
  const openSmart = useFileManagerStore((s) => s.openSmart)
  const clearSmart = useFileManagerStore((s) => s.clearSmart)
  const untagged = useFileManagerStore((s) => s.untagged)
  const loadUntagged = useFileManagerStore((s) => s.loadUntagged)

  const open = useDocumentsStore((s) => s.open)
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const active = useDocumentsStore((s) => s.active)

  // Per-editor entitlements for the Drive's "New <type>" buttons. Same
  // reason-aware helper the rest of the office uses.
  const capabilities = useCapabilityStore((s) => s.capabilities)
  const capSources = useCapabilityStore((s) => s.sources)
  const orgRole = useCapabilityStore((s) => s.orgRole)
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const orgName = useOrgStore((s) => s.orgs.find((o) => o.id === s.activeOrgId)?.name ?? null)
  const entInputs = { capabilities, sources: capSources, orgRole, activeOrgId, orgName }

  const acceptByToken = useSharesStore((s) => s.acceptByToken)

  const [unfiled, setUnfiled] = useState<Array<{ id: string; title: string; docType: string }>>([])
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [tagEditId, setTagEditId] = useState<string | null>(null)
  const [tagEditAuto, setTagEditAuto] = useState(false)
  const [smartCreatorOpen, setSmartCreatorOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Keep the tag vocabulary, smart folders and the not-filed set fresh.
  useEffect(() => {
    void loadTags()
    void loadSmartFolders()
    void loadUntagged()
  }, [loadTags, loadSmartFolders, loadUntagged, entries])

  // Open an item's tags. `auto` runs the AI suggestion immediately (review flow).
  function openTags(id: string, auto = false): void {
    setTagEditAuto(auto)
    setTagEditId(id)
  }

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
    // Gate on the editor's entitlement. Locked editors never create; a
    // licensing gap offers the upgrade, a restriction just no-ops.
    const ent = computeEntitlement(entInputs, capabilityForDocType(type), DOC_TYPE_LABEL[type])
    if (!ent.enabled) {
      ent.onLockedClick()
      return
    }
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
          <Icon name="search" size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-40)] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search Drive"
            data-testid="office-search"
            className="w-full bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg pl-7 pr-7 py-1.5 text-[12px] focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              onClick={clearSearch}
              data-testid="office-search-clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-40)] hover:text-accent"
              title="Clear search"
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {NEW_KINDS.map((k) => {
            const ent = computeEntitlement(entInputs, capabilityForDocType(k.type), DOC_TYPE_LABEL[k.type])
            const locked = !ent.enabled
            return (
              <button
                key={k.type}
                onClick={() => void newDoc(k.type)}
                data-testid={`office-new-${k.type}`}
                data-locked={locked ? 'true' : undefined}
                aria-disabled={locked ? 'true' : undefined}
                className={`flex items-center gap-1.5 rounded-lg border border-[var(--edge-soft)] px-2 py-1.5 text-[11.5px] ${
                  locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:bg-accent/[0.05]'
                }`}
                title={locked ? ent.reason : `New ${k.label.toLowerCase()}`}
              >
                <Icon name={locked ? 'lock' : k.icon} size={14} className="text-accent" />
                {k.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => void newFolder()}
          data-testid="office-new-folder"
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--edge-firm)] px-2 py-1.5 text-[11.5px] text-[var(--ink-70)] hover:border-accent hover:text-accent"
        >
          <Icon name="create_new_folder" size={14} />
          New folder
        </button>
        <button
          onClick={() => setImportOpen((v) => !v)}
          data-testid="office-import-link"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[var(--ink-50)] hover:text-accent"
        >
          <Icon name="link" size={13} />
          Open a shared link
        </button>
        <button
          onClick={toggleTrash}
          data-testid="office-trash-toggle"
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
            trashOpen ? 'text-accent' : 'text-[var(--ink-50)] hover:text-accent'
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
                className="flex-1 min-w-0 bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1 text-[11.5px] focus:outline-none focus:border-accent"
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
            {importMsg && <div className="text-[10.5px] text-[var(--ink-50)]">{importMsg}</div>}
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="px-3 pb-1 flex items-center gap-1 text-[11px] text-[var(--ink-50)] flex-wrap">
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
            <Icon name="chevron_right" size={12} className="text-[var(--ink-30)]" />
            <button onClick={() => void openFolder(c.id)} className="hover:text-accent truncate max-w-[100px]">
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* Facets: tags behave like folders that span the whole Drive. Click one to
          see every file that carries it, wherever it physically lives. */}
      {tags.length > 0 && (
        <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap" data-testid="office-tags-strip">
          <Icon name="sell" size={12} className="text-[var(--ink-40)] shrink-0" />
          {tags.slice(0, 24).map((t) => (
            <button
              key={t.tag}
              onClick={() => (activeTag === t.tag ? clearTag() : void openTag(t.tag))}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(ENTRY_MIME)) {
                  e.preventDefault()
                  setDropTarget(`tag:${t.tag}`)
                }
              }}
              onDragLeave={() => setDropTarget((d) => (d === `tag:${t.tag}` ? null : d))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(ENTRY_MIME)
                setDropTarget(null)
                if (id) void addTags(id, [t.tag])
              }}
              data-testid={`office-tag-${t.tag}`}
              title={`Drop a file here to tag it "${t.tag}"`}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                dropTarget === `tag:${t.tag}`
                  ? 'border-accent ring-2 ring-accent/40 bg-accent/10 text-accent'
                  : activeTag === t.tag
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent'
              }`}
            >
              {t.tag} <span className="text-[var(--ink-40)]">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Smart folders: saved tag queries that always show the matching files. */}
      {(smartFolders.length > 0 || tags.length > 0) && (
        <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap" data-testid="office-smart-strip">
          <Icon name="folder_special" size={12} className="text-[var(--ink-40)] shrink-0" />
          {smartFolders.map((sf) => (
            <span key={sf.id} className="group inline-flex items-center">
              <button
                onClick={() => (activeSmart?.id === sf.id ? clearSmart() : void openSmart(sf))}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(ENTRY_MIME)) {
                    e.preventDefault()
                    setDropTarget(`smart:${sf.id}`)
                  }
                }}
                onDragLeave={() => setDropTarget((d) => (d === `smart:${sf.id}` ? null : d))}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(ENTRY_MIME)
                  setDropTarget(null)
                  if (id && sf.tags.length) void addTags(id, sf.tags)
                }}
                data-testid={`office-smart-${sf.name}`}
                title={`Drop a file here to tag it: ${sf.tags.join(' + ')}`}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  dropTarget === `smart:${sf.id}`
                    ? 'border-accent ring-2 ring-accent/40 bg-accent/10 text-accent'
                    : activeSmart?.id === sf.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent'
                }`}
              >
                {sf.name}
              </button>
              <button
                onClick={() => void deleteSmart(sf.id)}
                data-testid={`office-smart-del-${sf.name}`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-rose-500 ml-0.5"
                title="Delete smart folder"
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
          {tags.length > 0 && (
            <button
              onClick={() => setSmartCreatorOpen((v) => !v)}
              data-testid="office-smart-new"
              className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--edge-firm)] text-[var(--ink-50)] hover:border-accent hover:text-accent"
            >
              + Smart folder
            </button>
          )}
        </div>
      )}

      {smartCreatorOpen && (
        <SmartFolderCreator
          tags={tags}
          onCreate={(name, sel, search) => {
            void createSmart(name, sel, search)
            setSmartCreatorOpen(false)
          }}
          onClose={() => setSmartCreatorOpen(false)}
        />
      )}

      {tagEditId && (
        <TagEditor
          fileId={tagEditId}
          auto={tagEditAuto}
          onAdd={(tag) => void addTags(tagEditId, [tag])}
          onRemove={(tag) => void removeTag(tagEditId, tag)}
          onClose={() => {
            setTagEditId(null)
            setTagEditAuto(false)
          }}
        />
      )}

      {/* Proactive auto-filing: the AI offers to place items that aren't filed
          yet. Suggest-only — Review opens each with suggestions ready. */}
      {untagged.length > 0 && !bannerDismissed && !trashOpen && !activeTag && !activeSmart && !search.trim() && (
        <div
          className="mx-3 mb-2 rounded-lg border border-accent/30 bg-accent/[0.05] px-3 py-2 flex items-center gap-2 text-[12px]"
          data-testid="office-unfiled-banner"
        >
          <Icon name="auto_awesome" size={14} className="text-accent shrink-0" />
          <span className="flex-1 text-[var(--ink-70)]">
            {untagged.length} item{untagged.length === 1 ? '' : 's'} {untagged.length === 1 ? "isn't" : "aren't"} filed yet.
            Let AI suggest where {untagged.length === 1 ? 'it belongs' : 'they belong'}.
          </span>
          <button
            onClick={() => openTags(untagged[0].id, true)}
            data-testid="office-unfiled-review"
            className="btn-primary text-[12px] px-2.5 py-1 shrink-0"
          >
            Review
          </button>
          <button
            onClick={() => setBannerDismissed(true)}
            data-testid="office-unfiled-dismiss"
            className="text-[var(--ink-40)] hover:text-[var(--ink-70)] shrink-0"
            title="Dismiss"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 overflow-auto px-2 pb-3">
        {trashOpen ? (
          trashed.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-[var(--ink-40)]" data-testid="office-trash-empty">
              Trash is empty.
            </div>
          ) : (
            <div data-testid="office-trash-list">
              <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-40)]">
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
        ) : activeSmart ? (
          <div data-testid="office-smart-view">
            <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-40)] flex items-center gap-1">
              <Icon name="folder_special" size={11} />
              <span className="truncate">
                {activeSmart.name} —{' '}
                {[...activeSmart.tags, activeSmart.search ? `“${activeSmart.search}”` : '']
                  .filter(Boolean)
                  .join(' + ')}
              </span>
              <button onClick={clearSmart} className="text-[var(--ink-40)] hover:text-accent shrink-0" data-testid="office-smart-clear" title="Close">
                <Icon name="close" size={11} />
              </button>
            </div>
            {smartEntries.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--ink-40)]">
                Nothing matches all of: {activeSmart.tags.join(', ')}.
              </div>
            ) : (
              smartEntries.map((e) => (
                <DriveRow
                  key={e.id}
                  entry={e}
                  active={!!e.docId && active?.id === e.docId}
                  isDropTarget={false}
                  onOpen={() => {
                    if (e.kind === 'folder') {
                      clearSmart()
                      void openFolder(e.id)
                    } else if (e.kind === 'doc' && e.docId) void open(e.docId)
                    else void window.api.files.open(e.id)
                  }}
                  onDelete={() => void remove(e.id)}
                  onTag={() => openTags(e.id)}
                  draggable={false}
                  onDragStart={() => {}}
                />
              ))
            )}
          </div>
        ) : activeTag ? (
          <div data-testid="office-tag-view">
            <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-40)] flex items-center gap-1">
              <Icon name="sell" size={11} />
              <span>Tag: {activeTag}</span>
              <button onClick={clearTag} className="text-[var(--ink-40)] hover:text-accent" data-testid="office-tag-clear" title="Clear tag">
                <Icon name="close" size={11} />
              </button>
            </div>
            {tagEntries.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--ink-40)]">Nothing tagged “{activeTag}” yet.</div>
            ) : (
              tagEntries.map((e) => (
                <DriveRow
                  key={e.id}
                  entry={e}
                  active={!!e.docId && active?.id === e.docId}
                  isDropTarget={false}
                  onOpen={() => {
                    if (e.kind === 'folder') {
                      clearTag()
                      void openFolder(e.id)
                    } else if (e.kind === 'doc' && e.docId) void open(e.docId)
                    else void window.api.files.open(e.id)
                  }}
                  onDelete={() => void remove(e.id)}
                  onTag={() => openTags(e.id)}
                  draggable={false}
                  onDragStart={() => {}}
                />
              ))
            )}
          </div>
        ) : search.trim() ? (
          searchResults.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-[var(--ink-40)]" data-testid="office-search-empty">
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
          <div className="px-2 py-3 text-[12px] text-[var(--ink-40)]">
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
                onTag={() => openTags(e.id)}
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
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--ink-40)]">
                  Not in a folder
                </div>
                {unfiled.map((d) => (
                  <button
                    key={d.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData(ENTRY_MIME, d.id)}
                    onClick={() => void open(d.id)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] truncate ${
                      active?.id === d.id ? 'bg-accent/[0.12] text-accent' : 'hover:bg-[var(--surface-sunken)]'
                    }`}
                  >
                    <Icon name={docIcon(d.docType)} size={14} className="shrink-0 text-[var(--ink-40)]" />
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
  onTag,
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
  onTag?: () => void
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
        active ? 'bg-accent/[0.12] text-accent' : 'hover:bg-[var(--surface-sunken)]'
      } ${isDropTarget ? 'ring-1 ring-accent bg-accent/[0.08]' : ''}`}
    >
      <button onClick={onOpen} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Icon name={icon} size={14} className={`shrink-0 ${isFolder ? 'text-accent' : 'text-[var(--ink-40)]'}`} />
        <span className="truncate">{entry.name || 'Untitled'}</span>
      </button>
      {onShare && (
        <button
          onClick={onShare}
          data-testid={`office-folder-share-${entry.name}`}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-accent shrink-0"
          title="Share folder"
        >
          <Icon name="share" size={13} />
        </button>
      )}
      {onTag && (
        <button
          onClick={onTag}
          data-testid={`office-tagbtn-${entry.name}`}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-accent shrink-0"
          title="Tags"
        >
          <Icon name="sell" size={13} />
        </button>
      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-rose-500 shrink-0"
        title={isFolder ? 'Delete folder' : 'Remove'}
      >
        <Icon name="delete" size={13} />
      </button>
    </div>
  )
}

// A small panel to view and edit one item's tags. Loads the item's current tags,
// shows them as removable chips, and adds a typed tag on Enter. The facet store
// is the single source of truth; this just calls into it and re-reads.
function TagEditor({
  fileId,
  auto,
  onAdd,
  onRemove,
  onClose
}: {
  fileId: string
  auto?: boolean
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onClose: () => void
}): JSX.Element {
  const [current, setCurrent] = useState<Array<{ tag: string; source: 'user' | 'ai' }>>([])
  const [value, setValue] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<Array<{ name: string; isNew: boolean; reason: string }>>([])
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null)

  async function runSuggest(): Promise<void> {
    setSuggesting(true)
    setSuggestMsg(null)
    setSuggestions([])
    try {
      const res = await window.api.files.suggestTags(fileId)
      if (!res.ok) {
        setSuggestMsg(
          res.needsApiKey ? 'Add an Anthropic API key in Settings to use AI filing.' : res.error ?? 'Could not suggest tags.'
        )
        return
      }
      const have = new Set(current.map((c) => c.tag.toLowerCase()))
      const fresh = (res.tags ?? []).filter((t) => !have.has(t.name.toLowerCase()))
      setSuggestions(fresh)
      if (!fresh.length) {
        setSuggestMsg(
          res.tags && res.tags.length ? 'Those tags are already applied.' : 'No confident suggestions — the AI left this one to you.'
        )
      }
    } catch (e) {
      setSuggestMsg((e as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  function accept(name: string): void {
    onAdd(name)
    setSuggestions((s) => s.filter((x) => x.name !== name))
    setCurrent((c) => (c.some((x) => x.tag === name) ? c : [...c, { tag: name, source: 'user' }]))
  }

  const reload = useCallback((): void => {
    void window.api.fileManager.tagsFor(fileId).then(setCurrent).catch(() => setCurrent([]))
  }, [fileId])
  useEffect(reload, [reload])

  // Review flow: run the AI suggestion as soon as the editor opens.
  useEffect(() => {
    if (auto) void runSuggest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, fileId])

  function add(): void {
    const t = value.trim()
    if (!t) return
    onAdd(t)
    setValue('')
    // Optimistic, then re-read so the chip reflects the stored state.
    setCurrent((c) => (c.some((x) => x.tag === t) ? c : [...c, { tag: t, source: 'user' }]))
    setTimeout(reload, 150)
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-2 space-y-1.5" data-testid="office-tag-editor">
      <div className="flex items-center gap-1.5">
        <Icon name="sell" size={12} className="text-accent" />
        <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)] flex-1">Tags</span>
        <button onClick={onClose} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]" data-testid="office-tag-editor-close">
          <Icon name="close" size={13} />
        </button>
      </div>
      {current.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {current.map((t) => (
            <span
              key={t.tag}
              data-testid={`office-tag-chip-${t.tag}`}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                t.source === 'ai'
                  ? 'border-accent/40 bg-accent/[0.06] text-accent'
                  : 'border-[var(--edge-firm)] text-[var(--ink-70)]'
              }`}
              title={t.source === 'ai' ? 'Suggested by AI' : 'Your tag'}
            >
              {t.tag}
              <button
                onClick={() => {
                  onRemove(t.tag)
                  setCurrent((c) => c.filter((x) => x.tag !== t.tag))
                }}
                className="text-[var(--ink-40)] hover:text-rose-500"
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Add a tag, e.g. Acme, Invoices, Q2"
          data-testid="office-tag-add-input"
          className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
        />
        <button onClick={add} disabled={!value.trim()} data-testid="office-tag-add" className="btn-primary text-[12px] px-2.5 py-1 disabled:opacity-50">
          Add
        </button>
      </div>

      {/* Auto-filing: the AI reads the item and proposes tags. Suggest-only —
          you accept each one. It may propose several, because a thing relates to
          several things. */}
      <div className="pt-1.5 border-t border-[var(--edge-soft)]">
        <button
          onClick={() => void runSuggest()}
          disabled={suggesting}
          data-testid="office-tag-suggest"
          className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline disabled:opacity-50"
        >
          <Icon name="auto_awesome" size={13} /> {suggesting ? 'Reading the file…' : 'Suggest tags with AI'}
        </button>
        {suggestMsg && <div className="text-[11px] text-[var(--ink-40)] mt-1">{suggestMsg}</div>}
        {suggestions.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1.5" data-testid="office-tag-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => accept(s.name)}
                data-testid={`office-tag-suggestion-${s.name}`}
                title={s.reason}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-accent/40 bg-accent/[0.06] text-accent hover:bg-accent/[0.14]"
              >
                <Icon name="add" size={11} /> {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
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
      className="group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-[var(--surface-sunken)]"
      data-testid={`office-trash-row-${entry.name}`}
    >
      <Icon name={icon} size={14} className="shrink-0 text-[var(--ink-40)]" />
      <span className="truncate flex-1 text-[var(--ink-50)] line-through decoration-[var(--ink-30)]">
        {entry.name || 'Untitled'}
      </span>
      <button
        onClick={onRestore}
        data-testid={`office-trash-restore-${entry.name}`}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-accent shrink-0"
        title="Restore"
      >
        <Icon name="restore_from_trash" size={14} />
      </button>
      <button
        onClick={onPurge}
        data-testid={`office-trash-purge-${entry.name}`}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--ink-40)] hover:text-rose-500 shrink-0"
        title="Delete forever"
      >
        <Icon name="delete_forever" size={14} />
      </button>
    </div>
  )
}

// Create a smart folder: a name and a set of tags. Files carrying ALL the chosen
// tags will always appear in it, wherever they physically live.
function SmartFolderCreator({
  tags,
  onCreate,
  onClose
}: {
  tags: Array<{ tag: string; count: number }>
  onCreate: (name: string, tags: string[], search: string) => void
  onClose: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const toggle = (t: string): void => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))
  function save(): void {
    if (!selected.length && !searchTerm.trim()) return
    onCreate(name.trim() || selected.join(' + ') || searchTerm.trim(), selected, searchTerm.trim())
  }
  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-2 space-y-1.5" data-testid="office-smart-creator">
      <div className="flex items-center gap-1.5">
        <Icon name="folder_special" size={12} className="text-accent" />
        <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)] flex-1">New smart folder</span>
        <button onClick={onClose} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]">
          <Icon name="close" size={13} />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        data-testid="office-smart-name"
        className="w-full bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
      />
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="And/or a search term (optional)"
        data-testid="office-smart-search"
        className="w-full bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
      />
      <div className="text-[10px] text-[var(--ink-40)]">Shows files matching ALL chosen tags and the search term.</div>
      <div className="flex items-center gap-1 flex-wrap">
        {tags.map((t) => (
          <button
            key={t.tag}
            onClick={() => toggle(t.tag)}
            data-testid={`office-smart-pick-${t.tag}`}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              selected.includes(t.tag)
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-[var(--edge-soft)] text-[var(--ink-70)]'
            }`}
          >
            {t.tag}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={!selected.length && !searchTerm.trim()} data-testid="office-smart-save" className="btn-primary text-[12px] px-2.5 py-1 disabled:opacity-50">
          Create
        </button>
      </div>
    </div>
  )
}
