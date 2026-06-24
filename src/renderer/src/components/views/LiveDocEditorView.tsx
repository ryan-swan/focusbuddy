import { useEffect, useRef, useState } from 'react'
import type { SheetBody, SlidesBody, MapBody } from '@shared/types'
import { useDocCollabStore } from '../../stores/docCollab'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import {
  inviteToLiveDoc,
  snapshotLiveBody,
  listComments,
  addComment,
  resolveComment,
  deleteComment,
  type DocComment
} from '../../lib/docCollabClient'
import { setDocCommentHandler } from '../../lib/messagingSocket'
import CommentsPanel from './CommentsPanel'
import type { Editor } from '@tiptap/react'
import { listTeams, inviteTeamToDoc, type Team } from '../../lib/teamsClient'
import { DocEditor, SheetEditor, SlidesEditor, MapEditor } from '@office'
import Icon from '../Icon'
import CollaboratorBar from './CollaboratorBar'
import { collaborators } from '../../lib/presence'
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import { buildDocExtensions } from '../documents/editor/extensions'
import { parseDocBody } from '../documents/editor/headingStyles'
import { seedYDocFromPm } from '../../lib/yjsSeed'
import { reconcileMap, yToJson } from '../../lib/yjsJson'
import { YjsDocSync } from '../../lib/yjsDocSync'
import { sendSocketMessage, setYjsSocketHandler, setSocketOpenHandler } from '../../lib/messagingSocket'

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
  // Real-time co-editing for documents (other types still use check-out). We hold
  // the Y.Doc + provider in a ref and flip a state flag once it's live so the
  // editor re-renders with it.
  const collabRef = useRef<{ docId: string; ydoc: Y.Doc; sync: YjsDocSync } | null>(null)
  const [collabReady, setCollabReady] = useState(false)
  // Debounce the body snapshot so co-editing writes storage at most every few
  // seconds, not on every keystroke.
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Comments: the live editor instance (to anchor marks + jump), the threads,
  // the panel toggle, and the in-progress new-comment composer.
  const [editor, setEditor] = useState<Editor | null>(null)
  const [comments, setComments] = useState<DocComment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [composing, setComposing] = useState<{ from: number; to: number } | null>(null)
  const [composeText, setComposeText] = useState('')
  // JSON-body co-editing for sheets/slides (the doc path uses the Tiptap binding
  // above). The Y.Doc holds the body via the reconcile engine; remote changes
  // refresh collabBody + bump collabVersion (which re-keys the editor), while
  // local edits reconcile in under a private origin so they don't re-key.
  const jsonCollabRef = useRef<{ docId: string; ydoc: Y.Doc; sync: YjsDocSync; root: Y.Map<unknown> } | null>(null)
  const localOriginRef = useRef<object>({})
  const [collabBody, setCollabBody] = useState<unknown>(null)
  const [collabVersion, setCollabVersion] = useState(0)

  useEffect(() => {
    void openLive(liveDocId)
    return () => closeLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDocId])

  // Stand up the CRDT session for documents once the doc has loaded. The provider
  // joins the server room and replays the log; if nothing replays (a fresh doc),
  // onFirstSync seeds it from the body — idempotently, so a join race can't double
  // the content. Other members' edits arrive through the same socket.
  useEffect(() => {
    if (!meta || meta.id !== liveDocId || meta.docType !== 'doc') return
    if (collabRef.current?.docId === liveDocId) return
    const ydoc = new Y.Doc()
    const seed = (): void => {
      try {
        const body = useDocCollabStore.getState().bodyObj
        const pm = (parseDocBody(body).doc as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] }
        seedYDocFromPm(ydoc, pm, getSchema(buildDocExtensions({ interactive: false })))
      } catch {
        /* best-effort seed; an empty doc is recoverable, a duplicated one is not */
      }
    }
    const sync = new YjsDocSync(liveDocId, ydoc, sendSocketMessage, seed)
    setYjsSocketHandler((e) => sync.handleMessage(e))
    // On every (re)connect, re-join the room and push our state so a dropped
    // socket doesn't silently end co-editing or lose offline edits.
    setSocketOpenHandler(() => sync.rejoin())
    collabRef.current = { docId: liveDocId, ydoc, sync }
    setCollabReady(true)
    return () => {
      setYjsSocketHandler(null)
      setSocketOpenHandler(null)
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
      sync.destroy()
      ydoc.destroy()
      collabRef.current = null
      setCollabReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.id, meta?.docType, liveDocId])

  // Load comments for the open document and apply live changes from the socket.
  useEffect(() => {
    if (!meta || meta.id !== liveDocId || meta.docType !== 'doc') return
    const tok = useAccountStore.getState().sessionToken
    if (tok) void listComments(tok, liveDocId).then(setComments).catch(() => setComments([]))
    setDocCommentHandler((e) => {
      if (e.docId !== liveDocId) return
      setComments((prev) => {
        if (e.action === 'deleted') return prev.filter((c) => c.id !== e.comment.id && c.parentId !== e.comment.id)
        return [...prev.filter((c) => c.id !== e.comment.id), e.comment]
      })
    })
    return () => setDocCommentHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.id, meta?.docType, liveDocId])

  // CRDT session for sheets/slides via the JSON reconcile engine.
  useEffect(() => {
    if (!meta || meta.id !== liveDocId || !(meta.docType === 'sheet' || meta.docType === 'slides')) return
    if (jsonCollabRef.current?.docId === liveDocId) return
    const ydoc = new Y.Doc()
    const root = ydoc.getMap('root')
    const LOCAL = {}
    localOriginRef.current = LOCAL
    const refresh = (): void => {
      setCollabBody(yToJson(root))
      setCollabVersion((v) => v + 1)
    }
    // Remote changes (origin not our local marker) refresh + re-key the editor.
    const observer = (_events: unknown, txn: { origin: unknown }): void => {
      if (txn.origin === LOCAL) return
      refresh()
    }
    root.observeDeep(observer)
    const seed = (): void => {
      if (root.size > 0) {
        refresh()
        return
      }
      const body = useDocCollabStore.getState().bodyObj
      if (body && typeof body === 'object') {
        Y.transact(ydoc, () => reconcileMap(root, body as Record<string, unknown>), LOCAL)
      }
      refresh()
    }
    const sync = new YjsDocSync(liveDocId, ydoc, sendSocketMessage, seed)
    setYjsSocketHandler((e) => sync.handleMessage(e))
    setSocketOpenHandler(() => sync.rejoin())
    jsonCollabRef.current = { docId: liveDocId, ydoc, sync, root }
    return () => {
      root.unobserveDeep(observer)
      setYjsSocketHandler(null)
      setSocketOpenHandler(null)
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
      sync.destroy()
      ydoc.destroy()
      jsonCollabRef.current = null
      setCollabBody(null)
      setCollabVersion(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.id, meta?.docType, liveDocId])

  // Enforce read-only for non-holders by marking the editor subtree inert (the
  // server also rejects writes without the lock, so this is belt-and-braces).
  useEffect(() => {
    const el = surfaceRef.current
    // Docs, sheets and slides are concurrently editable by everyone (CRDT), so
    // never inert. Other types keep the single-writer lock.
    const co = meta?.docType === 'doc' || meta?.docType === 'sheet' || meta?.docType === 'slides'
    if (el) (el as unknown as { inert: boolean }).inert = co ? false : !isHolder
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
  // Docs, sheets and slides co-edit in real time (no lock); maps still check out.
  const liveCoEdit = meta.docType === 'doc' || meta.docType === 'sheet' || meta.docType === 'slides'
  // Comments are a document-only feature for now.
  const canComment = meta.docType === 'doc'
  // Awareness: who has access, with the live editor (lock holder) highlighted.
  const people = collaborators(meta.members ?? [], lock, myId ?? null)
  // The label + colour shown on my caret to the other editors.
  const me = people.find((p) => p.you)
  const meUser = { name: me?.handle ?? 'You', color: me?.color ?? '#888888' }

  // Snapshot the live Yjs content back to stored body_json (debounced), so
  // exports and non-live views of this doc track what people are typing.
  function scheduleSnapshot(json: unknown): void {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      const tok = useAccountStore.getState().sessionToken
      if (tok) void snapshotLiveBody(tok, liveDocId, JSON.stringify(json))
    }, 3000)
  }

  // A local sheet/slides edit: reconcile the new body into the CRDT (private
  // origin so it doesn't re-key us) and snapshot it to storage.
  function onJsonChange(body: unknown): void {
    const ref = jsonCollabRef.current
    if (!ref || !body || typeof body !== 'object') return
    Y.transact(ref.ydoc, () => reconcileMap(ref.root, body as Record<string, unknown>), localOriginRef.current)
    scheduleSnapshot(body)
  }

  // Resolve an author id to a handle for the panel (members cover comment authors).
  const handleOf = (id: string): string => people.find((p) => p.accountId === id)?.handle ?? id

  // Start a comment on the current selection: capture the range and open the
  // composer. Applying the mark waits until the body is typed and saved.
  function startComment(): void {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    if (empty) return
    setCommentsOpen(true)
    setComposing({ from, to })
    setComposeText('')
  }

  async function submitComment(): Promise<void> {
    const text = composeText.trim()
    const tok = useAccountStore.getState().sessionToken
    if (!editor || !composing || !text || !tok) return
    const id = 'cmt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    editor.chain().setTextSelection({ from: composing.from, to: composing.to }).setComment(id).run()
    const created = await addComment(tok, liveDocId, text, { id })
    if (created) setComments((prev) => [...prev.filter((c) => c.id !== created.id), created])
    else editor.commands.unsetComment(id) // save failed — drop the orphan mark
    setComposing(null)
    setComposeText('')
  }

  async function replyToComment(rootId: string, body: string): Promise<void> {
    const tok = useAccountStore.getState().sessionToken
    if (!tok) return
    const created = await addComment(tok, liveDocId, body, { parentId: rootId })
    if (created) setComments((prev) => [...prev.filter((c) => c.id !== created.id), created])
  }

  async function resolveThread(rootId: string, resolved: boolean): Promise<void> {
    const tok = useAccountStore.getState().sessionToken
    if (!tok) return
    setComments((prev) => prev.map((c) => (c.id === rootId ? { ...c, resolved } : c)))
    if (resolved) editor?.commands.unsetComment(rootId) // clear the highlight when resolved
    await resolveComment(tok, rootId, resolved)
  }

  async function removeComment(commentId: string): Promise<void> {
    const tok = useAccountStore.getState().sessionToken
    if (!tok) return
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId))
    editor?.commands.unsetComment(commentId)
    await deleteComment(tok, commentId)
  }

  function jumpToComment(commentId: string): void {
    if (!editor) return
    let found: { from: number; to: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText) return
      if (node.marks.some((m) => m.type.name === 'comment' && m.attrs.commentId === commentId)) {
        found = { from: pos, to: pos + node.nodeSize }
      }
    })
    if (found) editor.chain().setTextSelection(found).scrollIntoView().focus().run()
  }

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
        {canComment && (
          <>
            <button
              onClick={startComment}
              className="icon-btn text-stone-400 hover:text-accent"
              title="Comment on the selected text"
              data-testid="livedoc-comment-add"
            >
              <Icon name="add_comment" size={16} />
            </button>
            <button
              onClick={() => setCommentsOpen((v) => !v)}
              className="icon-btn text-stone-400 hover:text-accent inline-flex items-center"
              title="Comments"
              data-testid="livedoc-comments-toggle"
            >
              <Icon name="comment" size={16} />
              {comments.filter((c) => !c.parentId && !c.resolved).length > 0 && (
                <span className="ml-0.5 text-[10px] font-semibold text-accent">
                  {comments.filter((c) => !c.parentId && !c.resolved).length}
                </span>
              )}
            </button>
          </>
        )}
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
          lockedByOther && !liveCoEdit
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200'
        }`}
        data-testid="livedoc-status"
      >
        {liveCoEdit ? (
          <>
            <Icon name="bolt" size={14} />
            <span data-testid="livedoc-live">Live — everyone here can edit together.</span>
          </>
        ) : lockedByOther ? (
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

      {composing && (
        <div className="shrink-0 px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/20">
          <Icon name="add_comment" size={14} className="text-amber-600 shrink-0" />
          <input
            autoFocus
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitComment()
              if (e.key === 'Escape') setComposing(null)
            }}
            placeholder="Comment on the selected text…"
            data-testid="livedoc-comment-input"
            className="flex-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => void submitComment()}
            disabled={!composeText.trim()}
            className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50"
            data-testid="livedoc-comment-submit"
          >
            Comment
          </button>
          <button onClick={() => setComposing(null)} className="icon-btn" aria-label="Cancel">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Surface + comments panel */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-auto min-h-0" ref={surfaceRef}>
        {meta.docType === 'doc' &&
          (collabReady && collabRef.current ? (
            // Real-time: the CRDT owns the content, edits flow through the Yjs doc.
            <DocEditor
              key={`${meta.id}:collab`}
              content={bodyObj}
              title={meta.title}
              onChange={scheduleSnapshot}
              ydoc={collabRef.current.ydoc}
              awareness={collabRef.current.sync.awareness}
              user={meUser}
              onEditorReady={setEditor}
            />
          ) : (
            <div className="p-6 text-[13px] text-stone-400" data-testid="livedoc-connecting">
              Connecting live editing…
            </div>
          ))}
        {meta.docType === 'sheet' &&
          (collabBody !== null ? (
            <SheetEditor key={`${meta.id}:c${collabVersion}`} body={collabBody as SheetBody} title={meta.title} onChange={onJsonChange} />
          ) : (
            <div className="p-6 text-[13px] text-stone-400" data-testid="livedoc-connecting">Connecting live editing…</div>
          ))}
        {meta.docType === 'slides' &&
          (collabBody !== null ? (
            <SlidesEditor key={`${meta.id}:c${collabVersion}`} body={collabBody as SlidesBody} title={meta.title} onChange={onJsonChange} />
          ) : (
            <div className="p-6 text-[13px] text-stone-400">Connecting live editing…</div>
          ))}
        {meta.docType === 'map' && (
          <MapEditor key={editorKey} body={bodyObj as MapBody} title={meta.title} onChange={(b) => saveBody(b)} />
        )}
        </div>
        {canComment && commentsOpen && (
          <CommentsPanel
            comments={comments}
            myId={myId ?? null}
            handleOf={handleOf}
            onReply={(rootId, body) => void replyToComment(rootId, body)}
            onResolve={(rootId, resolved) => void resolveThread(rootId, resolved)}
            onDelete={(id) => void removeComment(id)}
            onJump={jumpToComment}
            onClose={() => setCommentsOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
