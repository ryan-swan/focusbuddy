import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildBriefUrl,
  parseBriefUrl,
  buildBriefMessage,
  parseBriefMessage
} from '../../src/renderer/src/lib/meetingLink'
import { ingestBrief, type BriefInboxDeps } from '../../src/renderer/src/lib/briefInbox'
import type { ChatMessage } from '../../src/renderer/src/lib/messagingClient'

// Q14, completed — briefs for the OTHER attendees. The out-of-room channel
// is PlexiChat DMs (server-persisted, delivered live or on next open); the
// contract is двойная sovereignty: the HOST opts in to SEND per series
// (default off — sending is its own act), and the RECIPIENT opts in to FILE
// per series (nothing files until they say so). The prose always survives:
// an old client sees a useful message, never noise.

describe('the brief wire', () => {
  it('message round-trips: title, multi-line summary, series + meeting ids', () => {
    const body = buildBriefMessage({
      title: 'Weekly sync',
      summary: 'Vendor chosen.\nKickoff moves to March.',
      seriesId: 's1',
      meetingId: 'm1'
    })
    expect(parseBriefMessage(body)).toEqual({
      title: 'Weekly sync',
      summary: 'Vendor chosen.\nKickoff moves to March.',
      seriesId: 's1',
      meetingId: 'm1'
    })
  })

  it('the marker is the LAST line by contract, and ordinary chat is not a brief', () => {
    expect(parseBriefMessage('hey, lunch?')).toBeNull()
    expect(parseBriefMessage(`${buildBriefUrl('s1', 'm1')}\nwords after the marker`)).toBeNull()
    expect(parseBriefMessage(null)).toBeNull()
  })

  it('brief URLs encode and parse; web URLs are not briefs', () => {
    expect(parseBriefUrl(buildBriefUrl('s/odd?id', 'm&1'))).toEqual({ seriesId: 's/odd?id', meetingId: 'm&1' })
    expect(parseBriefUrl('https://example.com')).toBeNull()
  })
})

describe('ingestBrief — the recipient decision table', () => {
  const msg = (over: Partial<ChatMessage> = {}): ChatMessage =>
    ({
      id: over.id ?? `msg-${Math.random()}`,
      conversationId: 'c1',
      fromAccount: 'host-1',
      body: buildBriefMessage({ title: 'Weekly sync', summary: 'Vendor chosen.', seriesId: 's1', meetingId: 'm1' }),
      attachment: null,
      createdAt: 0,
      ...over
    }) as ChatMessage

  function makeDeps(followBriefs: boolean | null): {
    deps: BriefInboxDeps
    filed: unknown[]
    notices: Array<{ text: string; action?: { label: string; run: () => void } }>
    prefWrites: unknown[]
  } {
    const filed: unknown[] = []
    const notices: Array<{ text: string; action?: { label: string; run: () => void } }> = []
    const prefWrites: unknown[] = []
    return {
      filed,
      notices,
      prefWrites,
      deps: {
        selfAccountId: 'me-1',
        senderName: 'Dana',
        getPrefs: async () => ({ followBriefs }),
        setPrefs: async (s, p) => prefWrites.push([s, p]),
        fileItem: async (i) => filed.push(i),
        notify: (n) => notices.push(n)
      }
    }
  }

  beforeEach(() => localStorage.clear())

  it('never asked: the notice IS the opt-in — nothing files until they say so', async () => {
    const { deps, filed, notices, prefWrites } = makeDeps(null)
    await ingestBrief(msg(), deps)
    expect(filed).toEqual([])
    expect(notices[0].text).toContain('Dana shared the meeting brief')
    expect(notices[0].action?.label).toBe('File it + follow this series')
    notices[0].action!.run()
    await vi.waitFor(() => expect(filed.length).toBe(1))
    expect(prefWrites).toEqual([['s1', { followBriefs: true }]])
    expect(filed[0]).toMatchObject({ title: 'Meeting brief — Weekly sync', notes: 'Vendor chosen.' })
  })

  it('following: files quietly, with the door OUT on the same notice', async () => {
    const { deps, filed, notices } = makeDeps(true)
    await ingestBrief(msg(), deps)
    expect(filed.length).toBe(1)
    expect(notices[0].text).toContain('Meeting brief filed')
    expect(notices[0].action?.label).toBe('Stop following this series')
  })

  it('declined: nothing happens — the chat message stays readable, that is all', async () => {
    const { deps, filed, notices } = makeDeps(false)
    await ingestBrief(msg(), deps)
    expect(filed).toEqual([])
    expect(notices).toEqual([])
  })

  it('idempotent: the same message via socket AND history acts exactly once', async () => {
    const { deps, notices } = makeDeps(null)
    const m = msg({ id: 'stable-1' })
    await ingestBrief(m, deps)
    await ingestBrief(m, deps)
    expect(notices.length).toBe(1)
  })

  it('my own sent brief and deleted messages are ignored', async () => {
    const { deps, notices } = makeDeps(null)
    await ingestBrief(msg({ fromAccount: 'me-1' }), deps)
    await ingestBrief(msg({ deletedAt: 5 }), deps)
    expect(notices).toEqual([])
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('Q14 wiring pins', () => {
  const outbox = read('src/renderer/src/lib/briefOutbox.ts')
  const inbox = read('src/renderer/src/lib/briefInbox.ts')
  const wrapup = read('src/renderer/src/stores/wrapup.ts')
  const room = read('src/renderer/src/stores/meetingRoom.ts')
  const messaging = read('src/renderer/src/stores/messaging.ts')
  const prep = read('src/main/meetingPrep.ts')
  const meet = read('src/renderer/src/components/views/PlexiMeetView.tsx')

  it('sending is gated by the host knob, default OFF, series meetings only', () => {
    expect(prep).toContain('Default OFF — sending is\n   *  its own act')
    expect(wrapup).toContain('.then((p) => p.shareBriefs)')
    expect(wrapup).toContain("if (meeting?.seriesId && meeting?.id && summary.trim() && attendees?.length)")
    expect(meet).toContain('data-testid="series-share-toggle"')
    expect(meet).toContain('Send the brief to the other attendees too')
  })

  it('the outbox never hijacks the chat view, and skips self', () => {
    expect(outbox).toContain('the wrap-up must not hijack their chat')
    expect(outbox).toContain('a.accountId === input.selfAccountId) continue')
  })

  it('the roster with handles survives teardown into the wrap-up', () => {
    expect(room).toContain('const attendees = Object.values(get().participants).map((p) => ({')
    expect(room).toContain('attendees\n            })')
  })

  it('both ingest points feed the inbox: live socket and history load', () => {
    expect(messaging).toContain('maybeIngestBrief(incoming.message, sender)')
    expect(messaging).toContain("maybeIngestBrief(m, personDisplayName(from, 'Someone'))")
  })

  it("the recipient's filed item is a note — no dead door dressed as a live one", () => {
    expect(inbox).toContain("sourceType: 'note'")
    expect(inbox).toContain('a chip pointing at a meeting this client does not have')
  })
})
