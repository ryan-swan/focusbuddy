import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// M6 (SPEC-003 P6, CR-12) — Guest Capture, reduced mode. The contract under
// test: no roster handshake, a non-dismissible disclosure whose only verb is
// Stop, attribution by construction (You/Them, never a guessed name), no
// outbound-ask path (guests never enter the extractor roster), CR-11
// local-only transcription, and mic-only as the honest, named floor.

// ── behavioural: the store's two modes and its handoff ──────────────────────

const wrapupBegin = vi.fn()
vi.mock('../../src/renderer/src/stores/wrapup', () => ({
  useWrapupStore: { getState: () => ({ begin: wrapupBegin }) }
}))
const originCalls: unknown[] = []
vi.mock('../../src/renderer/src/lib/startMeeting', () => ({
  markCalendarOrigin: (m: unknown) => originCalls.push(m),
  clearMeetingOrigin: () => originCalls.push('cleared')
}))
const taps: Array<[string, unknown]> = []
vi.mock('../../src/renderer/src/lib/trackRecorder', () => ({
  MeetingTrackRecorder: class {
    startedAt = 1000
    tap(id: string, stream: unknown): void {
      taps.push([id, stream])
    }
    stop(): Promise<unknown> {
      return Promise.resolve({
        mixed: { buffer: new ArrayBuffer(4), mimeType: 'audio/webm', durationSec: 9 },
        tracks: [],
        startedAt: 1000
      })
    }
  }
}))

import { useGuestCaptureStore, GUESTS_ID } from '../../src/renderer/src/stores/guestCapture'

function fakeStream(audioTracks: number): MediaStream {
  const track = (): MediaStreamTrack => ({ stop: vi.fn(), kind: 'audio' }) as unknown as MediaStreamTrack
  const audio = Array.from({ length: audioTracks }, track)
  return {
    getTracks: () => audio,
    getAudioTracks: () => audio,
    getVideoTracks: () => [{ stop: vi.fn(), kind: 'video' }]
  } as unknown as MediaStream
}

function stubMedia(opts: { displayAudio: number | 'reject' }): void {
  const md = {
    getUserMedia: vi.fn().mockResolvedValue(fakeStream(1)),
    getDisplayMedia:
      opts.displayAudio === 'reject'
        ? vi.fn().mockRejectedValue(new Error('denied'))
        : vi.fn().mockResolvedValue(fakeStream(opts.displayAudio))
  }
  Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: md, configurable: true })
  ;(globalThis as Record<string, unknown>).window = Object.assign(globalThis.window ?? globalThis, {
    api: { guestCapture: { arm: vi.fn().mockResolvedValue(true) } }
  })
}

// The store keeps module-level singletons; MediaStream shim for happy-dom.
;(globalThis as Record<string, { new (t: unknown[]): unknown }>).MediaStream = class {
  private t: unknown[]
  constructor(tracks: unknown[]) {
    this.t = tracks
  }
  getTracks(): unknown[] {
    return this.t
  }
  getAudioTracks(): unknown[] {
    return this.t
  }
} as never

