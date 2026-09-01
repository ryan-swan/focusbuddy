import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMeetingMomentUrl, parseMeetingMomentUrl } from '../../src/renderer/src/lib/meetingLink'

// The C5 round — the Record widget on the meeting desk (S3-DEC-020's last
// sliver) and the per-item MOMENT anchor (DEC-102's named deferral). The
// contract: a filed, anchored commitment carries a plexii:// URL naming the
// meeting AND the segment; the Attention chip parses before it opens, so
// internal moments route inside Plexii and DEC-091's web marks still go to
// the system browser untouched.

describe('meeting moment URLs', () => {
  it('round-trips meeting + segment through build and parse', () => {
    const url = buildMeetingMomentUrl('m-123', 'seg-456')
    expect(url).toBe('plexii://meeting/m-123?seg=seg-456')
    expect(parseMeetingMomentUrl(url)).toEqual({ meetingId: 'm-123', segmentId: 'seg-456' })
  })

  it('a meeting-level URL (no segment) parses with a null segment', () => {
    expect(parseMeetingMomentUrl(buildMeetingMomentUrl('m-1'))).toEqual({ meetingId: 'm-1', segmentId: null })
  })

  it('URL-encodes ids safely', () => {
    const url = buildMeetingMomentUrl('m/with?chars', 'seg&odd')
    expect(parseMeetingMomentUrl(url)).toEqual({ meetingId: 'm/with?chars', segmentId: 'seg&odd' })
  })

  it('web URLs are NOT moments — DEC-091 marks stay external', () => {
    expect(parseMeetingMomentUrl('https://example.com/thread/9')).toBeNull()
    expect(parseMeetingMomentUrl('')).toBeNull()
    expect(parseMeetingMomentUrl(null)).toBeNull()
    expect(parseMeetingMomentUrl('plexii://meeting/')).toBeNull()
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('C5 wiring pins', () => {
  const types = read('src/shared/types.ts')
  const canvas = read('src/renderer/src/components/Canvas.tsx')
  const widget = read('src/renderer/src/components/widgets/MeetingRecordWidget.tsx')
  const wrapup = read('src/renderer/src/stores/wrapup.ts')
  const card = read('src/renderer/src/components/MeetingCommitmentsCard.tsx')
  const attention = read('src/renderer/src/components/views/AttentionView.tsx')
  const toolbar = read('src/renderer/src/components/FloatingToolbar.tsx')

  it('the kind exists, renders on Canvas, and is minted by the wrap-up FIRST', () => {
    expect(types).toContain("| 'meeting-record'")
    expect(canvas).toContain("case 'meeting-record':")
    expect(wrapup).toContain("kind: 'meeting-record', content: meeting.id")
    // The Record leads the desk layout; the transcript doc sits beside it.
    expect(wrapup.indexOf("kind: 'meeting-record'")).toBeLessThan(wrapup.indexOf("kind: 'doc', content: docId"))
  })

  it('no empty shells: the kind is absent from the hand-add catalogue', () => {
    expect(toolbar).not.toContain('meeting-record')
  })

  it('the widget reads the store live and keeps the provenance tiers', () => {
    expect(widget).toContain('never copied into the widget')
    expect(widget).toContain("s.tier === 'yours'")
    expect(widget).toContain("s.tier === 'heard' && s.segmentId")
    expect(widget).toContain('data-testid="record-widget-heard"')
    // A heard line is a DOOR to its moment.
    expect(widget).toContain('openMeeting(s.segmentId)')
    // Honest states: no Record yet, and a deleted meeting says so.
    expect(widget).toContain('it is written at wrap-up')
    expect(widget).toContain('the Record went with it')
  })

  it('anchored commitments file with their moment; unanchored keep the meeting door only', () => {
    expect(card).toContain('sourceUrl: c.segment ? buildMeetingMomentUrl(meetingId, c.segment.id) : null')
  })

  it('the Attention chip parses before it opens: moments inside, web outside', () => {
    expect(attention).toContain('const moment = parseMeetingMomentUrl(i.sourceUrl)')
    expect(attention).toContain('if (moment) openMeeting(moment.meetingId, moment.segmentId)')
    expect(attention).toContain('else void window.api.files.openExternal(i.sourceUrl!)')
    expect(attention).toContain('Jump to the spoken moment in the meeting')
  })
})
