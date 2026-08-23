import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BodyDoubleMode } from '@shared/types'
import { usePeerBodyDoubleStore } from '../stores/peerBodyDouble'
import { generateShareToken, viewerUrlFor } from '../lib/shareTokens'
import Icon from './Icon'

// Mock data for v1 — public rooms and a friend list. Once the real
// signaling server lands these come from the API. The shape is finalised
// now so the UI can be built and demoed.
const PUBLIC_ROOMS = [
  { id: 'adhd-writers', name: 'ADHD writers', topic: 'Words. Just words.', emoji: '✍️', presence: 14 },
  { id: 'phd-grind', name: 'PhD grind', topic: 'Dissertations and despair.', emoji: '📚', presence: 22 },
  { id: 'founders', name: 'Solo founders', topic: 'Ship it before sundown.', emoji: '🚀', presence: 9 },
  { id: 'designers', name: 'Designers heads-down', topic: 'Figma. Coffee. Vibes.', emoji: '🎨', presence: 11 },
  { id: 'inbox-zero', name: 'Inbox triage', topic: 'Email accountability.', emoji: '📨', presence: 6 },
  { id: 'students', name: 'Students studying', topic: 'Exam season warriors.', emoji: '🎓', presence: 31 }
]

// Peer body double — the whole user journey lives in this one dialog:
//   idle    → preference picker (mode + workingOn) + "Find a partner"
//   looking → "Searching…" with cancel
//   matched → partner intro card + "Start session" / "Skip"
//   connected → active session UI (timer, chat or quiet, end button)
//
// The dialog stays mounted across status changes so the chat history and
// the connection timer survive the matched→connected transition. Closing
// the dialog without explicitly ending only HIDES it — the session keeps
// running (you might want to mute the panel while you focus). The same
// header button toggles visibility.

interface Props {
  onClose: () => void
}

const MODE_META: Record<
  BodyDoubleMode,
  { label: string; tagline: string; icon: string; chatAllowed: boolean }
> = {
  silent: {
    label: 'Total silence',
    tagline: 'Just presence. No chat, no audio — we both just know the other is here.',
    icon: 'volume_off',
    chatAllowed: false
  },
  greetings: {
    label: 'Greetings only',
    tagline: 'One hello, swap what you\'re working on, then quiet. Maybe a check-in at the end.',
    icon: 'waving_hand',
    chatAllowed: true
  },
  light: {
    label: 'Light conversation',
    tagline: 'Text chat available. Occasional progress updates welcome. No pressure.',
    icon: 'forum',
    chatAllowed: true
  },
  open: {
    label: 'Open communication',
    tagline: 'Full back-and-forth chat. Audio when that ships. Co-working with a friend.',
    icon: 'chat',
    chatAllowed: true
  }
}

// Minimum duration to hold the "Looking…" UI even when the underlying
// matcher finds a partner instantly. Two reasons:
//   1. A real searching feel — instant matches in dev or in a busy room
//      can feel suspicious / fake; a small pause makes the action read
//      as deliberate.
//   2. Gives the partner a beat to also see "matched" before chat opens,
//      so neither side feels they're catching up.
const MIN_LOOKING_MS = 3000

