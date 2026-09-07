// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  nextSilentMs,
  DIGITAL_SILENCE_AFTER_MS,
  MIC_SILENCE_MESSAGE,
  MIC_DENIED_MESSAGE,
  MIC_FAILED_MESSAGE
} from '../../src/renderer/src/lib/micHealth'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const meet = read('src/renderer/src/components/views/PlexiMeetView.tsx')
const dialog = read('src/renderer/src/components/RecordDialog.tsx')
const guest = read('src/renderer/src/stores/guestCapture.ts')
const bar = read('src/renderer/src/components/GuestCaptureBar.tsx')
const pill = read('src/renderer/src/components/MicLevelPill.tsx')
const wrapup = read('src/renderer/src/stores/wrapup.ts')
const health = read('src/renderer/src/lib/micHealth.ts')
const ipc = read('src/main/ipc/index.ts')
const preload = read('src/preload/index.ts')
const origin = read('src/renderer/src/lib/startMeeting.ts')

// DEC-130 — the microphone audit. Operator live QA: "Record notes" ran for
// three minutes and produced "you you you you you you". The track was live and
// every sample was zero — macOS had not allowed the microphone, and nothing
// in the app said so. These pin the guards and the one recording pipeline.

describe('the sentinel rule (pure)', () => {
  it('sound resets the silent clock; zero frames extend it', () => {
    expect(nextSilentMs(0, 250, 0)).toBe(250)
    expect(nextSilentMs(250, 250, 0)).toBe(500)
    expect(nextSilentMs(2900, 250, 0.0004)).toBe(0) // a noise floor counts as sound
    expect(nextSilentMs(100, -5, 0)).toBe(100) // a clock that went backwards adds nothing
  })
  it('three seconds of zeros is the line', () => {
    expect(DIGITAL_SILENCE_AFTER_MS).toBe(3000)
  })
  it('the messages name the cause and the fix', () => {
    for (const m of [MIC_SILENCE_MESSAGE, MIC_DENIED_MESSAGE]) {
      expect(m).toContain('System Settings')
      expect(m).toContain('Microphone')
    }
    expect(MIC_FAILED_MESSAGE).toBe('Could not access the microphone. Check your system permissions.')
  })
  it('the probe never blocks a recording it cannot judge, and only zeros count as silence', () => {
    expect(health).toContain("if (!a) return { peak: 1, rms: 1, digitalSilence: false }")
    expect(health).toContain('digitalSilence: frames > 0 && peak === 0')
  })
})

describe('every recording door asks the system, listens first, and watches while it runs', () => {
  it('Record notes (PlexiMeet)', () => {
    expect(meet).toContain('async function startRecording(draft?: RecordNotesDraft): Promise<StartResult> {')
    expect(meet).toContain('const access = await ensureMicrophoneAccess()')
    expect(meet).toContain('const probe = await probeMicrophone(stream, 1200)')
    expect(meet).toContain("return { ok: false, reason: 'mic-silent', message: MIC_SILENCE_MESSAGE }")
    expect(meet).toContain('const stopWatch = watchMicrophone(stream, (s) => setMicState({ peak: s.peak, silentMs: s.silentMs }))')
    expect(meet).toContain('<MicLevelPill peak={micState.peak} silentMs={micState.silentMs} />')
  })
  it('Record external (guest capture)', () => {
    expect(guest).toContain('const access = await ensureMicrophoneAccess()')
    expect(guest).toContain('const probe = await probeMicrophone(micStream, 1200)')
    expect(guest).toContain("return { ok: false, reason: 'mic-silent', message: MIC_SILENCE_MESSAGE }")
    expect(guest).toContain('stopWatch = watchMicrophone(micStream, (s) => set({ micPeak: s.peak, micSilentMs: s.silentMs }))')
    expect(guest).toContain('}) => Promise<StartResult>')
    expect(bar).toContain('<MicLevelPill peak={micPeak} silentMs={micSilentMs} dark />')
  })
  it('the dialog shows the reason and the one door', () => {
    expect(dialog).toContain('onStartNotes: (draft: RecordNotesDraft) => Promise<StartResult>')
    expect(dialog).toContain('onStartExternal: (draft: RecordExternalDraft) => Promise<StartResult>')
    expect(dialog).toContain('setError(r.message)')
    expect(dialog).toContain('data-testid="record-mic-settings"')
    expect(dialog).toContain('onClick={openMicrophoneSettings}')
  })
  it('the pill: five bars, or the plain truth with the settings door', () => {
    expect(pill).toContain('data-testid="mic-silent"')
    expect(pill).toContain('No sound is reaching Plexii')
    expect(pill).toContain('data-testid="mic-settings"')
    expect(pill).toContain('const silent = silentMs >= DIGITAL_SILENCE_AFTER_MS')
  })
  it('the system is asked through main (effective after the app restarts onto it) and guarded in the renderer', () => {
    expect(ipc).toContain("ipcMain.handle('media:micStatus', () => {")
    expect(ipc).toContain("systemPreferences.getMediaAccessStatus('microphone')")
    expect(ipc).toContain("ipcMain.handle('media:askMic', async () => {")
    expect(ipc).toContain("systemPreferences.askForMediaAccess('microphone')")
    expect(preload).toContain("micStatus: (): Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'> =>")
    expect(preload).toContain("askMicrophone: (): Promise<boolean> => ipcRenderer.invoke('media:askMic')")
    expect(health).toContain('if (!media?.micStatus) return { ok: true }')
  })
})

describe('Record notes is the same recording as every other door', () => {
  it('per-track recorder, on-device transcription, the wrap-up — never the cloud path, never a plain transcript', () => {
    expect(meet).toContain('const rec = new MeetingTrackRecorder()')
    expect(meet).toContain("rec.tap('me', stream)")
    expect(meet).toContain('void useWrapupStore.getState().begin({')
    expect(meet).toContain('forceLocalTranscription: true,')
    expect(meet).toContain("speakers: { me: 'You' },")
    expect(meet).toContain('deskNodeId: draft?.deskNodeId ?? null')
    expect(meet).not.toContain('async function transcribeAndSave(')
    // the notes door itself never builds a bare MediaRecorder (the message
    // recorder elsewhere on the page legitimately does)
    const notesDoor = meet.slice(meet.indexOf('async function startRecording('), meet.indexOf('function stopRecording('))
    expect(notesDoor).not.toContain('new MediaRecorder(')
    expect(meet).toContain('transcribed ON THIS MACHINE')
  })
  it('the picked desk is the origin and the container; nothing is minted over it', () => {
    expect(origin).toContain('export function markDeskOrigin(nodeId: string, title: string): void {')
    expect(meet).toContain('if (draft?.deskNodeId) markDeskOrigin(draft.deskNodeId, title)')
    expect(wrapup).toContain('deskNodeId?: string | null')
    expect(wrapup).toContain('const desk = deskNodeId\n        ? { id: deskNodeId }\n        : await useNodeStore.getState().create({')
  })
  it('the wrap-up refuses a transcript that is not a transcript', () => {
    expect(wrapup).toContain("import { transcriptLooksEmpty, NO_SPEECH_MESSAGE } from '../lib/transcriptSanity'")
    expect(wrapup).toContain('if (!transcript || transcriptLooksEmpty(transcript, durationSec)) {')
    expect(wrapup).toContain("set({ status: 'error', error: NO_SPEECH_MESSAGE })")
  })
})
