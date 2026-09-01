import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { collapseRepeatRuns } from '../../src/main/ai/whisperCore'

// The transcription-quality round (operator's demo take: whisper-tiny looped
// "So we can kill every time we go to the next level" TWELVE times over a
// real 36.5s deliverables recording, and the commitments extractor honestly
// found nothing in the mush). The ruling, decided by measurement on that
// exact audio: whisper-base for wrap-up truth, tiny only for the live pane,
// anti-loop decode settings, and a repeat-collapse net for anything that
// still slips through.

const seg = (startMs: number, text: string): { startMs: number; endMs: number; text: string; confidence: null } => ({
  startMs,
  endMs: startMs + 2000,
  text,
  confidence: null
})

describe('collapseRepeatRuns — the repetition net', () => {
  it('a run of three-plus identical segments collapses to ONE spanning the run', () => {
    const out = collapseRepeatRuns([
      seg(0, 'I think we can do that.'),
      seg(2000, 'So we can kill every time.'),
      seg(4000, 'So we can kill every time.'),
      seg(6000, 'so we can kill, every time!'),
      seg(8000, 'And then the real content.')
    ])
    expect(out.map((s) => s.text)).toEqual([
      'I think we can do that.',
      'So we can kill every time.',
      'And then the real content.'
    ])
    // The collapsed segment spans the whole run.
    expect(out[1].startMs).toBe(2000)
    expect(out[1].endMs).toBe(8000)
  })

  it('a pair is legitimate speech, not a loop — kept', () => {
    const out = collapseRepeatRuns([seg(0, 'yes'), seg(2000, 'yes'), seg(4000, 'moving on')])
    expect(out.length).toBe(3)
  })

  it('non-adjacent repeats are conversation, not decoder failure — kept', () => {
    const out = collapseRepeatRuns([seg(0, 'okay'), seg(2000, 'details here'), seg(4000, 'okay')])
    expect(out.length).toBe(3)
  })

  it('empty in, empty out', () => {
    expect(collapseRepeatRuns([])).toEqual([])
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('the model ruling, wired', () => {
  const client = read('src/main/ai/localWhisper.ts')
  const core = read('src/main/ai/whisperCore.ts')
  const live = read('src/main/ai/liveDecode.ts')
  const audio = read('src/main/meetingAudio.ts')
  const meet = read('src/renderer/src/components/views/PlexiMeetView.tsx')
  const ipc = read('src/main/ipc/index.ts')

  it('the ROOT cause: `task: transcribe` is never passed — it poisons base', () => {
    // Proven by measurement on the operator's take: task:'transcribe' looped
    // a real 36.5s recording into "So So So…"; its absence transcribes clean.
    // The DECODE_OPTS object must not carry task; the comment naming the bug
    // may (and does). Assert on the options object's own lines.
    const optsStart = core.indexOf('export const DECODE_OPTS = {')
    const optsBlock = core.slice(optsStart, core.indexOf('}', optsStart))
    expect(optsBlock.includes('task:')).toBe(false)
    expect(optsBlock.includes('no_repeat_ngram_size: 3')).toBe(true)
    expect(core).toContain('THE root-cause bug')
  })

  it('wrap-up truth defaults to base; the live pane pins tiny explicitly', () => {
    expect(client).toContain("const model = opts.model ?? 'base'")
    expect(core).toContain("base: 'Xenova/whisper-base'")
    expect(live).toContain("transcribeLocal(job.samples, 16000, { model: 'tiny' })")
  })

  it('the anti-loop decode settings + collapse net ride every local pass', () => {
    expect(core).toContain('chunk_length_s: 30')
    expect(core).toContain('stride_length_s: 5')
    expect(core).toContain('no_repeat_ngram_size: 3')
    expect(client).toContain('shapeSegments(result.chunks')
    expect(core).toContain('return collapseRepeatRuns(raw)')
  })

  it('preload warms the wrap-up model (base), not the courtesy one', () => {
    expect(client).toContain("model: LocalWhisperModel = 'base'")
  })

  it('the decode is two-stage: native-rate decode, OfflineAudioContext resample', () => {
    // Caught live on the operator's take: a 16kHz-forced AudioContext makes
    // Chromium resample DURING opus decode with a low-quality path — the
    // same bytes ffmpeg decoded cleanly transcribed as mush. The feed, not
    // the model.
    const rec = read('src/renderer/src/lib/transcribeRecording.ts')
    expect(rec).toContain('const probe = new AC()')
    expect(rec).not.toContain('new AC({ sampleRate: 16000 })')
    expect(rec).toContain('new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)')
  })

  it('re-transcribe: retained takes reload with a traversal guard, local-only', () => {
    expect(audio).toContain("!tk.file.includes('/') && !tk.file.includes('..')")
    expect(ipc).toContain("ipcMain.handle('meetings:loadAudioTakes'")
    expect(meet).toContain('data-testid="meet-retranscribe"')
    expect(meet).toContain('audio never leaves this machine')
    // The corrected transcript reopens the commitments door.
    expect(meet).toContain('setFoundCommitments(null)\n    } finally {')
  })
})
