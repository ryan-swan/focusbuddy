import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECORD_TEMPLATES, DEFAULT_RECORD_TEMPLATE } from '../../src/renderer/src/lib/recordTemplates'

// ── M2c (SPEC-003) — container, templates, export, retention ────────────────

const ROOT = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('M2c — templates (§3.5): four ship, Commitments never templated', () => {
  it('the four ruled templates, Decisions & Actions default', () => {
    expect(RECORD_TEMPLATES.map((t) => t.name)).toEqual([
      'Decisions & Actions',
      'Client Call',
      '1:1',
      'Interview'
    ])
    expect(DEFAULT_RECORD_TEMPLATE.id).toBe('decisions')
    expect(RECORD_TEMPLATES.every((t) => t.sections.length >= 3)).toBe(true)
  })
  it('sections reach the Enhance prompt; the wrap-up uses the default', () => {
    expect(read('main/ai/enhanceRecord.ts')).toContain('input.sections ??')
    expect(read('renderer/src/stores/wrapup.ts')).toContain('sections: DEFAULT_RECORD_TEMPLATE.sections')
  })
  it('rebuilds keep yours spans untouched — the user’s words survive every template', () => {
    const ui = read('renderer/src/components/views/PlexiMeetView.tsx')
    expect(ui).toContain("const yours = (meeting.record?.spans ?? []).filter((s) => s.tier === 'yours')")
    expect(ui).toContain('[...yours, ...validateRecordSpans(enh.spans, segments)]')
  })
})

describe('M2c — retention (CR-13): local, windowed, zero means zero', () => {
  const audio = read('main/meetingAudio.ts')
  it('the five modes with 30 as the default', () => {
    expect(audio).toContain("cache = { mode: '30', v: 1 }")
    expect(audio).toContain("['0', '7', '30', '90', 'keep'].includes(p.mode)")
  })
  it('zero is enforced at the WRAP-UP — no save call at all, not a sweep later', () => {
    const w = read('renderer/src/stores/wrapup.ts')
    expect(w).toContain("if (retention !== '0') {")
    expect(w).toContain('not at a nightly sweep')
  })
  it('the sweep honours keep-mode and the per-meeting keep.flag', () => {
    expect(audio).toContain("if (mode === 'keep') return 0")
    expect(audio).toContain("if (existsSync(join(dir, 'keep.flag'))) continue")
  })
  it('a deleted meeting takes its audio with it', () => {
    expect(read('main/db/meetings.ts')).toContain('deleteAudioFor(id)')
  })
  it('the sweep runs at start, best-effort', () => {
    expect(read('main/ipc/index.ts')).toContain('sweepMeetingAudio()')
  })
})

describe('M2c — export (the non-negotiable): provenance survives the file', () => {
  const ex = read('main/meetingExport.ts')
  it('markdown carries notes, commitments, brief and transcript', () => {
    for (const h of ["'## Your notes'", "'## Commitments'", "'## Brief'", "'## Transcript'"])
      expect(ex).toContain(h)
  })
  it('heard exports as a timestamped quote; inferred is marked as inferred', () => {
    expect(ex).toContain('`> [${fmtMs(s.startMs)}] ${s.text}`')
    expect(ex).toContain('_(inferred)_')
  })
  it('json exports the full object; audio is named, not re-encoded', () => {
    expect(ex).toContain('segments: listTranscriptSegments(meetingId)')
    expect(ex).toContain('audio: audioInfo(meetingId)')
  })
})

describe('M2c — the container (S3-DEC-020): meetings mint a desk', () => {
  it('the wrap-up creates the desk with the transcript doc as a widget, meetings only', () => {
    const w = read('renderer/src/stores/wrapup.ts')
    expect(w).toContain("if (meeting?.id && forceLocalTranscription) {")
    expect(w).toContain("kind: 'task',")
    expect(w).toContain('deskNodeId: desk.id')
  })
  it('the meeting detail has the door', () => {
    const ui = read('renderer/src/components/views/PlexiMeetView.tsx')
    expect(ui).toContain('data-testid="meet-open-desk"')
    expect(ui).toContain('goTask(meeting.deskNodeId!)')
  })
})

describe('M2c — the whisper preference tells the truth now', () => {
  it('meetings never auto-record; the pref names calls only', () => {
    const ui = read('renderer/src/components/views/PlexiMeetView.tsx')
    expect(ui).toContain('Transcribe &amp; summarise my 1:1 calls')
    expect(ui).toContain('Meetings never auto-record')
    // History: the canon test (Part III + Part VII — no native selects)
    // replaced the retention <select> with a labelled pill + option chips.
    expect(ui).toContain('data-testid="meet-retention-pill"')
  })
})
