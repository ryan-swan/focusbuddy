import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocCollabStore } from '../../stores/docCollab'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { inviteToLiveDoc } from '../../lib/docCollabClient'
import { personDisplayName } from '../../lib/personName'
import { uploadLiveFile } from '../../lib/liveFolderClient'
import {
  childrenOf,
  coerceFolderBody,
  addEntry,
  renameEntry,
  removeEntry,
  type FolderBody,
  type FolderEntry
} from '../../lib/liveFolder'
import { openSharedFile, recreateSharedDoc } from '../../lib/liveFolderMirror'
import Icon from '../Icon'

// A LIVE (collaborative) folder — a shared file tree under the same check-out
// model as live documents. The body holds the whole tree; this view renders it
// directly. Anyone may browse and open contents (files download on demand, docs
// open as a local copy). Reorganising the structure requires holding the lock;
// the takeover handshake hands editing over exactly like live docs.

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
  const lock = useDocCollabStore((s) => s.lock)
  const isHolder = useDocCollabStore((s) => s.isHolder)
  const loading = useDocCollabStore((s) => s.loading)
  const saving = useDocCollabStore((s) => s.saving)
  const openLive = useDocCollabStore((s) => s.openLive)
  const closeLive = useDocCollabStore((s) => s.closeLive)
  const acquire = useDocCollabStore((s) => s.acquire)
  const saveBody = useDocCollabStore((s) => s.saveBody)
  const requestTakeoverForOpen = useDocCollabStore((s) => s.requestTakeoverForOpen)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const goDocument = useViewStore((s) => s.goDocument)
  const myId = useAccountStore((s) => s.account?.id)
  const token = useAccountStore((s) => s.sessionToken)

  const [cwd, setCwd] = useState<string | null>(null) // current folder id within the body
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [busyMsg, setBusyMsg] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestMsg, setRequestMsg] = useState('')
  const [requested, setRequested] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteHandle, setInviteHandle] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void openLive(liveFolderId)
    return () => closeLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFolderId])

  const body: FolderBody | null = useMemo(() => coerceFolderBody(bodyObj), [bodyObj])

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
  const holderHandle = lock?.holder ? personDisplayName(lock.holder, lock.holder.handle) : null
  const lockedByOther = !!lock?.holder && lock.holder.accountId !== myId
  const entries = childrenOf(body, cwd)

  function commitBody(next: FolderBody): void {
    saveBody(next)
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
    commitBody(addEntry(body!, { id, parentId: cwd, kind: 'folder', name }))
    setRenamingId(id)
    setRenameText(name)
  }

  function startRename(e: FolderEntry): void {
    setRenamingId(e.id)
    setRenameText(e.name)
  }
  function commitRename(): void {
    if (renamingId) commitBody(renameEntry(body!, renamingId, renameText))
    setRenamingId(null)
    setRenameText('')
  }

  function remove(e: FolderEntry): void {
    commitBody(removeEntry(body!, e.id))
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
      next = addEntry(next, {
        id: `lf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: cwd,
        kind: 'file',
        name: f.name,
        blobId,
        mimeType: f.type || 'application/octet-stream',
        ext,
        sizeBytes: f.size
      })
    }
    setBusyMsg(null)
    commitBody(next)
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
  async function sendRequest(): Promise<void> {
    await requestTakeoverForOpen(requestMsg.trim())
    setRequesting(false)
    setRequested(true)
    setRequestMsg('')
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
        {isHolder && (
          <span className="text-[11px] text-[var(--ink-40)] inline-flex items-center gap-1 shrink-0">
            <Icon name={saving ? 'sync' : 'cloud_done'} size={13} className={saving ? 'animate-spin' : 'text-emerald-500'} />
            {saving ? 'Saving' : 'Saved'}
          </span>
        )}
        <span className="text-[11px] text-[var(--ink-40)] shrink-0">Live folder</span>
        {isOwner && (
          <button onClick={() => setInviting((v) => !v)} className="icon-btn" title="Invite someone" data-testid="livefolder-invite">
            <Icon name="person_add" size={15} />
          </button>
        )}
      </div>

      {/* Collaboration status strip */}
      <div
        className={`shrink-0 px-4 py-1.5 text-[12px] flex items-center gap-2 border-b ${
          lockedByOther
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200'
        }`}
        data-testid="livefolder-status"
      >
        {lockedByOther ? (
          <>
            <Icon name="lock" size={14} />
            <span data-testid="livefolder-locked">Organising — locked by {holderHandle}. You can still open files.</span>
            <div className="ml-auto flex items-center gap-2">
              {requested ? (
                <span className="text-[11px] opacity-80">Access requested</span>
              ) : (
                <button
                  onClick={() => setRequesting((v) => !v)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-600 text-white hover:brightness-110"
                  data-testid="livefolder-request"
                >
                  Request access
                </button>
              )}
            </div>
          </>
        ) : isHolder ? (
          <>
            <Icon name="edit" size={14} />
            <span>You're organising this folder. Others can open files but not rearrange until you leave.</span>
          </>
        ) : (
          <>
            <Icon name="lock_open" size={14} />
            <span>No one is organising it. Open files freely, or check out to rearrange.</span>
            <button
              onClick={() => void acquire()}
              className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-600 text-white hover:brightness-110"
              data-testid="livefolder-checkout"
            >
              Check out to organise
            </button>
          </>
        )}
      </div>

      {requesting && (
        <div className="shrink-0 px-4 py-2 border-b border-[var(--edge-soft)] flex items-center gap-2">
          <input
            value={requestMsg}
            onChange={(e) => setRequestMsg(e.target.value)}
            placeholder={`Message to ${holderHandle ?? 'the editor'} (optional)`}
            className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-accent"
            data-testid="livefolder-request-message"
          />
          <button onClick={() => void sendRequest()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livefolder-request-send">
            Send request
          </button>
        </div>
      )}

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

      {/* Breadcrumbs + holder toolbar */}
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
        {isHolder && (
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
        )}
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
                {isHolder && renamingId !== e.id && (
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
