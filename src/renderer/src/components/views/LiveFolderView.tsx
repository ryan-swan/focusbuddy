import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocCollabStore } from '../../stores/docCollab'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { inviteToLiveDoc, snapshotLiveBody } from '../../lib/docCollabClient'
import { uploadLiveFile } from '../../lib/liveFolderClient'
import {
  childrenOf,
  coerceFolderBody,
  addEntry,
  renameEntry,
  removeEntry,
  descendantIds,
  type FolderBody,
  type FolderEntry
} from '../../lib/liveFolder'
import { openSharedFile, recreateSharedDoc } from '../../lib/liveFolderMirror'
import { useLiveFolderEntriesStore } from '../../stores/liveFolderEntries'
import {
  crdtLiveFolderOpen,
  crdtLiveFolderClose,
  crdtEmitFolderEntryCreate,
  crdtEmitFolderEntryDelete,
  crdtEmitFolderEntryName
} from '../../lib/crdtBridge'
import Icon from '../Icon'

// A LIVE (collaborative) folder — a shared file tree. Its tree syncs per-entry
// through the CRDT substrate (create / delete / name / parent), so everyone with
// access reorganises it concurrently and converges with NO check-out lock. The
// server's body_json is the frozen baseline; the view seeds the local tree from it
// on open, applies live deltas on top, and snapshots the converged tree back
// (debounced, lock-free) so body_json stays current for non-live readers. When the
// substrate engine is off (the '0' opt-out) the emit + join calls are no-ops, so the
// folder degrades to a local-only, still-lock-free view backed by the snapshot-back.

interface Props {
  liveFolderId: string
}

function iconFor(e: FolderEntry): string {
  if (e.kind === 'folder') return 'folder'
  if (e.kind === 'doc') return e.docType === 'sheet' ? 'table_chart' : e.docType === 'slides' ? 'slideshow' : 'description'
  return 'draft'
}

