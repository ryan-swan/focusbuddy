import { create } from 'zustand'
import { sendSocketMessage, setCallSocketHandler, type CallSocketEvent } from '../lib/messagingSocket'
import { notifyExternal } from '../lib/notify'
import { ConversationRecorder } from '../lib/conversationRecorder'
import { useWrapupStore } from './wrapup'

// PlexiCam: peer-to-peer live audio/video calls. The signal server only relays
// the SDP offer/answer and ICE candidates between two accounts in the same
// presence audience; the media itself flows directly peer to peer (the server
// never sees it). This is a 1:1 mesh call. It uses public STUN for NAT
// discovery, which works on most home and office networks. Reliable traversal of
// symmetric NATs and large multi-party rooms need a TURN server and an SFU; those
// are a server-infrastructure phase, not built here, and the UI says so honestly
// rather than pretending a call connected when it could not.

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended'
export type CallMedia = 'audio' | 'video'

interface Peer {
  accountId: string
  handle: string
}

interface CallStore {
  status: CallStatus
  callId: string | null
  peer: Peer | null
  media: CallMedia
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  muted: boolean
  cameraOff: boolean
  error: string | null
  // True once init() has wired the socket handler, so we never double-register.
  ready: boolean

  init: () => void
  startCall: (peer: Peer, media: CallMedia) => Promise<void>
  accept: () => Promise<void>
  decline: () => void
  hangup: () => void
  toggleMute: () => void
  toggleCamera: () => void
}

// Non-serializable call internals live outside the store. Which side creates the
// offer is decided by the events received (the caller offers on callAccepted, the
// callee answers on receiving the offer), so no explicit role flag is needed.
let pc: RTCPeerConnection | null = null
// ICE candidates that arrive before the remote description is set are buffered.
let pendingCandidates: RTCIceCandidateInit[] = []
// Records the mixed call audio once connected, for an end-of-call summary.
let recorder: ConversationRecorder | null = null

