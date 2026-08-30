import { create } from 'zustand'
import { sendSocketMessage, setMeetingSocketHandler, type MeetingSocketEvent } from '../lib/messagingSocket'
import { notifyExternal } from '../lib/notify'
import { ConversationRecorder } from '../lib/conversationRecorder'
import { whisperEnabled, setWhisperEnabled } from '../lib/whisperPref'
import { useWrapupStore } from './wrapup'
import { useAccountStore } from './account'
import { personDisplayName } from '../lib/personName'

// PlexiMeet live rooms: a multi-party meeting built as a WebRTC mesh. Each member
// holds one peer connection to every other member; the signal server only relays
// the roster and the SDP/ICE, never the media. Glare is avoided by a single rule:
// whoever joins a room sends the offer to everyone already there, and existing
// members only ever answer. This suits small meetings (a handful of people on
// normal networks); large rooms and hard NATs want a TURN server and an SFU,
// which are a server-infrastructure phase, and the UI says so honestly rather
// than faking a connection that did not form.
//
// Screen sharing rides the same mesh. When a member shares, the screen video is
// added as an extra track (its own MediaStream) to every peer connection and the
// mesh is renegotiated live. Only the sharer initiates that renegotiation, and a
// perfect-negotiation-lite glare guard (a deterministic polite flag) keeps the
// rare case of two people sharing at once from wedging a connection. The initial
// join offer/answer flow is untouched. Receivers tell a screen stream from a
// camera stream by a small announce message that names the screen stream id and
// is always sent before the renegotiation offer over the same ordered socket.

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export type MeetingStatus = 'idle' | 'joining' | 'in'

export interface MeetingParticipant {
  accountId: string
  handle: string
  firstName?: string | null
  lastName?: string | null
  stream: MediaStream | null
  // The peer's shared screen, when they are presenting. Null otherwise. Kept
  // separate from `stream` (their camera) so both can render at once.
  screenStream: MediaStream | null
  connected: boolean
}

export interface MeetingInvite {
  roomId: string
  from: { accountId: string; handle: string; firstName?: string | null; lastName?: string | null }
  title: string | null
}

// How the live meeting is presented. 'stage' is the classic fullscreen room;
// 'collaborate' docks the meeting to one edge as a movable panel so the rest of
// Plexii stays the focus and the user can navigate around while the call runs.
export type MeetingLayout = 'stage' | 'collaborate'
export type DockSide = 'left' | 'right' | 'top' | 'bottom'

const DOCK_KEY = 'fb.meet.dockSide'
function loadDockSide(): DockSide {
  try {
    const v = localStorage.getItem(DOCK_KEY)
    return v === 'left' || v === 'top' || v === 'bottom' ? v : 'right'
  } catch {
    return 'right'
  }
}

interface MeetingRoomStore {
  roomId: string | null
  title: string | null
  status: MeetingStatus
  localStream: MediaStream | null
  // The local screen the user is currently sharing (getDisplayMedia), or null.
  screenStream: MediaStream | null
  sharingScreen: boolean
  participants: Record<string, MeetingParticipant>
  muted: boolean
  cameraOff: boolean
  error: string | null
  incomingInvite: MeetingInvite | null
  ready: boolean
  // Presentation of the live room (see MeetingLayout). dockSide is remembered.
  layout: MeetingLayout
  dockSide: DockSide
  // Whether this meeting is being recorded for a transcript + summary. Reflects
  // the whisper opt-in at join and can be toggled live during the meeting.
  transcribing: boolean

  init: () => void
  setLayout: (layout: MeetingLayout) => void
  setDockSide: (side: DockSide) => void
  setTranscribing: (on: boolean) => void
  start: (title?: string) => Promise<string | null>
  join: (roomId: string, title?: string) => Promise<void>
  invite: (peer: { accountId: string; handle: string }) => void
  leave: () => void
  toggleMute: () => void
  toggleCamera: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => void
  toggleScreenShare: () => Promise<void>
  dismissInvite: () => void
  acceptInvite: () => Promise<void>
}

