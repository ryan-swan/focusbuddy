import { useEffect, useRef, useState } from 'react'
import { useDocCollabStore } from '../../stores/docCollab'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { useNodeStore } from '../../stores/nodes'
import { useWidgetStore } from '../../stores/widgets'
import { useLinksStore } from '../../stores/links'
import { inviteToLiveDoc } from '../../lib/docCollabClient'
import { applyCanvasBodyToTask, coerceCanvasBody, serializeCanvasBody } from '../../lib/liveCanvas'
import { ensureMirrorTask } from '../../lib/liveCanvasMirror'
import Canvas from '../Canvas'
import Icon from '../Icon'

// A LIVE (collaborative) canvas — a whole desk shared under the same check-out
// model as live documents. The canonical board lives on the signal server; this
// view mirrors it into a hidden local task and renders it with the normal
// Canvas. While we hold the lock the surface is editable and every board change
// is serialized back to the server (debounced); when someone else holds it the
// surface is read-only (inert) with a banner + "Request access", and the
// takeover handshake hands the lock over without losing work.

interface Props {
  liveCanvasId: string
}

export default function LiveCanvasView({ liveCanvasId }: Props): JSX.Element {
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
  const setActive = useNodeStore((s) => s.setActive)
  const myId = useAccountStore((s) => s.account?.id)
  const token = useAccountStore((s) => s.sessionToken)

  const [mirrorId, setMirrorId] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestMsg, setRequestMsg] = useState('')
  const [requested, setRequested] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteHandle, setInviteHandle] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const prevActiveRef = useRef<string | null>(null)
  // True while we are programmatically rebuilding the mirror, so the holder's
  // edit-watcher doesn't mistake a rebuild for a user edit and echo it back.
  const applyingRef = useRef(false)
  // Last body version we materialised into the mirror, so we only rebuild when
  // the server actually moved forward.
  const appliedVersionRef = useRef<number>(-1)

  // Open the live entity + set up the mirror on mount; restore + release on
  // unmount.
  useEffect(() => {
    let cancelled = false
    prevActiveRef.current = useNodeStore.getState().activeTaskId
    void (async () => {
      await openLive(liveCanvasId)
      if (cancelled) return
      const m = useDocCollabStore.getState().meta
      const id = await ensureMirrorTask(liveCanvasId, m?.title || 'Live canvas')
      if (cancelled) return
      appliedVersionRef.current = -1
      setMirrorId(id)
      setActive(id)
    })()
    return () => {
      cancelled = true
      setActive(prevActiveRef.current)
      closeLive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCanvasId])

  // Materialise the canonical board into the mirror: once on open, and again on
  // every remote version bump while we are NOT the holder (the holder is the
  // source of its own writes, not a sink for them).
  useEffect(() => {
    if (!mirrorId || !bodyObj) return
    const version = meta?.version ?? 0
    const firstApply = appliedVersionRef.current < 0
    if (!firstApply && isHolder) return
    if (!firstApply && version === appliedVersionRef.current) return
    const body = coerceCanvasBody(bodyObj)
    if (!body) return
    applyingRef.current = true
    appliedVersionRef.current = version
    void (async () => {
      try {
        await applyCanvasBodyToTask(mirrorId, body)
        setActive(mirrorId)
      } finally {
        // Let the store updates from the rebuild settle before re-arming the
        // edit-watcher, so the rebuild itself is never serialized back.
        setTimeout(() => {
          applyingRef.current = false
        }, 0)
      }
    })()
  }, [mirrorId, bodyObj, isHolder, meta?.version, setActive])

  // Holder editing: while we hold the lock, watch the mirror's widgets + links
  // and push a fresh serialization (debounced) on any real change.
  useEffect(() => {
    if (!mirrorId || !isHolder) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = (): void => {
      if (applyingRef.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void (async () => {
          const node = useNodeStore.getState().nodes.find((n) => n.id === mirrorId)
          if (!node) return
          const raw = await serializeCanvasBody(node)
          try {
            saveBody(JSON.parse(raw))
          } catch {
            // serialization produced something unparseable — skip this push
            // rather than throw inside the subscription.
          }
        })()
      }, 500)
    }
    const unsubW = useWidgetStore.subscribe((state, prev) => {
      if (state.widgets !== prev.widgets) schedule()
    })
    const unsubL = useLinksStore.subscribe((state, prev) => {
      if (state.links !== prev.links) schedule()
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubW()
      unsubL()
    }
  }, [mirrorId, isHolder, saveBody])

  // Enforce read-only for non-holders by marking the canvas subtree inert (the
  // server also rejects body writes without the lock, so this is belt-and-braces).
  useEffect(() => {
    const el = surfaceRef.current
    if (el) (el as unknown as { inert: boolean }).inert = !isHolder
  }, [isHolder, mirrorId, bodyObj])

  if (loading || !meta || meta.id !== liveCanvasId) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod text-[13px] text-stone-400">
        Loading shared canvas…
      </div>
    )
  }

  const isOwner = meta.ownerAccountId === myId
  const holderHandle = lock?.holder?.handle ?? null
  const lockedByOther = !!lock?.holder && lock.holder.accountId !== myId

  async function sendInvite(): Promise<void> {
    if (!token) return
    const res = await inviteToLiveDoc(token, liveCanvasId, inviteHandle.trim())
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
      <div className="shrink-0 px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3">
        <button onClick={() => goDocuments()} className="icon-btn" title="Back">
          <Icon name="arrow_back" size={17} />
        </button>
        <Icon name="space_dashboard" size={16} className="text-accent shrink-0" />
        <span className="flex-1 min-w-0 text-[14px] font-semibold text-stone-900 dark:text-stone-100 truncate">
          {meta.title}
        </span>
        <Icon name="group" size={14} className="text-stone-400 shrink-0" />
        {isHolder && (
          <span className="text-[11px] text-stone-400 dark:text-stone-500 inline-flex items-center gap-1 shrink-0">
            <Icon name={saving ? 'sync' : 'cloud_done'} size={13} className={saving ? 'animate-spin' : 'text-emerald-500'} />
            {saving ? 'Saving' : 'Saved'}
          </span>
        )}
        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">Live canvas</span>
        {isOwner && (
          <button onClick={() => setInviting((v) => !v)} className="icon-btn" title="Invite someone" data-testid="livecanvas-invite">
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
        data-testid="livecanvas-status"
      >
        {lockedByOther ? (
          <>
            <Icon name="lock" size={14} />
            <span data-testid="livecanvas-locked">Editing — locked by {holderHandle}</span>
            <div className="ml-auto flex items-center gap-2">
              {requested ? (
                <span className="text-[11px] opacity-80">Access requested</span>
              ) : (
                <button
                  onClick={() => setRequesting((v) => !v)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-600 text-white hover:brightness-110"
                  data-testid="livecanvas-request"
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
              data-testid="livecanvas-checkout"
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
            data-testid="livecanvas-request-message"
          />
          <button onClick={() => void sendRequest()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livecanvas-request-send">
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
            data-testid="livecanvas-invite-handle"
          />
          <button onClick={() => void sendInvite()} className="btn-primary text-[12px] px-3 py-1.5" data-testid="livecanvas-invite-send">
            Invite
          </button>
          {inviteNote && <span className="text-[11px] text-stone-500 dark:text-stone-400">{inviteNote}</span>}
        </div>
      )}

      {/* Surface — the real Canvas, inert (read-only) unless we hold the lock */}
      <div className="flex-1 overflow-hidden min-h-0 relative" ref={surfaceRef} data-testid="livecanvas-surface">
        {mirrorId ? (
          <Canvas />
        ) : (
          <div className="h-full flex items-center justify-center text-[13px] text-stone-400">
            Preparing canvas…
          </div>
        )}
      </div>
    </div>
  )
}
