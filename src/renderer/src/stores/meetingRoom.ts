import { create } from 'zustand'
import { sendSocketMessage, setMeetingSocketHandler, type MeetingSocketEvent } from '../lib/messagingSocket'
import { notifyExternal } from '../lib/notify'
import { ConversationRecorder } from '../lib/conversationRecorder'
import { useWrapupStore } from './wrapup'

// PlexiMeet live rooms: a multi-party meeting built as a WebRTC mesh. Each member
// holds one peer connection to every other member; the signal server only relays
// the roster and the SDP/ICE, never the media. Glare is avoided by a single rule:
// whoever joins a room sends the offer to everyone already there, and existing
// members only ever answer. This suits small meetings (a handful of people on
// normal networks); large rooms and hard NATs want a TURN server and an SFU,
// which are a server-infrastructure phase, and the UI says so honestly rather
// than faking a connection that did not form.

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export type MeetingStatus = 'idle' | 'joining' | 'in'

export interface MeetingParticipant {
  accountId: string
  handle: string
  stream: MediaStream | null
  connected: boolean
}

export interface MeetingInvite {
  roomId: string
  from: { accountId: string; handle: string }
  title: string | null
}

interface MeetingRoomStore {
  roomId: string | null
  title: string | null
  status: MeetingStatus
  localStream: MediaStream | null
  participants: Record<string, MeetingParticipant>
  muted: boolean
  cameraOff: boolean
  error: string | null
  incomingInvite: MeetingInvite | null
  ready: boolean

  init: () => void
  start: (title?: string) => Promise<string | null>
  join: (roomId: string, title?: string) => Promise<void>
  invite: (peer: { accountId: string; handle: string }) => void
  leave: () => void
  toggleMute: () => void
  toggleCamera: () => void
  dismissInvite: () => void
  acceptInvite: () => Promise<void>
}

// Non-serializable mesh internals live outside the store: one RTCPeerConnection
// per remote member, plus its buffer of ICE candidates that arrived early.
interface PeerConn {
  pc: RTCPeerConnection
  pending: RTCIceCandidateInit[]
}
let peers = new Map<string, PeerConn>()
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
  function ensurePeer(accountId: string, handle: string): PeerConn {
    const found = peers.get(accountId)
    if (found) return found
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const local = get().localStream
    if (local) for (const track of local.getTracks()) pc.addTrack(track, local)
    const remote = new MediaStream()
    pc.onicecandidate = (e) => {
      if (e.candidate) signalTo(accountId, { kind: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? [e.track]) remote.addTrack(track)
      // Mix this peer's audio into the conversation recording.
      recorder?.addStream(remote)
      const p = get().participants[accountId]
      if (p) set({ participants: { ...get().participants, [accountId]: { ...p, stream: remote } } })
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
    const conn: PeerConn = { pc, pending: [] }
    peers.set(accountId, conn)
    // Register the participant tile immediately (so it shows "connecting").
    if (!get().participants[accountId]) {
      set({ participants: { ...get().participants, [accountId]: { accountId, handle, stream: null, connected: false } } })
    }
    return conn
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
    const rest = { ...get().participants }
    delete rest[accountId]
    set({ participants: rest })
  }

  function teardown(): void {
    for (const id of [...peers.keys()]) dropPeer(id)
    peers = new Map()
    get().localStream?.getTracks().forEach((t) => t.stop())
    set({
      roomId: null,
      title: null,
      status: 'idle',
      localStream: null,
      participants: {},
      muted: false,
      cameraOff: false
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
      notifyExternal('Meeting invite', `${e.payload.from.handle} invited you to ${e.payload.title ?? 'a meeting'}`, {
        force: true,
        tag: `meet-${e.payload.roomId}`
      })
      return
    }
    if (!state.roomId || e.payload.roomId !== state.roomId) return

    if (e.type === 'meetingRoster') {
      // I just joined: offer to everyone already here (I am the newcomer).
      for (const peer of e.payload.peers) {
        const conn = ensurePeer(peer.accountId, peer.handle)
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
      ensurePeer(e.payload.peer.accountId, e.payload.peer.handle)
      return
    }
    if (e.type === 'meetingPeerLeft') {
      dropPeer(e.payload.accountId)
      return
    }
    if (e.type === 'meetingSignal') {
      const from = e.payload.from
      let data: { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; handle?: string }
      try {
        data = JSON.parse(e.payload.data)
      } catch {
        return
      }
      const conn = ensurePeer(from, get().participants[from]?.handle ?? from)
      if (data.kind === 'offer' && data.sdp) {
        await conn.pc.setRemoteDescription(data.sdp)
        await flush(conn)
        const answer = await conn.pc.createAnswer()
        await conn.pc.setLocalDescription(answer)
        signalTo(from, { kind: 'answer', sdp: answer })
      } else if (data.kind === 'answer' && data.sdp) {
        await conn.pc.setRemoteDescription(data.sdp)
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
    participants: {},
    muted: false,
    cameraOff: false,
    error: null,
    incomingInvite: null,
    ready: false,

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
        // Start recording the conversation (own mic now, peers as they connect).
        recorder = new ConversationRecorder()
        recorder.addStream(local)
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
