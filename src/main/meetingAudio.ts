// M2c (SPEC-003 CR-13) — meeting audio retention, local-first.
//
// The ruling: audio stays on the user's disk, is never uploaded, and expires
// after 30 days unless the user says otherwise (0 / 7 / 30 / 90 / keep, with
// a per-meeting "keep this one" override). Two hard rules sit ABOVE the
// setting: a participant who declined has no audio written at any retention
// level (already true by construction — DEC-098's tap() never captured
// them), and zero means zero — the wrap-up skips the save entirely, so the
// takes die with the renderer's memory at the end of the Enhance pass, not
// at a nightly sweep.
//
// Layout: userData/meeting-audio/<meetingId>/<speaker>.webm + take.json
// (offsets + names), plus an optional keep.flag for the per-meeting
// override. Deleting a meeting deletes its takes (same rule as segments).

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { shell } from 'electron'

export type RetentionMode = '0' | '7' | '30' | '90' | 'keep'

interface RetentionPref {
  mode: RetentionMode
  v: 1
}

let cache: RetentionPref | null = null

function prefPath(): string {
  return join(app.getPath('userData'), 'meeting-audio-retention.json')
}

export function getAudioRetention(): RetentionMode {
  if (cache) return cache.mode
  try {
    if (existsSync(prefPath())) {
      const p = JSON.parse(readFileSync(prefPath(), 'utf-8')) as RetentionPref
      if (['0', '7', '30', '90', 'keep'].includes(p.mode)) {
        cache = p
        return p.mode
      }
    }
  } catch {
    /* fall through to the default */
  }
  cache = { mode: '30', v: 1 }
  return '30'
}

export function setAudioRetention(mode: RetentionMode): void {
  cache = { mode, v: 1 }
  try {
    writeFileSync(prefPath(), JSON.stringify(cache))
  } catch {
    /* best-effort */
  }
}

function audioRoot(): string {
  return join(app.getPath('userData'), 'meeting-audio')
}

function meetingDir(meetingId: string): string {
  return join(audioRoot(), meetingId)
}

export interface AudioTakeIn {
  speaker: string
  bytes: Uint8Array
  mimeType: string
  offsetMs: number
}

/** Persist a meeting's takes. The caller (wrap-up) has already honoured
 *  retention '0' by not calling this at all. */
export function saveAudioTakes(meetingId: string, takes: AudioTakeIn[]): { ok: boolean; path: string } {
  const dir = meetingDir(meetingId)
  mkdirSync(dir, { recursive: true })
  const meta: Array<{ file: string; speaker: string; offsetMs: number; mimeType: string }> = []
  takes.forEach((t, i) => {
    const safe = t.speaker.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || `speaker-${i}`
    const ext = t.mimeType.includes('ogg') ? 'ogg' : 'webm'
    const file = `${String(i).padStart(2, '0')}-${safe}.${ext}`
    writeFileSync(join(dir, file), Buffer.from(t.bytes))
    meta.push({ file, speaker: t.speaker, offsetMs: t.offsetMs, mimeType: t.mimeType })
  })
  writeFileSync(join(dir, 'take.json'), JSON.stringify({ meetingId, savedAt: Date.now(), takes: meta }))
  return { ok: true, path: dir }
}

export interface AudioInfo {
  present: boolean
  files: number
  bytes: number
  kept: boolean
  path: string
}

export function audioInfo(meetingId: string): AudioInfo {
  const dir = meetingDir(meetingId)
  if (!existsSync(dir)) return { present: false, files: 0, bytes: 0, kept: false, path: dir }
  let files = 0
  let bytes = 0
  for (const f of readdirSync(dir)) {
    if (f === 'keep.flag' || f === 'take.json') continue
    files++
    try {
      bytes += statSync(join(dir, f)).size
    } catch {
      /* fine */
    }
  }
  return { present: files > 0, files, bytes, kept: existsSync(join(dir, 'keep.flag')), path: dir }
}

/** Read a meeting's retained takes back — the raw material for a
 *  RE-TRANSCRIBE (the engine got better; the audio was kept for exactly
 *  this). Bytes stay on this machine: they go renderer-ward over IPC for
 *  the same on-device decode the wrap-up uses, never anywhere else. */
export function loadAudioTakes(
  meetingId: string
): Array<{ speaker: string; offsetMs: number; mimeType: string; bytes: Uint8Array }> {
  const dir = meetingDir(meetingId)
  const metaPath = join(dir, 'take.json')
  if (!existsSync(metaPath)) return []
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
      takes?: Array<{ file: string; speaker: string; offsetMs: number; mimeType: string }>
    }
    return (meta.takes ?? [])
      .filter((tk) => tk.file && !tk.file.includes('/') && !tk.file.includes('..'))
      .map((tk) => ({
        speaker: tk.speaker || 'Speaker',
        offsetMs: tk.offsetMs ?? 0,
        mimeType: tk.mimeType || 'audio/webm',
        bytes: new Uint8Array(readFileSync(join(dir, tk.file)))
      }))
  } catch {
    return []
  }
}

/** The per-meeting override (CR-13): "the meetings you'll want to replay
 *  are known at the time and are rare." */
export function setKeepAudio(meetingId: string, keep: boolean): boolean {
  const flag = join(meetingDir(meetingId), 'keep.flag')
  try {
    if (keep) {
      mkdirSync(meetingDir(meetingId), { recursive: true })
      writeFileSync(flag, String(Date.now()))
    } else if (existsSync(flag)) {
      unlinkSync(flag)
    }
    return true
  } catch {
    return false
  }
}

export function deleteAudioFor(meetingId: string): void {
  try {
    rmSync(meetingDir(meetingId), { recursive: true, force: true })
  } catch {
    /* best-effort */
  }
}

export function revealAudio(meetingId: string): boolean {
  const dir = meetingDir(meetingId)
  if (!existsSync(dir)) return false
  shell.showItemInFolder(join(dir, 'take.json'))
  return true
}

/** The sweep, at app start: takes older than the retention window go, unless
 *  the global mode is 'keep' or the meeting carries its own keep.flag. */
export function sweepMeetingAudio(nowMs = Date.now()): number {
  const mode = getAudioRetention()
  if (mode === 'keep') return 0
  const days = Number(mode)
  const maxAgeMs = days * 24 * 60 * 60 * 1000
  const root = audioRoot()
  if (!existsSync(root)) return 0
  let swept = 0
  for (const id of readdirSync(root)) {
    const dir = join(root, id)
    try {
      if (!statSync(dir).isDirectory()) continue
      if (existsSync(join(dir, 'keep.flag'))) continue
      const savedAt = ((): number => {
        try {
          return (JSON.parse(readFileSync(join(dir, 'take.json'), 'utf-8')) as { savedAt?: number }).savedAt ?? statSync(dir).mtimeMs
        } catch {
          return statSync(dir).mtimeMs
        }
      })()
      if (nowMs - savedAt > maxAgeMs) {
        rmSync(dir, { recursive: true, force: true })
        swept++
      }
    } catch {
      /* skip this dir */
    }
  }
  return swept
}