describe('guest capture — modes and handoff', () => {
  beforeEach(() => {
    wrapupBegin.mockClear()
    taps.length = 0
    originCalls.length = 0
    useGuestCaptureStore.setState({ status: 'idle', mode: 'mic-only', title: '', startedAt: null, moments: [] })
  })

  it('with loopback audio: both tracks tapped, mode both, series origin marked', async () => {
    stubMedia({ displayAudio: 1 })
    const ok = await useGuestCaptureStore.getState().start({ title: 'Zoom weekly', blockId: 'b1', seriesId: 's1' })
    expect(ok).toBe(true)
    expect(useGuestCaptureStore.getState().mode).toBe('both')
    expect(taps.map(([id]) => id)).toEqual(['me', GUESTS_ID])
    expect(originCalls[0]).toMatchObject({ title: 'Zoom weekly', seriesId: 's1' })
  })

  it('no system audio: the capture CONTINUES mic-only — the floor, not a failure', async () => {
    stubMedia({ displayAudio: 'reject' })
    const ok = await useGuestCaptureStore.getState().start({ title: 'Teams call' })
    expect(ok).toBe(true)
    expect(useGuestCaptureStore.getState().mode).toBe('mic-only')
    expect(taps.map(([id]) => id)).toEqual(['me'])
  })

  it('a display stream WITHOUT audio tracks also degrades honestly to mic-only', async () => {
    stubMedia({ displayAudio: 0 })
    await useGuestCaptureStore.getState().start({ title: 'x' })
    expect(useGuestCaptureStore.getState().mode).toBe('mic-only')
  })

  it('stop hands the take to the SAME wrap-up: You/Them speakers, local-only', async () => {
    stubMedia({ displayAudio: 1 })
    await useGuestCaptureStore.getState().start({ title: 'Zoom weekly' })
    useGuestCaptureStore.getState().stop()
    await vi.waitFor(() => expect(wrapupBegin).toHaveBeenCalled())
    const arg = wrapupBegin.mock.calls[0][0]
    expect(arg.speakers).toEqual({ me: 'You', [GUESTS_ID]: 'Them' })
    expect(arg.forceLocalTranscription).toBe(true)
    expect(arg.title).toBe('Zoom weekly')
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('M6 wiring pins', () => {
  const store = read('src/renderer/src/stores/guestCapture.ts')
  const bar = read('src/renderer/src/components/GuestCaptureBar.tsx')
  const main = read('src/main/index.ts')
  const wrapup = read('src/renderer/src/stores/wrapup.ts')
  const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')
  const meet = read('src/renderer/src/components/views/PlexiMeetView.tsx')
  const app = read('src/renderer/src/App.tsx')

  it('CR-12 reduced mode is stated and built: no handshake, no outbound-ask', () => {
    expect(store).toContain('NO roster handshake')
    expect(store).toContain('NO outbound-ask path')
    // Guests never become owners: filtered from the extractor roster.
    expect(wrapup).toContain("s.speakerAccountId !== 'guests'")
    expect(store).toContain("export const GUESTS_ID = 'guests'")
  })

  it('the disclosure bar is non-dismissible: its verbs are Stop and ⚑, nothing else', () => {
    expect(bar).toContain('data-testid="guest-capture-bar"')
    expect(bar).toContain('data-testid="guest-capture-stop"')
    expect(bar).toContain('data-testid="guest-capture-moment"')
    // No third affordance exists: exactly two buttons, moment and stop.
    expect(bar.split('<button').length - 1).toBe(2)
    expect(app).toContain('<GuestCaptureBar />')
  })

  it('mic-only is the honest floor, named in the header exactly as ruled', () => {
    expect(bar).toContain('Plexii can hear you, not them')
    expect(store).toContain('mic-only')
  })

  it('the transcribe bridge passes forceProvider through (the CR-11 seam)', () => {
    // Caught live in M6's first full round: the preload sent
    // forceProvider: 'local', the main handler dropped it, and the cloud
    // preference answered — every real meeting wrap-up on a cloud-preference
    // machine failed (closed, but failed). The seam is now pinned.
    const ipc = read('src/main/ipc/index.ts')
    const bridge = ipc.slice(ipc.indexOf("'ai:transcribeAudio'"), ipc.indexOf("'ai:processTranscript'"))
    expect(bridge).toContain("input.forceProvider === 'local'")
    expect(bridge).toContain('forceProvider:')
  })

  it('the armed grant is one-shot and restores the system picker', () => {
    expect(main).toContain("ipcMain.handle('guestCapture:arm'")
    expect(main).toContain('const forGuestCapture = guestCaptureArmed')
    expect(main).toContain('guestCaptureArmed = false')
    expect(main).toContain("callback(forGuestCapture ? { video: primary, audio: 'loopback' } : { video: primary })")
    expect(main).toContain('if (forGuestCapture) applyDisplayMediaHandler(ses)')
  })

  it('nothing visual is recorded: the vehicle video track dies immediately', () => {
    expect(store).toContain('display.getVideoTracks().forEach((t) => t.stop())')
  })

  it('recording is its own act: the grid door is separate from Join, external only', () => {
    expect(grid).toContain('data-testid="block-record-external"')
    expect(grid).toContain('block.meeting?.joinUrl && (')
    expect(grid).toContain('never a side effect of opening a link')
    expect(meet).toContain('data-testid="meet-record-external"')
  })
})