// Non-serializable mesh internals live outside the store: one RTCPeerConnection
// per remote member, plus its buffer of ICE candidates that arrived early, a
// glare guard, and a deterministic politeness flag.
interface PeerConn {
  pc: RTCPeerConnection
  pending: RTCIceCandidateInit[]
  makingOffer: boolean
  polite: boolean
}
let peers = new Map<string, PeerConn>()
// The RTCRtpSender carrying my screen track to each peer, so I can removeTrack
// on stop. Keyed by the peer's accountId.
let screenSenders = new Map<string, RTCRtpSender>()
// The screen stream id each peer has announced they are sharing, so ontrack can
// route their screen track to `screenStream` instead of merging it into camera.
let announcedScreenSid = new Map<string, string>()
// Records the mixed audio of the meeting so it can be summarised on leave.
let recorder: ConversationRecorder | null = null

function genRoomId(): string {
  return `meet-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export const useMeetingRoomStore = create<MeetingRoomStore>((set, get) => {
  function signalTo(to: string, data: unknown): void {
    const roomId = get().roomId
    if (!roomId) return
    sendSocketMessage({ type: 'meetingSignal', payload: { roomId, to, data: JSON.stringify(data) } })
  }

  // Create (or fetch) the peer connection for a member, wiring local tracks, ICE
  // and the remote track sink. Idempotent: a second call returns the existing one.
  function ensurePeer(
    accountId: string,
    handle: string,
    firstName?: string | null,
    lastName?: string | null
  ): PeerConn {
    const found = peers.get(accountId)
    if (found) return found
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const local = get().localStream
    if (local) for (const track of local.getTracks()) pc.addTrack(track, local)
    // If I am already sharing when this peer appears, the screen is NOT added
    // here: on the answerer side of a fresh connection createAnswer cannot add a
    // new m-line, so the track would silently never arrive. Instead the sharer
    // pushes the screen via an explicit follow-up renegotiation once the base
    // connection is up (see the offer branch in onSocket, and startScreenShare).
    // The peer's camera+mic accumulate into one stream; a screen share arrives on
    // its own stream id and is kept apart.
    const camera = new MediaStream()
    pc.onicecandidate = (e) => {
      if (e.candidate) signalTo(accountId, { kind: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const inbound = e.streams[0]
      const p = get().participants[accountId]
      if (!p) return
      if (inbound && announcedScreenSid.get(accountId) === inbound.id) {
        // This is the peer's shared screen. Do not mix it into the recording.
        set({ participants: { ...get().participants, [accountId]: { ...p, screenStream: inbound } } })
        return
      }
      for (const track of inbound ? inbound.getTracks() : [e.track]) {
        if (!camera.getTracks().some((t) => t.id === track.id)) camera.addTrack(track)
      }
      // Mix this peer's audio into the conversation recording.
      recorder?.addStream(camera)
      set({ participants: { ...get().participants, [accountId]: { ...p, stream: camera } } })
    }
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      const p = get().participants[accountId]
      if (!p) return
      if (st === 'connected') {
        set({ participants: { ...get().participants, [accountId]: { ...p, connected: true } } })
      } else if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        set({ participants: { ...get().participants, [accountId]: { ...p, connected: false } } })
      }
    }
    const myId = useAccountStore.getState().account?.id ?? ''
    const conn: PeerConn = { pc, pending: [], makingOffer: false, polite: myId < accountId }
    peers.set(accountId, conn)
    // Register the participant tile immediately (so it shows "connecting").
    if (!get().participants[accountId]) {
      set({
        participants: {
          ...get().participants,
          [accountId]: { accountId, handle, firstName, lastName, stream: null, screenStream: null, connected: false }
        }
      })
    }
    return conn
  }

  // Sharer-initiated renegotiation, used when a screen track is added or removed
  // on a live connection. Only ever called by the member who changed their own
  // tracks; the glare guard in onSocket handles the rare simultaneous case.
  async function renegotiate(accountId: string): Promise<void> {
    const conn = peers.get(accountId)
    if (!conn) return
    try {
      conn.makingOffer = true
      const offer = await conn.pc.createOffer()
      await conn.pc.setLocalDescription(offer)
      signalTo(accountId, { kind: 'offer', sdp: offer })
    } catch {
      /* renegotiation failed for this peer; their screen tile just won't update */
    } finally {
      conn.makingOffer = false
    }
  }

  // Deliver my current screen to one peer via a sharer-initiated renegotiation.
  // Safe to call for a peer that already has it (no-op) and only when sharing.
  // Announce is sent before the offer so the receiver routes the incoming track.
  function pushScreenTo(accountId: string): void {
    const display = get().screenStream
    if (!display) return
    const st = display.getVideoTracks()[0]
    const conn = peers.get(accountId)
    if (!st || !conn || screenSenders.has(accountId)) return
    signalTo(accountId, { kind: 'screen', on: true, sid: display.id })
    try {
      screenSenders.set(accountId, conn.pc.addTrack(st, display))
    } catch {
      return
    }
    void renegotiate(accountId)
  }

  function dropPeer(accountId: string): void {
    const conn = peers.get(accountId)
    if (conn) {
      conn.pc.onicecandidate = null
      conn.pc.ontrack = null
      conn.pc.onconnectionstatechange = null
      try {
        conn.pc.close()
      } catch {
        /* already closed */
      }
      peers.delete(accountId)
    }
    screenSenders.delete(accountId)
    announcedScreenSid.delete(accountId)
    const rest = { ...get().participants }
    delete rest[accountId]
    set({ participants: rest })
  }

  function teardown(): void {
    for (const id of [...peers.keys()]) dropPeer(id)
    peers = new Map()
    screenSenders = new Map()
    announcedScreenSid = new Map()
    get().localStream?.getTracks().forEach((t) => t.stop())
    get().screenStream?.getTracks().forEach((t) => t.stop())
    set({
      roomId: null,
      title: null,
      status: 'idle',
      localStream: null,
      screenStream: null,
      sharingScreen: false,
      participants: {},
      muted: false,
      cameraOff: false,
      transcribing: false,
      // Next meeting starts on the stage; dockSide preference is kept.
      layout: 'stage'
    })
  }

  async function flush(conn: PeerConn): Promise<void> {
    for (const c of conn.pending) {
      try {
        await conn.pc.addIceCandidate(c)
      } catch {
        /* a malformed candidate is non-fatal */
      }
    }
    conn.pending = []
  }

  async function onSocket(e: MeetingSocketEvent): Promise<void> {
    const state = get()
    // An invite can arrive while idle; everything else is for the active room.
    if (e.type === 'meetingInvited') {
      if (state.roomId === e.payload.roomId) return // already in it
      set({ incomingInvite: e.payload })
      notifyExternal('Meeting invite', `${personDisplayName(e.payload.from, 'Someone')} invited you to ${e.payload.title ?? 'a meeting'}`, {
        force: true,
        tag: `meet-${e.payload.roomId}`
      })
      return
    }
    if (!state.roomId || e.payload.roomId !== state.roomId) return

    if (e.type === 'meetingRoster') {
      // I just joined: offer to everyone already here (I am the newcomer).
      for (const peer of e.payload.peers) {
        const conn = ensurePeer(peer.accountId, peer.handle, peer.firstName, peer.lastName)
        try {
          const offer = await conn.pc.createOffer()
          await conn.pc.setLocalDescription(offer)
          signalTo(peer.accountId, { kind: 'offer', sdp: offer })
        } catch {
          /* offer failed for this peer; the tile will stay disconnected */
        }
      }
      return
    }
    if (e.type === 'meetingPeerJoined') {
      // A newcomer arrived after me: prepare a connection but wait for their offer.
      ensurePeer(e.payload.peer.accountId, e.payload.peer.handle, e.payload.peer.firstName, e.payload.peer.lastName)
      return
    }
    if (e.type === 'meetingPeerLeft') {
      dropPeer(e.payload.accountId)
      return
    }
    if (e.type === 'meetingSignal') {
      const from = e.payload.from
      let data: {
        kind: string
        sdp?: RTCSessionDescriptionInit
        candidate?: RTCIceCandidateInit
        handle?: string
        on?: boolean
        sid?: string
      }
      try {
        data = JSON.parse(e.payload.data)
      } catch {
        return
      }
      // Screen announce/withdraw. Sent ahead of the renegotiation SDP so the
      // receiver knows which incoming stream id is a screen before ontrack fires.
      if (data.kind === 'screen') {
        if (data.on && data.sid) {
          announcedScreenSid.set(from, data.sid)
        } else {
          announcedScreenSid.delete(from)
          const p = get().participants[from]
          if (p && p.screenStream) {
            set({ participants: { ...get().participants, [from]: { ...p, screenStream: null } } })
          }
        }
        return
      }
      const existing = get().participants[from]
      const conn = ensurePeer(from, existing?.handle ?? from, existing?.firstName, existing?.lastName)
      if (data.kind === 'offer' && data.sdp) {
        // Perfect-negotiation-lite: if an offer collides with one I'm making,
        // the impolite peer ignores it and the polite peer accepts (Chromium
        // rolls back implicitly inside setRemoteDescription). The initial join
        // answerer is stable and not making an offer, so it never ignores.
        const offerCollision = conn.makingOffer || conn.pc.signalingState !== 'stable'
        if (!conn.polite && offerCollision) return
        try {
          await conn.pc.setRemoteDescription(data.sdp)
        } catch {
          return
        }
        await flush(conn)
        const answer = await conn.pc.createAnswer()
        await conn.pc.setLocalDescription(answer)
        signalTo(from, { kind: 'answer', sdp: answer })
        // If I am sharing my screen, this peer's base connection is now up, so
        // push the screen to them as a follow-up offer (the answer above could
        // not carry a new m-line). No-op if they already have it.
        if (get().sharingScreen) pushScreenTo(from)
      } else if (data.kind === 'answer' && data.sdp) {
        try {
          await conn.pc.setRemoteDescription(data.sdp)
        } catch {
          return
        }
        await flush(conn)
      } else if (data.kind === 'candidate' && data.candidate) {
        if (conn.pc.remoteDescription) {
          try {
            await conn.pc.addIceCandidate(data.candidate)
          } catch {
            /* non-fatal */
          }
        } else {
          conn.pending.push(data.candidate)
        }
      }
    }
  }

  return {
    roomId: null,
    title: null,
    status: 'idle',
    localStream: null,
    screenStream: null,
    sharingScreen: false,
    participants: {},
    muted: false,
    cameraOff: false,
    error: null,
    incomingInvite: null,
    ready: false,
    layout: 'stage',
    dockSide: loadDockSide(),
    transcribing: false,

    setLayout: (layout) => set({ layout }),
    setDockSide: (side) => {
      try {
        localStorage.setItem(DOCK_KEY, side)
      } catch {
        /* ignore */
      }
      set({ dockSide: side })
    },
    // Turn meeting transcription on/off live. Persists the choice as the user's
    // default. Turning on mid-meeting starts recording from now (own mic + any
    // connected peers); turning off stops and discards the recording so no
    // summary is produced. Peers that connect later are mixed in automatically
    // (see ontrack).
    setTranscribing: (on) => {
      setWhisperEnabled(on)
      if (on && !recorder && get().status === 'in') {
        recorder = new ConversationRecorder()
        const local = get().localStream
        if (local) recorder.addStream(local)
        for (const p of Object.values(get().participants)) {
          if (p.stream) recorder.addStream(p.stream)
        }
        set({ transcribing: true })
      } else if (!on && recorder) {
        void recorder.stop()
        recorder = null
        set({ transcribing: false })
      } else {
        set({ transcribing: on && !!recorder })
      }
    },

    init: () => {
      if (get().ready) return
      setMeetingSocketHandler((e) => void onSocket(e))
      set({ ready: true })
    },

    start: async (title) => {
      if (get().status !== 'idle') return null
      const roomId = genRoomId()
      await get().join(roomId, title)
      return get().status === 'in' ? roomId : null
    },

    join: async (roomId, title) => {
      if (get().status !== 'idle') return
      set({ status: 'joining', error: null, roomId, title: title ?? null, participants: {} })
      try {
        const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        // Record the conversation for the end-of-meeting transcript + summary,
        // but ONLY when the user has opted into it via the "Transcribe & summarise
        // my meetings" toggle. This mirrors PlexiCam calls (stores/call.ts); the
        // toggle was previously inert for meetings, which is why turning it on did
        // nothing. Recording is never forced.
        if (whisperEnabled()) {
          recorder = new ConversationRecorder()
          recorder.addStream(local)
          set({ transcribing: true })
        }
        set({ localStream: local, status: 'in', incomingInvite: null })
        // Announce; the server replies with the roster and we offer to each member.
        sendSocketMessage({ type: 'meetingJoin', payload: { roomId, title: title ?? undefined } })
      } catch {
        set({ status: 'idle', roomId: null, error: 'Could not access your microphone or camera. Check system permissions.' })
      }
    },

    invite: (peer) => {
      const { roomId, title } = get()
      if (!roomId) return
      sendSocketMessage({ type: 'meetingInvite', payload: { roomId, to: peer.accountId, title: title ?? undefined } })
    },

    // Share a screen or window into the meeting. Opens the OS picker (via the
    // main-process display-media handler), then adds the screen track to every
    // peer and renegotiates. Switches to collaborate mode so the user can keep
    // navigating Plexii while it is shared, which is the point of sharing your
    // own workspace. Nothing is faked: if the user cancels the picker or denies
    // the OS permission, we surface that and stay unshared.
    startScreenShare: async () => {
      if (get().sharingScreen || get().status !== 'in') return
      let display: MediaStream
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      } catch {
        set({ error: 'Screen share was cancelled or not permitted.' })
        return
      }
      const track = display.getVideoTracks()[0]
      if (!track) {
        display.getTracks().forEach((t) => t.stop())
        return
      }
      // The OS "Stop sharing" overlay ends the track directly; mirror that back
      // into app state so the button and tiles update.
      track.onended = () => {
        void get().stopScreenShare()
      }
      // Set state first so pushScreenTo sees the stream, then deliver to every
      // current peer as a sharer-initiated renegotiation.
      set({ screenStream: display, sharingScreen: true, error: null, layout: 'collaborate' })
      for (const accountId of [...peers.keys()]) pushScreenTo(accountId)
    },

    stopScreenShare: () => {
      const display = get().screenStream
      if (!get().sharingScreen && !display) return
      for (const [accountId, conn] of peers) {
        const sender = screenSenders.get(accountId)
        if (sender) {
          try {
            conn.pc.removeTrack(sender)
          } catch {
            /* already gone */
          }
        }
        screenSenders.delete(accountId)
        signalTo(accountId, { kind: 'screen', on: false })
        void renegotiate(accountId)
      }
      display?.getTracks().forEach((t) => t.stop())
      set({ screenStream: null, sharingScreen: false })
    },

    toggleScreenShare: async () => {
      if (get().sharingScreen) get().stopScreenShare()
      else await get().startScreenShare()
    },

    leave: () => {
      const roomId = get().roomId
      const title = get().title || 'Meeting'
      if (roomId) sendSocketMessage({ type: 'meetingLeave', payload: { roomId } })
      // Stop the recording and, if the meeting was more than a moment, hand the
      // mixed audio to the wrap-up flow for a summary + deliverables.
      const rec = recorder
      recorder = null
      if (rec) {
        void rec.stop().then((res) => {
          if (res && res.durationSec >= 2) {
            void useWrapupStore.getState().begin({ title, buffer: res.buffer, mimeType: res.mimeType, durationSec: res.durationSec })
          }
        })
      }
      teardown()
    },

    acceptInvite: async () => {
      const inv = get().incomingInvite
      if (!inv) return
      set({ incomingInvite: null })
      if (get().status !== 'idle') get().leave()
      await get().join(inv.roomId, inv.title ?? undefined)
    },

    dismissInvite: () => set({ incomingInvite: null }),

    toggleMute: () => {
      const s = get().localStream
      if (!s) return
      const next = !get().muted
      s.getAudioTracks().forEach((t) => (t.enabled = !next))
      set({ muted: next })
    },

    toggleCamera: () => {
      const s = get().localStream
      if (!s) return
      const next = !get().cameraOff
      s.getVideoTracks().forEach((t) => (t.enabled = !next))
      set({ cameraOff: next })
    }
  }
})

// Test-only handle so e2e specs can drive the meeting overlay (collaborate mode,
// dock side, screen share) without a real getUserMedia call, which is
// unavailable headless. Same convention as __fbView / __fbAgentRun: a thin
// handle to the real store.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbMeetingRoom?: typeof useMeetingRoomStore }).__fbMeetingRoom =
    useMeetingRoomStore
}
