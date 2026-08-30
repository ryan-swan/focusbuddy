// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const meetOverlay = read('src/renderer/src/components/MeetingOverlay.tsx')
const callOverlay = read('src/renderer/src/components/CallOverlay.tsx')
const blockedHook = read('src/renderer/src/lib/useVideoBlocked.ts')
const wrapup = read('src/renderer/src/stores/wrapup.ts')
const executor = read('src/renderer/src/lib/actionExecutor.ts')
const cards = read('src/renderer/src/components/ProposalCards.tsx')
const wrapOverlay = read('src/renderer/src/components/WrapupOverlay.tsx')
const tags = read('src/renderer/src/lib/itemTags.ts')
const att = read('src/renderer/src/components/views/AttentionView.tsx')
const meetView = read('src/renderer/src/components/views/PlexiMeetView.tsx')

// DEC-078 — video in Plexi Meet. Root causes, both measured live over CDP:
// (1) autoPlay never started playback when srcObject landed after mount
//     (tile paused at readyState 0 with a live track attached);
// (2) macOS TCC can refuse frames while getUserMedia still resolves — the
//     track arrives live-but-muted forever, and the tile rendered pure black
//     with no error anywhere (the dev app inherits the LAUNCHING app's TCC
//     identity, which was denied camera with prompting disallowed).

describe('dec_078 — video tiles actually play', () => {
  it('dec_078_both_overlays_play_explicitly_after_srcObject', () => {
    // VoiceRecorderWidget learned this first; the tiles now do the same.
    for (const src of [meetOverlay, callOverlay]) {
      expect(src).toContain('void el.play().catch(')
      expect(src).toContain('el.onloadedmetadata')
    }
  })

  it('dec_078_a_muted_track_is_surfaced_never_a_black_tile', () => {
    expect(blockedHook).toContain('setBlocked(track.muted)')
    expect(blockedHook).toContain("addEventListener('unmute'")
    expect(meetOverlay).toContain('useVideoBlocked(localStream)')
    expect(meetOverlay).toContain('camera-blocked-note')
    expect(callOverlay).toContain('useVideoBlocked(localStream)')
    expect(callOverlay).toContain('camera-blocked-note')
    // The hint names the actual fix, not a shrug.
    expect(blockedHook).toContain('System Settings → Privacy & Security → Camera')
  })

  it('dec_078_blocked_state_never_hides_the_camera_off_choice', () => {
    // cameraOff (the user's own toggle) and cameraBlocked (the OS refusing)
    // are different facts; the note only shows for the OS case.
    expect(meetOverlay).toContain('cameraBlocked && !cameraOff')
  })
})

// DEC-079 — items born from a meeting transcript link BACK to the meeting.

describe('dec_079 — the wrap-up knows which meeting it produced', () => {
  it('dec_079_the_meeting_create_is_awaited_and_its_id_kept', () => {
    // It was fire-and-forget before, so the id was unknowable at approve time.
    expect(wrapup).toContain('const meeting = await useMeetingsStore')
    expect(wrapup).toContain("meetingId: meeting?.id ?? null")
    expect(wrapup).toContain('meetingId: string | null')
  })

  it('dec_079_a_failed_save_degrades_to_unlinked_never_blocks_review', () => {
    expect(wrapup).toContain('.catch(() => null)')
  })
})

describe('dec_079 — provenance rides the one apply path', () => {
  it('dec_079_executor_stamps_the_source_with_chat_as_the_default', () => {
    expect(executor).toContain("sourceType: ctx.workItemSource?.sourceType ?? 'chat'")
    expect(executor).toContain('sourceRef: ctx.workItemSource?.sourceRef')
    expect(executor).toContain('workItemSource?: { sourceType: string; sourceRef: string }')
  })

  it('dec_079_cards_thread_it_and_the_wrapup_names_the_meeting', () => {
    expect(cards).toContain('workItemSource?:')
    expect(cards).toContain('destinationFolderId, workItemSource })')
    expect(wrapOverlay).toContain("{ sourceType: 'meeting', sourceRef: meetingId }")
  })
})

describe('dec_079 — the queue links back', () => {
  it('dec_079_meeting_chip_is_a_link_not_a_label', () => {
    expect(att).toContain("ctx.source.type === 'meeting'")
    expect(att).toContain('item-meeting-link')
    expect(att).toContain('openMeeting(ctx.source!.ref)')
    expect(tags).toContain("case 'meeting':")
  })

  it('dec_079_open_meeting_navigates_then_hands_off_the_selection', () => {
    // The same post-navigation handoff pattern openHere uses for widgets.
    expect(att).toContain('goMeetings()')
    expect(att).toContain("'fb:open-meeting'")
    expect(meetView).toContain("window.addEventListener('fb:open-meeting'")
    expect(meetView).toContain('setSelectedId(id)')
  })
})