export default function LiveFolderView({ liveFolderId }: Props): JSX.Element {
  const meta = useDocCollabStore((s) => s.meta)
  const bodyObj = useDocCollabStore((s) => s.bodyObj)
  const loading = useDocCollabStore((s) => s.loading)
  const openLive = useDocCollabStore((s) => s.openLive)
  const closeLive = useDocCollabStore((s) => s.closeLive)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const goDocument = useViewStore((s) => s.goDocument)
  const myId = useAccountStore((s) => s.account?.id)
  const token = useAccountStore((s) => s.sessionToken)

  const [cwd, setCwd] = useState<string | null>(null) // current folder id within the body
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [busyMsg, setBusyMsg] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [inviteHandle, setInviteHandle] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The most recent tree awaiting a debounced snapshot-back, so a close mid-debounce
  // still persists the last edit to body_json rather than dropping it.
  const pendingSnapshot = useRef<FolderBody | null>(null)

  // The materialised entries for this folder (undefined until seeded on open).
  const storeEntries = useLiveFolderEntriesStore((s) => s.entries[liveFolderId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // The tree is conflict-free on the substrate; openLive just fetches the
      // folder's meta + baseline body to seed the local tree from.
      await openLive(liveFolderId)
      if (cancelled) return
      const baseline = coerceFolderBody(useDocCollabStore.getState().bodyObj)
      // Seed the local tree from body_json ourselves so it is present even when the
      // substrate engine is off; crdtLiveFolderOpen re-seeds (idempotent) and joins
      // the room when the engine is on.
      useLiveFolderEntriesStore.getState().seed(liveFolderId, baseline?.entries ?? [])
      crdtLiveFolderOpen(liveFolderId, baseline?.entries ?? [])
    })()
    return () => {
      cancelled = true
      // Flush (not drop) a pending snapshot so the last edit reaches body_json.
      if (snapshotTimer.current) {
        clearTimeout(snapshotTimer.current)
        snapshotTimer.current = null
        const tok = useAccountStore.getState().sessionToken
        const pending = pendingSnapshot.current
        if (tok && pending) void snapshotLiveBody(tok, liveFolderId, JSON.stringify(pending))
        pendingSnapshot.current = null
      }
      crdtLiveFolderClose(liveFolderId)
      closeLive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFolderId])

  // The tree is the materialised store (baseline seeded on open + live deltas),
  // falling back to the baseline body until the store is seeded.
  const body: FolderBody | null = useMemo(() => {
    const baseline = coerceFolderBody(bodyObj)
    if (!storeEntries) return baseline
    return {
      version: baseline?.version ?? 1,
      rootName: baseline?.rootName ?? meta?.title ?? 'Shared folder',
      entries: storeEntries
    }
  }, [bodyObj, storeEntries, meta?.title])

  // Breadcrumb chain from root to cwd.
  const crumbs = useMemo(() => {
    if (!body) return [] as Array<{ id: string | null; name: string }>
    const chain: Array<{ id: string | null; name: string }> = []
    let cur: string | null = cwd
    const byId = new Map(body.entries.map((e) => [e.id, e]))
    while (cur) {
      const e = byId.get(cur)
      if (!e) break
      chain.unshift({ id: e.id, name: e.name })
      cur = e.parentId
    }
    chain.unshift({ id: null, name: body.rootName })
    return chain
  }, [body, cwd])

  // If the current folder vanished from under us (a remote edit removed it),
  // fall back to the root so we never render an empty dead level.
  useEffect(() => {
    if (cwd && body && !body.entries.some((e) => e.id === cwd)) setCwd(null)
  }, [cwd, body])

  if (loading || !meta || meta.id !== liveFolderId || !body) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod text-[13px] text-[var(--ink-40)]">
        Loading shared folder…
      </div>
    )
  }

  const isOwner = meta.ownerAccountId === myId
  const entries = childrenOf(body, cwd)

  // Keep body_json (the baseline non-live readers see) current from the converged
  // tree, debounced + lock-free.
  function snapshotBack(next: FolderBody): void {
    if (!token) return
    pendingSnapshot.current = next
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      snapshotTimer.current = null
      pendingSnapshot.current = null
      void snapshotLiveBody(token, liveFolderId, JSON.stringify(next))
    }, 800)
  }

  async function onOpen(e: FolderEntry): Promise<void> {
    setErrMsg(null)
    if (e.kind === 'folder') {
      setCwd(e.id)
      return
    }
    if (e.kind === 'doc') {
      setBusyMsg(`Opening ${e.name}…`)
      const id = await recreateSharedDoc(e)
      setBusyMsg(null)
      if (id) goDocument(id)
      else setErrMsg('Could not open this document.')
      return
    }
    // file
    if (!token) return
    setBusyMsg(`Opening ${e.name}…`)
    const err = await openSharedFile(token, liveFolderId, e)
    setBusyMsg(null)
    if (err) setErrMsg(err)
  }

  function newFolder(): void {
    const name = 'New folder'
    const id = `lf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const entry: FolderEntry = { id, parentId: cwd, kind: 'folder', name }
    useLiveFolderEntriesStore.getState().applyCreate(liveFolderId, entry)
    crdtEmitFolderEntryCreate(liveFolderId, entry)
    snapshotBack(addEntry(body!, entry))
    setRenamingId(id)
    setRenameText(name)
  }

  function startRename(e: FolderEntry): void {
    setRenamingId(e.id)
    setRenameText(e.name)
  }
  function commitRename(): void {
    if (renamingId) {
      const name = renameText.trim() || 'Untitled'
      useLiveFolderEntriesStore.getState().applyName(liveFolderId, renamingId, name)
      crdtEmitFolderEntryName(liveFolderId, renamingId, name)
      snapshotBack(renameEntry(body!, renamingId, name))
    }
    setRenamingId(null)
    setRenameText('')
  }

  function remove(e: FolderEntry): void {
    // A folder delete cascades to its whole subtree (removeEntry semantics), so
    // tombstone every doomed id on all grantees.
    const doomed = [e.id, ...descendantIds(body!, e.id)]
    const st = useLiveFolderEntriesStore.getState()
    for (const id of doomed) st.applyDelete(liveFolderId, id)
    crdtEmitFolderEntryDelete(liveFolderId, doomed)
    snapshotBack(removeEntry(body!, e.id))
  }

  async function onAddFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || !token) return
    setErrMsg(null)
    let next = body!
    let failed = 0
    for (const f of Array.from(files)) {
      setBusyMsg(`Uploading ${f.name}…`)
      const buf = await f.arrayBuffer()
      const dot = f.name.lastIndexOf('.')
      const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
      const blobId = await uploadLiveFile(token, liveFolderId, {
        bytes: buf,
        name: f.name,
        mime: f.type || 'application/octet-stream',
        ext
      })
      if (!blobId) {
        failed++
        continue
      }
      const entry: FolderEntry = {
        id: `lf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: cwd,
        kind: 'file',
        name: f.name,
        blobId,
        mimeType: f.type || 'application/octet-stream',
        ext,
        sizeBytes: f.size
      }
      next = addEntry(next, entry)
      useLiveFolderEntriesStore.getState().applyCreate(liveFolderId, entry)
      crdtEmitFolderEntryCreate(liveFolderId, entry)
    }
    setBusyMsg(null)
    snapshotBack(next)
    if (failed > 0) setErrMsg(`${failed} file${failed === 1 ? '' : 's'} could not be uploaded.`)
  }

  async function sendInvite(): Promise<void> {
    if (!token) return
    const res = await inviteToLiveDoc(token, liveFolderId, inviteHandle.trim())
    setInviteNote(res.ok ? `Invited ${res.member?.handle ?? inviteHandle}` : res.error ?? 'Could not invite that handle.')
    if (res.ok) {
      setInviteHandle('')
      setInviting(false)
    }
  }

  return (
    <div className="h-full flex flex-col desk-paper no-tod">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-[var(--edge-soft)] flex items-center gap-3">
        <button onClick={() => goDocuments()} className="icon-btn" title="Back">
          <Icon name="arrow_back" size={17} />
        </button>
        <Icon name="folder_shared" size={16} className="text-accent shrink-0" />
        <span className="flex-1 min-w-0 text-[14px] font-semibold text-[var(--ink-100)] truncate">
          {meta.title}
        </span>
        <span className="text-[11px] text-[var(--ink-40)] shrink-0">Live folder</span>
        {isOwner && (
          <button onClick={() => setInviting((v) => !v)} className="icon-btn" title="Invite someone" data-testid="livefolder-invite">
            <Icon name="person_add" size={15} />
          </button>
        )}
      </div>

      {/* Collaboration status strip. The folder converges on the substrate, so there
          is no single writer — everyone can organise it together. */}
      <div
        className="shrink-0 px-4 py-1.5 text-[12px] flex items-center gap-2 border-b bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200"
        data-testid="livefolder-status"
      >
        <Icon name="group" size={14} />
        <span data-testid="livefolder-live">Live folder. Everyone here can organise it together, changes sync as you go.</span>
      </div>

      {inviting && (
        <div className="shrink-0 px-4 py-2 border-b border-[var(--edge-soft)] flex items-center gap-2">
          <input
            value={inviteHandle}
            onChange={(e) => setInviteHandle(e.target.value)}
            placeholder="Invite by handle, e.g. @alex"
            className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-accent"
            data-testid="livefolder-invite-handle"
          />
          <button onClick={() => void sendInvite()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livefolder-invite-send">
            Invite
          </button>
          {inviteNote && <span className="text-[11px] text-[var(--ink-50)]">{inviteNote}</span>}
        </div>
      )}

      {/* Breadcrumbs + edit toolbar */}
      <div className="shrink-0 px-4 py-2 border-b border-[var(--edge-soft)] flex items-center gap-2 text-[12px]">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          {crumbs.map((c, i) => (
            <span key={c.id ?? 'root'} className="inline-flex items-center gap-1 min-w-0">
              {i > 0 && <Icon name="chevron_right" size={13} className="text-[var(--ink-30)] shrink-0" />}
              <button
                onClick={() => setCwd(c.id)}
                className={`truncate hover:text-accent ${i === crumbs.length - 1 ? 'font-medium text-[var(--ink-90)]' : 'text-[var(--ink-50)]'}`}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={newFolder} className="icon-btn" title="New folder" data-testid="livefolder-newfolder">
            <Icon name="create_new_folder" size={16} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="icon-btn" title="Add files" data-testid="livefolder-addfiles">
            <Icon name="upload_file" size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void onAddFiles(e.target.files).then(() => { if (fileInputRef.current) fileInputRef.current.value = '' })}
          />
        </div>
      </div>

      {(busyMsg || errMsg) && (
        <div className="shrink-0 px-4 py-1.5 text-[12px] border-b border-[var(--edge-soft)]">
          {busyMsg && <span className="text-[var(--ink-50)]">{busyMsg}</span>}
          {errMsg && <span className="text-red-500" data-testid="livefolder-error">{errMsg}</span>}
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 overflow-auto px-2 py-2" data-testid="livefolder-entries">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-[var(--ink-40)]">This folder is empty.</div>
        ) : (
          <div className="space-y-0.5">
            {entries.map((e) => (
              <div
                key={e.id}
                className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[var(--surface-sunken)]/70"
                data-testid="livefolder-entry"
              >
                <Icon name={iconFor(e)} size={18} className={e.kind === 'folder' ? 'text-accent' : 'text-[var(--ink-40)]'} />
                {renamingId === e.id ? (
                  <input
                    autoFocus
                    data-testid="livefolder-rename-input"
                    value={renameText}
                    onChange={(ev) => setRenameText(ev.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') commitRename()
                      if (ev.key === 'Escape') {
                        setRenamingId(null)
                        setRenameText('')
                      }
                    }}
                    className="flex-1 bg-[var(--surface-raised)] border border-accent rounded px-1.5 py-0.5 text-[13px] focus:outline-none"
                  />
                ) : (
                  <button onClick={() => void onOpen(e)} className="flex-1 min-w-0 text-left text-[13px] text-[var(--ink-90)] truncate">
                    {e.name}
                    {e.kind === 'file' && !e.blobId && (
                      <span className="ml-2 text-[10px] text-amber-500">not uploaded</span>
                    )}
                  </button>
                )}
                {renamingId !== e.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition">
                    <button onClick={() => startRename(e)} className="icon-btn" title="Rename" data-testid="livefolder-rename">
                      <Icon name="edit" size={14} />
                    </button>
                    <button onClick={() => remove(e)} className="icon-btn" title="Delete" data-testid="livefolder-delete">
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
