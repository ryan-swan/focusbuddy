import { vi, describe, it, expect, beforeEach } from 'vitest'

// Capture what the call store sends over the socket and the handler it registers,
// so we can drive the signaling state machine without a real connection.
const sent: Array<{ type: string; payload: Record<string, unknown> }> = []
let callHandler: ((e: { type: string; payload: Record<string, unknown> }) => void) | null = null

vi.mock('../../src/renderer/src/lib/messagingSocket', () => ({
  sendSocketMessage: (m: { type: string; payload: Record<string, unknown> }) => sent.push(m),
  setCallSocketHandler: (cb: ((e: { type: string; payload: Record<string, unknown> }) => void) | null) => {
    callHandler = cb
  }
}))

// Minimal WebRTC + media fakes so the store's getUserMedia / RTCPeerConnection
// paths run in node without a browser.
class FakeTrack {
  enabled = true
  constructor(public kind: string) {}
  stop(): void {}
}
class FakeStream {
  tracks: FakeTrack[]
  constructor(video: boolean) {
    this.tracks = [new FakeTrack('audio'), ...(video ? [new FakeTrack('video')] : [])]
  }
  getTracks(): FakeTrack[] {
    return this.tracks
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video')
  }
  addTrack(t: FakeTrack): void {
    this.tracks.push(t)
  }
}
class FakePC {
  onicecandidate: ((e: unknown) => void) | null = null
  ontrack: ((e: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  connectionState = 'new'
  remoteDescription: unknown = null
  addTrack(): void {}
  async createOffer(): Promise<object> {
    return { type: 'offer', sdp: 'o' }
  }
  async createAnswer(): Promise<object> {
    return { type: 'answer', sdp: 'a' }
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(d: unknown): Promise<void> {
    this.remoteDescription = d
  }
  async addIceCandidate(): Promise<void> {}
  close(): void {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
g.RTCPeerConnection = FakePC
g.MediaStream = FakeStream
g.navigator = { mediaDevices: { getUserMedia: async (c: { video?: boolean }) => new FakeStream(!!c.video) } }

import { useCallStore } from '../../src/renderer/src/stores/call'

function reset(): void {
  sent.length = 0
  useCallStore.setState({
    status: 'idle',
    callId: null,
    peer: null,
    media: 'video',
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOff: false,
    error: null,
    ready: false
  })
  useCallStore.getState().init()
}

describe('call store (PlexiCam signaling state machine)', () => {
  beforeEach(reset)

  it('startCall goes to calling and sends a callInvite to the peer', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    expect(useCallStore.getState().status).toBe('calling')
    expect(useCallStore.getState().peer?.accountId).toBe('b')
    const invite = sent.find((m) => m.type === 'callInvite')
    expect(invite?.payload.to).toBe('b')
    expect(invite?.payload.media).toBe('video')
  })

  it('an incoming call moves to the incoming state with the caller set', () => {
    callHandler!({ type: 'callIncoming', payload: { callId: 'c1', from: { accountId: 'a', handle: 'amy' }, media: 'video' } })
    expect(useCallStore.getState().status).toBe('incoming')
    expect(useCallStore.getState().peer?.handle).toBe('amy')
    expect(useCallStore.getState().callId).toBe('c1')
  })

  it('accepting an incoming call sends callAccept and connects', async () => {
    callHandler!({ type: 'callIncoming', payload: { callId: 'c1', from: { accountId: 'a', handle: 'amy' }, media: 'audio' } })
    await useCallStore.getState().accept()
    expect(sent.some((m) => m.type === 'callAccept' && m.payload.to === 'a')).toBe(true)
    expect(useCallStore.getState().status).toBe('connecting')
  })

  it('the caller sends an offer when the callee accepts', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    const callId = useCallStore.getState().callId!
    callHandler!({ type: 'callAccepted', payload: { callId, from: 'b' } })
    // The handler is fire-and-forget (wrapped as void), so let its async
    // createOffer/setLocalDescription microtasks settle before asserting.
    await new Promise((r) => setTimeout(r, 0))
    const offer = sent.find((m) => m.type === 'callSignal')
    expect(offer).toBeTruthy()
    expect(JSON.parse(String(offer!.payload.data)).kind).toBe('offer')
  })

  it('a decline from the peer ends the call with an honest message', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    const callId = useCallStore.getState().callId!
    callHandler!({ type: 'callDeclined', payload: { callId, from: 'b' } })
    expect(useCallStore.getState().status).toBe('ended')
    expect(useCallStore.getState().error).toMatch(/declined/i)
  })

  it('a second incoming call while busy is auto-declined, not stacked', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    sent.length = 0
    callHandler!({ type: 'callIncoming', payload: { callId: 'c2', from: { accountId: 'x', handle: 'xy' }, media: 'video' } })
    expect(useCallStore.getState().peer?.accountId).toBe('b') // unchanged
    expect(sent.some((m) => m.type === 'callDecline' && m.payload.callId === 'c2')).toBe(true)
  })

  it('hangup sends callEnd and decline sends callDecline', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    useCallStore.getState().hangup()
    expect(sent.some((m) => m.type === 'callEnd')).toBe(true)

    reset()
    callHandler!({ type: 'callIncoming', payload: { callId: 'c3', from: { accountId: 'a', handle: 'amy' }, media: 'video' } })
    useCallStore.getState().decline()
    expect(sent.some((m) => m.type === 'callDecline' && m.payload.callId === 'c3')).toBe(true)
    expect(useCallStore.getState().status).toBe('idle')
  })

  it('toggleMute and toggleCamera flip the local track enabled state', async () => {
    await useCallStore.getState().startCall({ accountId: 'b', handle: 'bob' }, 'video')
    const stream = useCallStore.getState().localStream as unknown as FakeStream
    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().muted).toBe(true)
    expect(stream.getAudioTracks()[0].enabled).toBe(false)
    useCallStore.getState().toggleCamera()
    expect(useCallStore.getState().cameraOff).toBe(true)
    expect(stream.getVideoTracks()[0].enabled).toBe(false)
  })
})
