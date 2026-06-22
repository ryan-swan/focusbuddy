import { useEffect, useRef, useState } from 'react'
import type { SheetBody, SlidesBody, MapBody } from '@shared/types'
import { useDocCollabStore } from '../../stores/docCollab'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { inviteToLiveDoc } from '../../lib/docCollabClient'
import { listTeams, inviteTeamToDoc, type Team } from '../../lib/teamsClient'
import { DocEditor, SheetEditor, SlidesEditor, MapEditor } from '@office'
import Icon from '../Icon'
import CollaboratorBar from './CollaboratorBar'
import { collaborators } from '../../lib/presence'

// Editor for a LIVE (collaborative) document. The body lives on the server; this
// view checks the doc out (acquires the edit lock) and, while it holds the lock,
// autosaves to the server with a heartbeat. When someone else holds the lock the
// surface is read-only (marked inert) with a banner and a "Request access"
// button; the takeover handshake transfers the lock without losing anyone's work.

interface Props {
  liveDocId: string
  // Where "back" goes. Defaults to the desk's Documents view; PlexiOffice passes
  // its own handler since it has no desk routing.
  onBack?: () => void
}

export default function LiveDocEditorView({ liveDocId, onBack }: Props): JSX.Element {
  const meta = useDocCollabStore((s) => s.meta)
  const bodyObj = useDocCollabStore((s) => s.bodyObj)
  const lock = useDocCollabStore((s) => s.lock)
  const isHolder = useDocCollabStore((s) => s.isHolder)
  const loading = useDocCollabStore((s) => s.loading)
  const saving = useDocCollabStore((s) => s.saving)
  const openLive = useDocCollabStore((s) => s.openLive)
  const closeLive = useDocCollabStore((s) => s.closeLive)
  const saveBody = useDocCollabStore((s) => s.saveBody)
  const acquire = useDocCollabStore((s) => s.acquire)
  const requestTakeoverForOpen = useDocCollabStore((s) => s.requestTakeoverForOpen)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const back = onBack ?? goDocuments
  const myId = useAccountStore((s) => s.account?.id)
  const token = useAccountStore((s) => s.sessionToken)

  const [requesting, setRequesting] = useState(false)
  const [requestMsg, setRequestMsg] = useState('')
  const [requested, setRequested] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteHandle, setInviteHandle] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void openLive(liveDocId)
    return () => closeLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDocId])

  // Enforce read-only for non-holders by marking the editor subtree inert (the
  // server also rejects writes without the lock, so this is belt-and-braces).
  useEffect(() => {
    const el = surfaceRef.current
    if (el) (el as unknown as { inert: boolean }).inert = !isHolder
  }, [isHolder, meta, bodyObj])

  // Load the owner's teams when the invite panel opens, so they can invite a whole
  // team at once. Above the early return to keep hook order stable.
  useEffect(() => {
    if (inviting && token) void listTeams(token).then(setTeams).catch(() => setTeams([]))
  }, [inviting, token])

  if (loading || !meta || meta.id !== liveDocId) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod text-[13px] text-stone-400">
        Loading shared document…
      </div>
    )
  }

  const typeLabel =
    meta.docType === 'doc'
      ? 'Document'
      : meta.docType === 'sheet'
        ? 'Spreadsheet'
        : meta.docType === 'slides'
          ? 'Slides'
          : 'Map'
  const typeIcon =
    meta.docType === 'doc'
      ? 'description'
      : meta.docType === 'sheet'
        ? 'table_chart'
        : meta.docType === 'slides'
          ? 'slideshow'
          : 'account_tree'
  const isOwner = meta.ownerAccountId === myId
  const holderHandle = lock?.holder?.handle ?? null
  const lockedByOther = !!lock?.holder && lock.holder.accountId !== myId
  // Awareness: who has access, with the live editor (lock holder) highlighted.
  const people = collaborators(meta.members ?? [], lock, myId ?? null)

  async function sendInvite(): Promise<void> {
    if (!token) return
    const res = await inviteToLiveDoc(token, liveDocId, inviteHandle.trim())
    setInviteNote(res.ok ? `Invited ${res.member?.handle ?? inviteHandle}` : res.error ?? 'Could not invite that handle.')
    if (res.ok) {
      setInviteHandle('')
      setInviting(false)
    }
  }

  async function inviteTeam(teamId: string): Promise<void> {
    if (!token) return
    const res = await inviteTeamToDoc(token, liveDocId, teamId)
    setInviteNote(res.ok ? `Invited the team (${res.invited ?? 0} members)` : res.error ?? 'Could not invite that team.')
    if (res.ok) setInviting(false)
  }

  async function sendRequest(): Promise<void> {
    await requestTakeoverForOpen(requestMsg.trim())
    setRequesting(false)
    setRequested(true)
    setRequestMsg('')
  }

  // Re-key the editor on remote version changes for read-only viewers so pushed
  // updates show; keep it stable for the holder so typing never loses the cursor.
  const editorKey = `${meta.id}:${isHolder ? 'edit' : `v${meta.version}`}`

  return (
    <div className="h-full flex flex-col desk-paper no-tod">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3">
        <button onClick={() => back()} className="icon-btn" title="Back">
          <Icon name="arrow_back" size={17} />
        </button>
        <Icon name={typeIcon} size={16} className="text-accent shrink-0" />
        <span className="flex-1 min-w-0 text-[14px] font-semibold text-stone-900 dark:text-stone-100 truncate">
          {meta.title}
        </span>
        <CollaboratorBar people={people} />
        {isHolder && (
          <span className="text-[11px] text-stone-400 dark:text-stone-500 inline-flex items-center gap-1 shrink-0">
            <Icon name={saving ? 'sync' : 'cloud_done'} size={13} className={saving ? 'animate-spin' : 'text-emerald-500'} />
            {saving ? 'Saving' : 'Saved'}
          </span>
        )}
        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">{typeLabel}</span>
        {isOwner && (
          <button onClick={() => setInviting((v) => !v)} className="icon-btn" title="Invite someone" data-testid="livedoc-invite">
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
        data-testid="livedoc-status"
      >
        {lockedByOther ? (
          <>
            <Icon name="lock" size={14} />
            <span data-testid="livedoc-locked">Editing — locked by {holderHandle}</span>
            <div className="ml-auto flex items-center gap-2">
              {requested ? (
                <span className="text-[11px] opacity-80">Access requested</span>
              ) : (
                <button
                  onClick={() => setRequesting((v) => !v)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-600 text-white hover:brightness-110"
                  data-testid="livedoc-request"
                >
                  Request access
                </button>
              )}
            </div>
          </>
        ) : isHolder ? (
          <>
            <Icon name="edit" size={14} />
            <span>You're editing. Others see it locked until you leave.</span>
          </>
        ) : (
          <>
            <Icon name="lock_open" size={14} />
            <span>No one is editing.</span>
            <button
              onClick={() => void acquire()}
              className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-600 text-white hover:brightness-110"
              data-testid="livedoc-checkout"
            >
              Check out to edit
            </button>
          </>
        )}
      </div>

      {requesting && (
        <div className="shrink-0 px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2">
          <input
            value={requestMsg}
            onChange={(e) => setRequestMsg(e.target.value)}
            placeholder={`Message to ${holderHandle ?? 'the editor'} (optional)`}
            className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-accent"
            data-testid="livedoc-request-message"
          />
          <button onClick={() => void sendRequest()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livedoc-request-send">
            Send request
          </button>
        </div>
      )}

      {inviting && (
        <div className="shrink-0 px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2">
          <input
            value={inviteHandle}
            onChange={(e) => setInviteHandle(e.target.value)}
            placeholder="Invite by handle, e.g. @alex"
            className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-accent"
            data-testid="livedoc-invite-handle"
          />
          <button onClick={() => void sendInvite()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livedoc-invite-send">
            Invite
          </button>
          {inviteNote && <span className="text-[11px] text-stone-500 dark:text-stone-400">{inviteNote}</span>}
          {teams.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-stone-400">or a team:</span>
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void inviteTeam(t.id)}
                  data-testid={`livedoc-invite-team-${t.id}`}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-stone-200 dark:border-stone-700 hover:border-accent hover:text-accent"
                >
                  <Icon name="group" size={12} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Surface — inert (read-only) unless we hold the lock */}
      <div className="flex-1 overflow-auto min-h-0" ref={surfaceRef}>
        {meta.docType === 'doc' && (
          <DocEditor key={editorKey} content={bodyObj} title={meta.title} onChange={(json) => saveBody(json)} />
        )}
        {meta.docType === 'sheet' && (
          <SheetEditor key={editorKey} body={bodyObj as SheetBody} title={meta.title} onChange={(b) => saveBody(b)} />
        )}
        {meta.docType === 'slides' && (
          <SlidesEditor key={editorKey} body={bodyObj as SlidesBody} title={meta.title} onChange={(b) => saveBody(b)} />
        )}
        {meta.docType === 'map' && (
          <MapEditor key={editorKey} body={bodyObj as MapBody} title={meta.title} onChange={(b) => saveBody(b)} />
        )}
      </div>
    </div>
  )
}
