// M1 (SPEC-003, C1) — the per-track meeting recorder. RULED as foundation by
// the operator: no AI ever guesses "Speaker 1 vs 4" again.
//
// The mesh already holds ONE MediaStream per participant, each bound to a
// known accountId. Recording each separately makes attribution exact by
// construction — every word belongs to the person whose stream carried it.
// This must exist before any transcript schema does (M2), or we transcribe
// blobs we can never attribute.
//
// A mixed track is still produced alongside (the same WebAudio graph the old
// ConversationRecorder used) because the CURRENT wrap-up pipeline transcribes
// one blob; M2 rewires transcription onto the tracks and the mix becomes a
// convenience artifact. All offsets share one clock (the recorder's t0) so
// per-track segments can be merged into one timeline later.
//
// Consent is enforced ABOVE this class (the store only calls tap() for
// participants `mayCapture` allows) — but tap() is also the single choke
// point, which is what makes "a decline is never captured" provable.

export interface TrackTake {
  accountId: string
  buffer: ArrayBuffer
  mimeType: string
  /** ms from the recording's t0 at which this track's capture began. */
  offsetMs: number
  durationSec: number
}

export interface MeetingTake {
  mixed: { buffer: ArrayBuffer; mimeType: string; durationSec: number } | null
  tracks: TrackTake[]
  startedAt: number
}

interface Tap {
  rec: MediaRecorder
  chunks: Blob[]
  offsetMs: number
  startedWall: number
  stoppedWall: number | null
  src: MediaStreamAudioSourceNode | null
}

export class MeetingTrackRecorder {
  private ctx: AudioContext | null = null
  private dest: MediaStreamAudioDestinationNode | null = null
  private mixedRec: MediaRecorder | null = null
  private mixedChunks: Blob[] = []
  private taps = new Map<string, Tap>()
  private t0 = Date.now()
  private supported = true

  constructor() {
    try {
      this.ctx = new AudioContext()
      this.dest = this.ctx.createMediaStreamDestination()
      this.mixedRec = new MediaRecorder(this.dest.stream)
      this.mixedRec.ondataavailable = (e) => {
        if (e.data.size > 0) this.mixedChunks.push(e.data)
      }
      this.mixedRec.start(1000)
      this.t0 = Date.now()
    } catch {
      // No recorder available: degrade to unsupported; stop() returns null
      // mixed and empty tracks, and the caller skips the wrap-up.
      this.supported = false
    }
  }

  get startedAt(): number {
    return this.t0
  }

  /** Capture one participant's stream, attributed. Idempotent per account;
   *  ignores streams with no audio. THE choke point for consent. */
  tap(accountId: string, stream: MediaStream | null | undefined): void {
    if (!this.supported || !stream || this.taps.has(accountId)) return
    if (stream.getAudioTracks().length === 0) return
    let rec: MediaRecorder
    try {
      // Record the audio only — the per-track take is for transcription, and
      // video would multiply the file size for nothing.
      const audioOnly = new MediaStream(stream.getAudioTracks())
      rec = new MediaRecorder(audioOnly)
    } catch {
      return
    }
    const tap: Tap = {
      rec,
      chunks: [],
      offsetMs: Date.now() - this.t0,
      startedWall: Date.now(),
      stoppedWall: null,
      src: null
    }
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) tap.chunks.push(e.data)
    }
    rec.start(1000)
    // And into the mix, for the legacy single-blob pipeline.
    if (this.ctx && this.dest) {
      try {
        tap.src = this.ctx.createMediaStreamSource(stream)
        tap.src.connect(this.dest)
      } catch {
        tap.src = null
      }
    }
    this.taps.set(accountId, tap)
  }

  /** Is this participant currently being captured? */
  isTapped(accountId: string): boolean {
    return this.taps.has(accountId)
  }

  /** Stop capturing one participant (they left, or consent was withdrawn).
   *  Their take-so-far is kept; nothing further is written. */
  untap(accountId: string): void {
    const tap = this.taps.get(accountId)
    if (!tap || tap.stoppedWall != null) return
    tap.stoppedWall = Date.now()
    try {
      tap.rec.stop()
    } catch {
      /* already stopped */
    }
    try {
      tap.src?.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  /** Stop everything and hand back the take: per-track, attributed, on one
   *  clock — plus the mixed blob for the legacy pipeline. */
  async stop(): Promise<MeetingTake> {
    if (!this.supported) return { mixed: null, tracks: [], startedAt: this.t0 }
    const stopOne = (rec: MediaRecorder, chunks: Blob[]): Promise<Blob[]> =>
      new Promise((resolve) => {
        if (rec.state === 'inactive') return resolve(chunks)
        rec.onstop = () => resolve(chunks)
        try {
          rec.stop()
        } catch {
          resolve(chunks)
        }
      })
    const tracks: TrackTake[] = []
    for (const [accountId, tap] of this.taps) {
      const end = tap.stoppedWall ?? Date.now()
      const chunks = await stopOne(tap.rec, tap.chunks)
      if (!chunks.length) continue
      const blob = new Blob(chunks, { type: tap.rec.mimeType || 'audio/webm' })
      tracks.push({
        accountId,
        buffer: await blob.arrayBuffer(),
        mimeType: blob.type,
        offsetMs: tap.offsetMs,
        durationSec: Math.max(0, Math.round((end - tap.startedWall) / 1000))
      })
      try {
        tap.src?.disconnect()
      } catch {
        /* fine */
      }
    }
    let mixed: MeetingTake['mixed'] = null
    if (this.mixedRec) {
      const chunks = await stopOne(this.mixedRec, this.mixedChunks)
      if (chunks.length) {
        const blob = new Blob(chunks, { type: this.mixedRec.mimeType || 'audio/webm' })
        mixed = {
          buffer: await blob.arrayBuffer(),
          mimeType: blob.type,
          durationSec: Math.max(0, Math.round((Date.now() - this.t0) / 1000))
        }
      }
    }
    try {
      await this.ctx?.close()
    } catch {
      /* fine */
    }
    this.taps.clear()
    return { mixed, tracks, startedAt: this.t0 }
  }
}