function genCallId(): string {
  return `call-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function signal(to: string, callId: string, data: unknown): void {
  sendSocketMessage({ type: 'callSignal', payload: { callId, to, data: JSON.stringify(data) } })
}

export const useCallStore = create<CallStore>((set, get) => {
  // Tear down the peer connection and local media, returning to idle.
  function cleanup(nextStatus: CallStatus): void {
    // Wrap up the call: stop the recording and, when the call actually ended
    // (not a decline), hand the audio to the summary + deliverables flow.
    if (recorder) {
      const rec = recorder
      recorder = null
      if (nextStatus === 'ended') {
        const title = `Call with ${get().peer?.handle ?? 'someone'}`
        void rec.stop().then((res) => {
          if (res && res.durationSec >= 2) {
            void useWrapupStore.getState().begin({ title, buffer: res.buffer, mimeType: res.mimeType, durationSec: res.durationSec })
          }
        })
      } else {
        void rec.stop()
      }
    }
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      try {
        pc.close()
      } catch {
        /* already closed */
      }
      pc = null
    }
    get().localStream?.getTracks().forEach((t) => t.stop())
    pendingCandidates = []
    set({
      status: nextStatus,
      localStream: null,
      remoteStream: null,
      muted: false,
      cameraOff: false
    })
    // After a brief ended state, reset to idle so the overlay can dismiss.
    if (nextStatus === 'ended') {
      window.setTimeout(() => {
        if (get().status === 'ended') set({ status: 'idle', callId: null, peer: null, error: null })
      }, 1500)
    }
  }

  async function getMedia(media: CallMedia): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: media === 'video' })
  }

  // Build the RTCPeerConnection, attach local tracks, and wire ICE + remote track
  // handling. Shared by both the caller and the callee.
  function buildPc(peer: Peer, callId: string, local: MediaStream): RTCPeerConnection {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    for (const track of local.getTracks()) conn.addTrack(track, local)
    conn.onicecandidate = (e) => {
      if (e.candidate) signal(peer.accountId, callId, { kind: 'candidate', candidate: e.candidate.toJSON() })
    }
    const remote = new MediaStream()
    conn.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? [e.track]) remote.addTrack(track)
      // Tap the peer's audio into the recording (no-op until tracks arrive).
      recorder?.addStream(remote)
      set({ remoteStream: remote })
    }
    conn.onconnectionstatechange = () => {
      const st = conn.connectionState
      if (st === 'connected') {
        set({ status: 'connected' })
        // Start recording the call audio (both sides) for the end-of-call summary.
        if (!recorder) {
          recorder = new ConversationRecorder()
          recorder.addStream(local)
          recorder.addStream(remote)
        }
      }
      else if (st === 'failed') {
        set({ error: 'The connection failed. Your network may need a TURN server.' })
        cleanup('ended')
      } else if (st === 'disconnected' || st === 'closed') {
        if (get().status !== 'ended') cleanup('ended')
      }
    }
    return conn
  }

  async function flushPendingCandidates(): Promise<void> {
    if (!pc) return
    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* a malformed candidate is non-fatal */
      }
    }
    pendingCandidates = []
  }

  async function onSocket(e: CallSocketEvent): Promise<void> {
    const state = get()
    if (e.type === 'callIncoming') {
      // Ignore a second incoming call while already busy: decline it honestly.
      if (state.status !== 'idle') {
        sendSocketMessage({ type: 'callDecline', payload: { callId: e.payload.callId, to: e.payload.from.accountId } })
        return
      }
      set({
        status: 'incoming',
        callId: e.payload.callId,
        peer: e.payload.from,
        media: e.payload.media,
        error: null
      })
      // Alert even if the app is focused — an incoming call is interruptive by
      // nature. Clicking just brings the window forward; the overlay handles answer.
      notifyExternal(`Incoming ${e.payload.media} call`, `${e.payload.from.handle} is calling`, {
        force: true,
        tag: `call-${e.payload.callId}`
      })
      return
    }
    // All other events must match the active call.
    if (!state.callId || e.payload.callId !== state.callId) return
    if (e.type === 'callDeclined') {
      set({ status: 'ended', error: `${state.peer?.handle ?? 'They'} declined the call.` })
      cleanup('ended')
      return
    }
    if (e.type === 'callEnded') {
      cleanup('ended')
      return
    }
    if (e.type === 'callAccepted') {
      // The callee accepted: the caller now creates and sends the offer.
      if (!pc || !state.peer) return
      set({ status: 'connecting' })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      signal(state.peer.accountId, state.callId, { kind: 'offer', sdp: offer })
      return
    }
    if (e.type === 'callSignal') {
      if (!state.peer) return
      let data: { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
      try {
        data = JSON.parse(e.payload.data)
      } catch {
        return
      }
      if (data.kind === 'offer' && data.sdp) {
        // Callee receives the offer, answers it.
        if (!pc) return
        set({ status: 'connecting' })
        await pc.setRemoteDescription(data.sdp)
        await flushPendingCandidates()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        signal(state.peer.accountId, state.callId, { kind: 'answer', sdp: answer })
      } else if (data.kind === 'answer' && data.sdp) {
        if (!pc) return
        await pc.setRemoteDescription(data.sdp)
        await flushPendingCandidates()
      } else if (data.kind === 'candidate' && data.candidate) {
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(data.candidate)
          } catch {
            /* non-fatal */
          }
        } else {
          pendingCandidates.push(data.candidate)
        }
      }
    }
  }

  return {
    status: 'idle',
    callId: null,
    peer: null,
    media: 'video',
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOff: false,
    error: null,
    ready: false,

    init: () => {
      if (get().ready) return
      setCallSocketHandler((e) => void onSocket(e))
      set({ ready: true })
    },

    startCall: async (peer, media) => {
      if (get().status !== 'idle') return
      const callId = genCallId()
      set({ status: 'calling', callId, peer, media, error: null, remoteStream: null })
      try {
        const local = await getMedia(media)
        set({ localStream: local })
        pc = buildPc(peer, callId, local)
        sendSocketMessage({ type: 'callInvite', payload: { callId, to: peer.accountId, media } })
      } catch {
        set({ status: 'ended', error: 'Could not access your microphone or camera. Check system permissions.' })
        cleanup('ended')
      }
    },

    accept: async () => {
      const { status, peer, callId, media } = get()
      if (status !== 'incoming' || !peer || !callId) return
      try {
        const local = await getMedia(media)
        set({ localStream: local, status: 'connecting' })
        pc = buildPc(peer, callId, local)
        // Tell the caller we accepted; they will send the offer.
        sendSocketMessage({ type: 'callAccept', payload: { callId, to: peer.accountId } })
      } catch {
        sendSocketMessage({ type: 'callDecline', payload: { callId, to: peer.accountId } })
        set({ status: 'ended', error: 'Could not access your microphone or camera. Check system permissions.' })
        cleanup('ended')
      }
    },

    decline: () => {
      const { peer, callId } = get()
      if (peer && callId) sendSocketMessage({ type: 'callDecline', payload: { callId, to: peer.accountId } })
      cleanup('idle')
      set({ callId: null, peer: null })
    },

    hangup: () => {
      const { peer, callId } = get()
      if (peer && callId) sendSocketMessage({ type: 'callEnd', payload: { callId, to: peer.accountId } })
      cleanup('ended')
    },

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
