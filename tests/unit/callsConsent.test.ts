import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// The PlexiCam calls consent round — the M1 hole, closed in its 1:1 form.
// Before this round, one side's whisper preference silently recorded BOTH
// voices at connect and the peer was never told (the same defect M1 fixed
// for meetings, discovered in the same audit). The contract now:
//   - the preference expresses MY intent: it records MY mic and ASKS;
//   - the peer's stream is tapped on their consent-response, never before;
//   - a decline is honoured by construction — never tapped, call continues;
//   - the peer's own standing preference answers for them (both-on calls
//     record on both machines, each side consented);
//   - the state is named in words on both screens, continuously;
//   - the take rides the meeting pipeline: per-track, attributed, on-device.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

const store = read('src/renderer/src/stores/call.ts')
const overlay = read('src/renderer/src/components/CallOverlay.tsx')
const meetView = read('src/renderer/src/components/views/PlexiMeetView.tsx')

describe('calls consent — the hole is closed', () => {
  it('connect records ME and asks — the peer is never blind-captured', () => {
    expect(store).toContain("recorder.tap('me', local)")
    expect(store).toContain("signal(peer.accountId, callId, { kind: 'consent-request', byName: myName })")
    // The old silent both-sides capture is gone with its recorder.
    expect(store).not.toContain('ConversationRecorder')
    expect(store).not.toContain('recorder.addStream')
  })

  it('capture starts on the ANSWER: mayCapture gates the tap, decline never taps', () => {
    expect(store).toContain('if (mayCapture(choice) && recorder && get().remoteStream)')
    expect(store).toContain('a decline means their stream is simply never tapped')
    // Late media (renegotiation) applies the standing answer, not a new grab.
    expect(store).toContain("get().recordingBy === 'me' && mayCapture(get().peerConsent ?? undefined)")
  })

  it("the peer's standing preference answers for them; otherwise the modal asks", () => {
    expect(store).toContain("signal(state.peer.accountId, state.callId, { kind: 'consent-response', choice: 'accepted' })")
    expect(store).toContain('set({ consentAsk: { byName } })')
  })

  it('the modal names the machine and the stakes, and declining keeps the call', () => {
    expect(overlay).toContain('recorded and transcribed on their')
    expect(overlay).toContain('the call continues either way')
    expect(overlay).toContain('data-testid="call-consent-accept"')
    expect(overlay).toContain('data-testid="call-consent-decline"')
    expect(overlay).toContain('Not my voice')
  })

  it('the state is named in words on both screens, continuously', () => {
    expect(overlay).toContain('Recording · asking ${peerName}…')
    expect(overlay).toContain('Recording · only you — ${peerName} declined (not recorded)')
    expect(overlay).toContain('Recording · you and ${peerName} consented')
    expect(overlay).toContain('is transcribing this call — their machine, not yours')
    expect(overlay).toContain('data-testid="call-consent-line"')
  })

  it('Stop is requester-only, and the take-so-far survives to the wrap-up', () => {
    expect(overlay).toContain("recordingBy === 'me' && (")
    expect(overlay).toContain('data-testid="call-stop-transcribing"')
    expect(store).toContain('heldTake = take')
    expect(store).toContain("signal(peer.accountId, callId, { kind: 'recording-stopped' })")
  })

  it('a call now rides the meeting pipeline: per-track, attributed, on-device', () => {
    expect(store).toContain('tracks: take.tracks')
    expect(store).toContain("speakers: { me: 'You', [get().peer?.accountId ?? 'peer']: peerName }")
    expect(store).toContain('forceLocalTranscription: true')
  })

  it('the preference copy tells the new truth', () => {
    expect(meetView).toContain('Transcribe &amp; summarise my 1:1 calls (the other person is asked)')
    expect(meetView).toContain('declining keeps them out entirely')
  })

  it('the old silent recorder is gone from the tree', () => {
    expect(existsSync(join(ROOT, 'src/renderer/src/lib/conversationRecorder.ts'))).toBe(false)
  })
})
