// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { blockDraftForMeeting, blockForItem, DEFAULT_MEET_MIN } from '../../src/renderer/src/lib/meetSchedule'
import type { FbNode } from '../../src/shared/types'

// DEC-068 — the link between a Meet item and the block that reserves time for
// it. DEC-063 chose the pointing model, so this is a translation, not a merge:
// the item stays the record of the meeting.
const item = (over: Partial<FbNode> = {}): FbNode =>
  ({ id: 'w1', title: 'Draft review', kind: 'work_item', intentClass: 'to_meet', ...over }) as FbNode
const room = (): string => 'room-fixed'

describe('dec_068 — scheduling refuses rather than guesses', () => {
  it('dec_068_an_unanswered_invitation_has_nothing_to_reserve', () => {
    // The exact case DEC-063 exists to represent. Inventing a time would put
    // something on the calendar nobody agreed to.
    const out = blockDraftForMeeting(item({ meetRsvp: 'needed' }), room)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toMatch(/date and time/i)
  })

  it('dec_068_a_meeting_with_a_start_becomes_a_block', () => {
    const out = blockDraftForMeeting(
      item({ meetStartAt: '2026-09-02T14:00:00Z', meetDurationMin: 45 }),
      room
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.draft.taskId).toBe('w1') // the link itself
    expect(out.draft.startMs).toBe(Date.parse('2026-09-02T14:00:00Z'))
    expect(out.draft.durationMin).toBe(45)
    expect(out.draft.title).toBe('Draft review')
  })

  it('dec_068_a_meeting_with_no_length_gets_a_real_one_not_zero', () => {
    const out = blockDraftForMeeting(item({ meetStartAt: '2026-09-02T14:00:00Z' }), room)
    expect(out.ok && out.draft.durationMin).toBe(DEFAULT_MEET_MIN)
  })
})

describe('dec_068 — the block carries the meeting, so the calendar need not ask the item', () => {
  it('dec_068_join_link_location_and_invitees_travel_onto_the_block', () => {
    const out = blockDraftForMeeting(
      item({
        meetStartAt: '2026-09-02T14:00:00Z',
        meetUrl: 'https://meet.google.com/abc',
        meetLocation: 'Room 4',
        meetAttendees: 'sam@x.com, alex@x.com'
      }),
      room
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.draft.meeting?.joinUrl).toBe('https://meet.google.com/abc')
    expect(out.draft.meeting?.location).toBe('Room 4')
    expect(out.draft.meeting?.invitees).toEqual(['sam@x.com', 'alex@x.com'])
  })

  it('dec_068_a_room_is_always_minted_even_for_an_in_person_meeting', () => {
    // Same rule the composer follows: an in-person meeting can still be joined
    // remotely without anyone editing it first.
    const out = blockDraftForMeeting(
      item({ meetStartAt: '2026-09-02T14:00:00Z', meetLocation: '12 Bridge St' }),
      room
    )
    expect(out.ok && out.draft.meeting?.roomId).toBe('room-fixed')
  })

  it('dec_068_a_junk_join_link_does_not_become_a_dead_button_on_the_block', () => {
    const out = blockDraftForMeeting(
      item({ meetStartAt: '2026-09-02T14:00:00Z', meetUrl: 'zoom maybe?' }),
      room
    )
    expect(out.ok && out.draft.meeting?.joinUrl).toBeNull()
  })

  it('dec_068_the_planner_may_not_move_what_a_person_placed', () => {
    const out = blockDraftForMeeting(item({ meetStartAt: '2026-09-02T14:00:00Z' }), room)
    expect(out.ok && out.draft.origin).toBe('manual')
  })
})

describe('dec_068 — finding the block that already holds an item', () => {
  const blocks = [
    { taskId: null, id: 'b0' },
    { taskId: 'w9', id: 'b1' },
    { taskId: 'w1', id: 'b2' }
  ]
  it('dec_068_matches_on_the_link_not_on_the_time', () => {
    // A block dragged to another day is still THIS meeting's block; matching on
    // time would offer to schedule again and quietly create a duplicate.
    expect(blockForItem(blocks, 'w1')?.id).toBe('b2')
  })
  it('dec_068_no_block_is_null_not_a_throw', () => {
    expect(blockForItem(blocks, 'nope')).toBeNull()
    expect(blockForItem([], 'w1')).toBeNull()
  })
})
