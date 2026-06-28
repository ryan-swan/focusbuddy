// Records a whole conversation by mixing the audio of every participant (your own
// mic plus each remote peer) into one track and capturing it with MediaRecorder.
// Used by PlexiMeet meetings and PlexiCam calls so that, when the call ends, there
// is a real recording to transcribe and summarise. It captures what THIS client
// could hear, which is the honest, achievable scope without a server-side media
// mixer. Streams are added as peers connect and the mix updates live.

export class ConversationRecorder {
  private ctx: AudioContext
  private dest: MediaStreamAudioDestinationNode
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private sources = new Map<MediaStream, MediaStreamAudioSourceNode>()
  private startedAt = 0
  private supported = true

  constructor() {
    try {
      this.ctx = new AudioContext()
      this.dest = this.ctx.createMediaStreamDestination()
      this.rec = new MediaRecorder(this.dest.stream)
      this.rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      // A timeslice guarantees we accumulate data even for short calls.
      this.rec.start(1000)
      this.startedAt = Date.now()
    } catch {
      // No audio context / recorder available — degrade silently; stop() returns
      // null and the caller skips the wrap-up rather than failing the call.
      this.supported = false
      this.ctx = null as unknown as AudioContext
      this.dest = null as unknown as MediaStreamAudioDestinationNode
    }
  }

  // Tap a stream's audio into the mix. Idempotent; ignores video-only or empty
  // streams. Safe to call as each participant connects.
  addStream(stream: MediaStream | null | undefined): void {
    if (!this.supported || !stream || this.sources.has(stream)) return
    if (stream.getAudioTracks().length === 0) return
    try {
      const src = this.ctx.createMediaStreamSource(stream)
      src.connect(this.dest)
      this.sources.set(stream, src)
    } catch {
      /* a stream that can't be tapped is non-fatal */
    }
  }

  removeStream(stream: MediaStream | null | undefined): void {
    if (!stream) return
    const src = this.sources.get(stream)
    if (src) {
      try {
        src.disconnect()
      } catch {
        /* already disconnected */
      }
      this.sources.delete(stream)
    }
  }

  // Stop recording and return the mixed audio. Returns null if recording was
  // unsupported or produced nothing (e.g. an instant hang-up).
  async stop(): Promise<{ buffer: ArrayBuffer; mimeType: string; durationSec: number } | null> {
    const rec = this.rec
    if (!this.supported || !rec || rec.state === 'inactive') {
      void this.ctx?.close?.().catch(() => {})
      return null
    }
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000)
    return new Promise((resolve) => {
      rec.onstop = async () => {
        for (const src of this.sources.values()) {
          try {
            src.disconnect()
          } catch {
            /* ignore */
          }
        }
        this.sources.clear()
        await this.ctx.close().catch(() => {})
        if (this.chunks.length === 0) {
          resolve(null)
          return
        }
        const mimeType = rec.mimeType || 'audio/webm'
        const blob = new Blob(this.chunks, { type: mimeType })
        resolve({ buffer: await blob.arrayBuffer(), mimeType, durationSec })
      }
      try {
        rec.stop()
      } catch {
        resolve(null)
      }
    })
  }
}