export default function PeerBodyDoubleDialog({ onClose }: Props): JSX.Element {
  const status = usePeerBodyDoubleStore((s) => s.status)
  const mode = usePeerBodyDoubleStore((s) => s.mode)
  const workingOn = usePeerBodyDoubleStore((s) => s.workingOn)
  const myHandle = usePeerBodyDoubleStore((s) => s.myHandle)
  const partner = usePeerBodyDoubleStore((s) => s.partner)
  const chat = usePeerBodyDoubleStore((s) => s.chat)
  const toast = usePeerBodyDoubleStore((s) => s.toast)
  const startLooking = usePeerBodyDoubleStore((s) => s.startLooking)
  const cancelLooking = usePeerBodyDoubleStore((s) => s.cancelLooking)
  const enterConnected = usePeerBodyDoubleStore((s) => s.enterConnected)
  const sendChat = usePeerBodyDoubleStore((s) => s.sendChat)
  const endSession = usePeerBodyDoubleStore((s) => s.endSession)
  const dismissToast = usePeerBodyDoubleStore((s) => s.dismissToast)

  // Preference picker local state — kept here (not in the store) so the
  // picker resets on each new request.
  const [pickedMode, setPickedMode] = useState<BodyDoubleMode>('silent')
  const [workingOnDraft, setWorkingOnDraft] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // Mock video state — if fb-dev:// can't serve the file (missing in
  // production builds, missing on disk, codec issue), we render a calm
  // gradient placeholder instead of a black void with no signal.
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  // "Hold looking" floor — when the store transitions out of `looking`
  // sooner than MIN_LOOKING_MS, we render the looking UI for the
  // remainder. effectiveStatus is what the body switches on; the actual
  // store status keeps moving so chat events and partner data are ready
  // by the time the floor elapses.
  const lookingStartedAtRef = useRef<number | null>(null)
  const [floorPassed, setFloorPassed] = useState(true)
  useEffect(() => {
    if (status === 'looking') {
      lookingStartedAtRef.current = Date.now()
      setFloorPassed(false)
    } else if (
      (status === 'matched' || status === 'connected') &&
      lookingStartedAtRef.current !== null
    ) {
      const elapsed = Date.now() - lookingStartedAtRef.current
      const remaining = Math.max(0, MIN_LOOKING_MS - elapsed)
      const t = window.setTimeout(() => setFloorPassed(true), remaining)
      return () => window.clearTimeout(t)
    } else if (status === 'idle') {
      // Reset so a fresh look starts the floor over.
      lookingStartedAtRef.current = null
      setFloorPassed(true)
    }
    return undefined
  }, [status])

  const effectiveStatus =
    status === 'matched' || status === 'connected'
      ? floorPassed
        ? status
        : 'looking'
      : status

  // Auto-scroll the chat to the latest message — but only when already at
  // the bottom (so reviewing earlier messages while a new one arrives
  // doesn't yank you down).
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chat.length])

  // Esc closes the dialog (without ending the session if one is active).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const chatAllowed = mode ? MODE_META[mode].chatAllowed : false

  return createPortal(
    <div
      className="fb-scrim fixed inset-0 z-[260] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-[460px] max-h-[80vh] rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header — stays consistent across all phases */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--edge-soft)]">
          <div className="h-8 w-8 rounded-full bg-accent/10 inline-flex items-center justify-center">
            <Icon name="diversity_3" size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--ink-100)]">
              Body double
            </h2>
            <p className="text-[11px] text-[var(--ink-50)] leading-tight">
              {effectiveStatus === 'idle' && 'Pair with a stranger to feel less alone while you work'}
              {effectiveStatus === 'looking' && 'Looking for someone with the same vibe…'}
              {effectiveStatus === 'matched' && 'You\'re matched — say hello'}
              {effectiveStatus === 'connected' && (mode ? MODE_META[mode].label : 'Connected')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded inline-flex items-center justify-center text-[var(--ink-40)] hover:bg-[var(--surface-sunken)]"
            aria-label="Close panel"
            title={effectiveStatus === 'connected' ? 'Hide panel — session keeps running' : 'Close'}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Body switches by status */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {toast && (
            <div className="m-3 p-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Icon name="info" size={13} className="mt-0.5 shrink-0" />
              <span className="flex-1">{toast}</span>
              <button
                onClick={dismissToast}
                className="text-amber-700 hover:text-amber-900"
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          )}

          {/* ── IDLE: room/friends entry + mode picker ──────────────── */}
          {effectiveStatus === 'idle' && (
            <div className="p-4 space-y-4">
              {/* PUBLIC ROOMS — themed always-on rooms. v1 mock data; the
                  click handler currently just kicks off a random match in
                  that mode. The room id will be sent to the real matcher
                  when the server ships so users genuinely land together. */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-50)]">
                    Public rooms
                  </label>
                  <span className="text-[9px] text-[var(--ink-40)]">
                    Skip the queue · always-on
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PUBLIC_ROOMS.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => {
                        // For mock purposes a public room is "light" mode —
                        // text chat works, partner is whoever is in the
                        // queue. Real matcher will route by room id.
                        void startLooking('light', `In ${room.name}`)
                      }}
                      className="text-left p-2 rounded-md border border-[var(--edge-soft)] hover:border-accent hover:bg-accent/5 transition-colors flex items-center gap-2"
                    >
                      <span className="text-[18px] shrink-0">{room.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[var(--ink-90)] truncate">
                          {room.name}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-[var(--ink-50)]">
                          <span className="relative inline-flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                          <span className="tabular-nums">{room.presence} here</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* FRIENDS — invite-a-friend link + future friends list.
                  v1 generates a personal invite token (same format as
                  share tokens). When a friend signs up via the link they
                  appear in the "friends pool" and get matched with you
                  first before strangers. */}
              <div className="border-t border-[var(--edge-soft)] pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-50)]">
                    Bring a friend
                  </label>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                    +1 month free body double per invite
                  </span>
                </div>
                <button
                  onClick={async () => {
                    const token = generateShareToken()
                    const url = viewerUrlFor(token).replace(
                      '/share/',
                      '/buddy/'
                    )
                    try {
                      await navigator.clipboard.writeText(url)
                    } catch {
                      // ignore
                    }
                    // TODO once auth exists: persist this token as a
                    // pending friend invite so when someone signs up with
                    // it the pair is auto-friended.
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)] text-[12px] font-medium text-[var(--ink-90)]"
                >
                  <Icon name="link" size={13} />
                  Copy invite link
                </button>
                <p className="text-[10px] text-[var(--ink-50)] mt-1.5 leading-snug">
                  Share with a friend who'd body double with you. When they
                  sign up, you'll match with each other first — before
                  strangers — for every session.
                </p>
              </div>

              {/* Mode picker — for random matching when you don't pick a room */}
              <div className="border-t border-[var(--edge-soft)] pt-3">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-50)] mb-1.5">
                  Or match with a stranger — how much interaction?
                </label>
                <div className="space-y-1.5" role="radiogroup" aria-label="Interaction mode">
                  {(Object.keys(MODE_META) as BodyDoubleMode[]).map((m) => {
                    const meta = MODE_META[m]
                    const active = pickedMode === m
                    return (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPickedMode(m)}
                        className={`w-full text-left p-2.5 rounded-md border-2 flex items-start gap-2.5 transition-colors ${
                          active
                            ? 'border-accent bg-accent/[0.06]'
                            : 'border-[var(--edge-soft)] hover:border-[var(--edge-firm)]'
                        }`}
                      >
                        <Icon
                          name={meta.icon}
                          size={16}
                          className={
                            active
                              ? 'text-accent mt-0.5 shrink-0'
                              : 'text-[var(--ink-40)] mt-0.5 shrink-0'
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[13px] font-medium ${
                              active
                                ? 'text-accent'
                                : 'text-[var(--ink-90)]'
                            }`}
                          >
                            {meta.label}
                          </div>
                          <div className="text-[11px] text-[var(--ink-50)] leading-snug">
                            {meta.tagline}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {(pickedMode === 'greetings' ||
                pickedMode === 'light' ||
                pickedMode === 'open') && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-50)] mb-1.5">
                    What are you working on?{' '}
                    <span className="text-[var(--ink-40)] normal-case font-normal">(shared with partner — optional)</span>
                  </label>
                  <input
                    value={workingOnDraft}
                    onChange={(e) => setWorkingOnDraft(e.target.value)}
                    placeholder="e.g. drafting Q3 brief, deep work on a paper, inbox triage"
                    className="w-full text-[13px] px-2.5 py-1.5 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-md focus:outline-none focus:border-accent"
                    maxLength={80}
                  />
                </div>
              )}

              <div className="text-[10px] text-[var(--ink-50)] leading-relaxed bg-[var(--surface-sunken)] p-2 rounded">
                <strong className="text-[var(--ink-70)]">Privacy:</strong>{' '}
                You'll be matched with a stranger. No real name, no audio or
                video in v1 — just a pseudonymous handle and optional text chat
                if your mode allows it. You can end the session any time, with
                no record kept on either side.
              </div>
            </div>
          )}

          {/* ── LOOKING: searching state ────────────────────────────── */}
          {effectiveStatus === 'looking' && (
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-accent/10 inline-flex items-center justify-center">
                  <Icon name="diversity_3" size={28} className="text-accent" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-accent/40 animate-ping" />
              </div>
              <div className="space-y-1">
                <div className="text-[14px] font-medium text-[var(--ink-90)]">
                  Looking for {mode ? MODE_META[mode].label.toLowerCase() : 'a partner'}…
                </div>
                <div className="text-[11px] text-[var(--ink-50)]">
                  You're <span className="font-mono text-accent">{myHandle}</span>{' '}
                  while you wait
                </div>
              </div>
              {workingOn && (
                <div className="text-[11px] text-[var(--ink-70)] italic max-w-[280px]">
                  "{workingOn}"
                </div>
              )}
              <button
                onClick={() => void cancelLooking()}
                className="mt-3 text-[12px] px-3 py-1.5 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── MATCHED: partner intro ──────────────────────────────── */}
          {effectiveStatus === 'matched' && partner && (
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 inline-flex items-center justify-center">
                <Icon name="handshake" size={22} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <div className="text-[13px] text-[var(--ink-50)]">
                  Say hello to
                </div>
                <div className="text-[18px] font-semibold text-[var(--ink-100)] font-mono">
                  {partner.handle}
                </div>
              </div>
              {partner.workingOn && (
                <div className="bg-[var(--surface-sunken)] rounded-md px-3 py-2 text-[12px] text-[var(--ink-70)] max-w-[320px]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] block mb-0.5">
                    Working on
                  </span>
                  {partner.workingOn}
                </div>
              )}
              <div className="text-[11px] text-[var(--ink-50)] max-w-[320px] leading-snug">
                You both picked{' '}
                <strong className="text-[var(--ink-70)]">
                  {mode ? MODE_META[mode].label : '...'}
                </strong>
                .{' '}
                {mode && MODE_META[mode].chatAllowed
                  ? 'Chat opens when you start.'
                  : 'No chat — just shared focus.'}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => void endSession()}
                  className="text-[12px] px-3 py-1.5 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
                >
                  Skip
                </button>
                <button
                  onClick={enterConnected}
                  className="text-[12px] px-4 py-1.5 rounded bg-accent text-white hover:brightness-110 font-medium"
                >
                  Start session
                </button>
              </div>
            </div>
          )}

          {/* ── CONNECTED: active session ───────────────────────────── */}
          {effectiveStatus === 'connected' && partner && (
            <div className="flex flex-col h-full">
              {/* Mock body double video panel — placeholder for the live
                  partner webcam that ships with WebRTC. The video file is
                  served by the dev-only `fb-dev://` protocol; in production
                  this slot will host the partner's WebRTC stream. The
                  visual frame stays identical so the eventual swap is
                  invisible to the user. Loops + muted + playsInline so it
                  feels present without competing for audio. */}
              <div className="relative bg-stone-900 overflow-hidden" style={{ height: 200 }}>
                {!videoFailed ? (
                  <video
                    src="fb-dev://mock-videos/working-webcam.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onCanPlay={() => setVideoReady(true)}
                    onError={(e) => {
                      const el = e.currentTarget
                      // eslint-disable-next-line no-console
                      console.warn(
                        '[PeerBodyDoubleDialog] mock video failed to load:',
                        {
                          src: el.currentSrc,
                          error: el.error,
                          networkState: el.networkState,
                          readyState: el.readyState
                        }
                      )
                      setVideoFailed(true)
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Calm placeholder: a soft gradient + breathing dot so
                  // the user still feels a "presence" even when the mock
                  // asset can't be served. Identical chrome (handle pill,
                  // mock badge) layers on top.
                  <div className="absolute inset-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 flex flex-col items-center justify-center gap-2">
                    <div className="relative inline-flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
                      <div className="relative h-10 w-10 rounded-full bg-emerald-500/30 inline-flex items-center justify-center">
                        <Icon name="diversity_3" size={20} className="text-emerald-200" />
                      </div>
                    </div>
                    <div className="text-[11px] text-stone-300">
                      {partner.handle} is here
                    </div>
                    <div className="text-[9px] text-stone-500">
                      (live video lands when WebRTC ships)
                    </div>
                  </div>
                )}
                {!videoReady && !videoFailed && (
                  <div className="absolute inset-0 bg-stone-900/60 flex items-center justify-center pointer-events-none">
                    <div className="text-[11px] text-stone-300 inline-flex items-center gap-1.5">
                      <Icon name="hourglass_empty" size={12} />
                      Loading mock feed…
                    </div>
                  </div>
                )}
                {/* Partner handle overlay — matches the chrome of the
                    eventual WebRTC video element. */}
                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] text-white font-mono">
                  <span className="relative inline-flex items-center justify-center h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {partner.handle}
                </div>
                {/* "Mock video" tag so devs aren't fooled in the demo
                    flow. Will be removed when WebRTC streams ship. */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-amber-500/80 text-white text-[9px] uppercase tracking-wider font-semibold">
                  Mock video
                </div>
              </div>
              {/* Partner strip + presence dot */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--edge-soft)]">
                <span className="relative inline-flex items-center justify-center h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--ink-90)] font-mono truncate">
                    {partner.handle}
                  </div>
                  {partner.workingOn && (
                    <div className="text-[10px] text-[var(--ink-50)] truncate italic">
                      {partner.workingOn}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void endSession()}
                  className="text-[11px] px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  End session
                </button>
              </div>

              {chatAllowed ? (
                <>
                  {/* Chat area */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 min-h-[200px] max-h-[40vh] overflow-y-auto px-3 py-2 space-y-1.5"
                  >
                    {chat.length === 0 && (
                      <div className="text-center text-[11px] text-[var(--ink-40)] py-4">
                        Say hi to break the ice.
                      </div>
                    )}
                    {chat.map((m) => {
                      const mine = m.senderHandle === myHandle
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] px-2.5 py-1.5 rounded-lg text-[12px] ${
                              mine
                                ? 'bg-accent text-white'
                                : 'bg-[var(--surface-sunken)] text-[var(--ink-90)]'
                            }`}
                          >
                            {!mine && (
                              <div className="text-[9px] uppercase tracking-wider opacity-70 mb-0.5 font-mono">
                                {m.senderHandle}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap leading-snug">{m.text}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Chat composer */}
                  <div className="border-t border-[var(--edge-soft)] p-2 flex gap-2">
                    <input
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (chatDraft.trim()) {
                            sendChat(chatDraft)
                            setChatDraft('')
                          }
                        }
                      }}
                      placeholder={
                        mode === 'greetings'
                          ? 'Say hi + share what you\'re working on…'
                          : 'Send a message…'
                      }
                      className="flex-1 text-[12px] px-2.5 py-1.5 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded-md focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => {
                        if (chatDraft.trim()) {
                          sendChat(chatDraft)
                          setChatDraft('')
                        }
                      }}
                      disabled={!chatDraft.trim()}
                      className="text-[12px] px-3 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Icon name="send" size={11} />
                      Send
                    </button>
                  </div>
                </>
              ) : (
                // Silent mode — just the partner strip + a calm reassurance.
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 px-6 text-center">
                  <Icon name="volume_off" size={28} className="text-[var(--ink-30)]" />
                  <div className="text-[13px] text-[var(--ink-70)] font-medium">
                    You're not alone.
                  </div>
                  <div className="text-[11px] text-[var(--ink-50)] max-w-[280px]">
                    No chat in silent mode. Close this panel and go work — your
                    partner is sitting beside you (figuratively).
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only on idle */}
        {effectiveStatus === 'idle' && (
          <div className="px-4 py-3 border-t border-[var(--edge-soft)] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="text-[12px] px-3 py-1.5 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                void startLooking(pickedMode, workingOnDraft.trim() || null)
              }
              className="text-[12px] px-4 py-1.5 rounded bg-accent text-white hover:brightness-110 font-medium inline-flex items-center gap-1.5"
            >
              <Icon name="diversity_3" size={12} />
              Find a partner
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
