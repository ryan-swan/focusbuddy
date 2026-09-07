import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  consentSummary,
  initialConsent,
  mayCapture,
  isConsentWire
} from '../../src/renderer/src/lib/meetingConsent'
import { MeetingTrackRecorder } from '../../src/renderer/src/lib/trackRecorder'

// ── M1 (SPEC-003) — the Stage, honest consent, per-track capture ────────────
// S3-DEC-024: recording is off until started; starting prompts everyone; a
// decline is honoured by construction; the state is named in words.
// C1 (operator-ruled foundation): one attributed take per participant — no
// model ever guesses "Speaker 1 vs 4" again.

describe('M1 — mayCapture: only an explicit yes', () => {
  it('pending is a no (capture starts when they answer, not before)', () => {
    expect(mayCapture('pending')).toBe(false)
    expect(mayCapture(undefined)).toBe(false)
  })
  it('declined is a no forever; both yes-shapes capture', () => {
    expect(mayCapture('declined')).toBe(false)
    expect(mayCapture('accepted')).toBe(true)
    expect(mayCapture('no-transcript')).toBe(true)
  })
})

describe('M1 — initialConsent: starting IS the initiator’s consent', () => {
  it('initiator accepted, everyone else owes an answer', () => {
    expect(initialConsent('me', ['a', 'b', 'me'])).toEqual({
      me: 'accepted',
      a: 'pending',
      b: 'pending'
    })
  })
})

describe('M1 — consentSummary: the state, named in words', () => {
  const names = (id: string): string => ({ a: 'Dana', b: 'Sam', c: 'Alex', me: 'you' })[id] ?? id
  it('not recording says so', () => {
    expect(consentSummary(false, {}, names)).toBe('Not recording')
  })
  it('recording alone', () => {
    expect(consentSummary(true, { me: 'accepted' }, names)).toBe('Recording · only you')
  })
  it('everyone consented', () => {
    expect(consentSummary(true, { me: 'accepted', a: 'accepted', b: 'no-transcript' }, names)).toBe(
      'Recording · all 3 consented'
    )
  })
  it('pending participants are NAMED — never just a count', () => {
    expect(
      consentSummary(true, { me: 'accepted', a: 'pending', b: 'pending' }, names)
    ).toBe('Recording · 1 of 3 consented — Dana and Sam have not responded')
  })
  it('a decline is stated, with what it means', () => {
    expect(consentSummary(true, { me: 'accepted', c: 'declined' }, names)).toBe(
      'Recording · 1 of 2 consented — Alex declined (not recorded)'
    )
  })
})

describe('M1 — the wire envelope', () => {
  it('recognises exactly the four consent kinds', () => {
    for (const kind of ['consent-request', 'consent-response', 'consent-state', 'recording-stopped'])
      expect(isConsentWire({ kind })).toBe(true)
    for (const kind of ['offer', 'answer', 'candidate', 'screen', undefined])
      expect(isConsentWire({ kind })).toBe(false)
  })
})

describe('M1 — MeetingTrackRecorder degrades honestly without browser audio', () => {
  it('in a DOM with no AudioContext it reports an empty take, never throws', async () => {
    const rec = new MeetingTrackRecorder()
    rec.tap('someone', null)
    expect(rec.isTapped('someone')).toBe(false)
    const take = await rec.stop()
    expect(take.mixed).toBeNull()
    expect(take.tracks).toEqual([])
  })
})

// ── source pins ─────────────────────────────────────────────────────────────
const SRC = join(__dirname, '../..', 'src/renderer/src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('M1 — recording is OFF until a person starts it', () => {
  const store = read('stores/meetingRoom.ts')
  it('the preference auto-start at join is GONE and must not return', () => {
    expect(store).not.toContain('whisperEnabled()')
    expect(store).toContain('no preference, calendar rule')
  })
  it('capture is gated on consent at the choke point', () => {
    expect(store).toContain('if (recorder && mayCapture(get().consent[accountId])) recorder.tap(accountId, camera)')
  })
  it('a newcomer during a recording is asked before a sample is captured', () => {
    expect(store).toContain("signalTo(e.payload.peer.accountId, { kind: 'consent-request'")
  })
  it('the initiator leaving ends the recording for everyone, said out loud', () => {
    expect(store).toContain("signalTo(id, { kind: 'recording-stopped' })")
  })
  it('a decline reaching the recorder stops that take', () => {
    expect(store).toContain("if (recorder && wire.choice === 'declined') recorder.untap(from)")
  })
  it('notes without a recording still become the record', () => {
    expect(store).toContain('saveMeetingNotesDoc(title, notes, moments')
  })
})

describe('M1 — the per-track foundation (C1, operator-ruled)', () => {
  const rec = read('lib/trackRecorder.ts')
  it('one attributed take per participant, audio only, one shared clock', () => {
    expect(rec).toContain('new MediaStream(stream.getAudioTracks())')
    expect(rec).toContain('offsetMs: Date.now() - this.t0')
  })
  it('tap is the single choke point and is idempotent', () => {
    expect(rec).toContain('if (!this.supported || !stream || this.taps.has(accountId)) return')
  })
  it('the wrap-up receives the tracks alongside the legacy mixed blob', () => {
    const wrapup = read('stores/wrapup.ts')
    expect(wrapup).toContain('tracks?: Array<{ accountId: string; buffer: ArrayBuffer')
    const store = read('stores/meetingRoom.ts')
    expect(store).toContain('tracks: take.tracks')
  })
})

describe('M1 — the Stage surface', () => {
  const ui = read('components/MeetingOverlay.tsx')
  it('the consent modal offers exactly the three ruled answers', () => {
    for (const tid of ['consent-modal', 'consent-accept', 'consent-no-transcript', 'consent-decline'])
      expect(ui).toContain(`data-testid="${tid}"`)
  })
  it('the header names the state in words, in BOTH layouts', () => {
    expect(ui).toContain('data-testid="consent-line"')
    expect(ui).toContain('data-testid="consent-line-mini"')
  })
  it('starting says everyone will be asked; only the initiator stops', () => {
    expect(ui).toContain('Start recording — everyone will be asked')
    expect(ui).toContain('if (transcribing && recordingBy !== myId) return')
  })
  it('the notepad is the surface: verbatim notes, moments, the honest transcript line', () => {
    expect(ui).toContain('data-testid="meeting-notes"')
    expect(ui).toContain('Type anything. Or nothing.')
    // History: M1 shipped one static note ('The transcript arrives after the
    // call'). M4 made ⌘⇧T a real live pane, so the idle branch now teaches
    // what pressing record does instead of describing a pane that no longer
    // waits for the call to end.
    expect(ui).toContain('Nothing is being recorded or transcribed.')
    expect(ui).toContain('⌘⇧M mark moment · ⌘⇧T transcript')
  })
  it('notes are saved first, never gated on the pipeline succeeding', () => {
    const wrapup = read('stores/wrapup.ts')
    expect(wrapup).toContain('saved first, not gated on the pipeline succeeding')
  })
})
