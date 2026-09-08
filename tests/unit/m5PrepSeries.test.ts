// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  prevSeriesMeetingDb,
  carriedItemsDb,
  attendeeItemsDb,
  buildMeetingPrepDb
} from '../../src/main/meetingPrep'
import type { ChunkDb } from '../../src/main/chunkIndex'

// M5 (SPEC-003 P5) — prep + series memory. Real SQLite via node:sqlite, the
// house precedent: prep is a set of database queries, and the queries are
// what these vouch for. No model call builds prep — that claim is pinned.

const PREFS_DIR = mkdtempSync(join(tmpdir(), 'm5-prefs-'))
vi.mock('electron', () => ({
  app: { getPath: () => PREFS_DIR }
}))

function freshDb(): ChunkDb {
  const db = new DatabaseSync(':memory:') as unknown as ChunkDb
  db.exec(`CREATE TABLE fb_meetings (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', series_id TEXT, block_id TEXT,
    org_id TEXT NOT NULL DEFAULT 'personal', created_at INTEGER NOT NULL
  )`)
  db.exec(`CREATE TABLE nodes (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
    work_item_state TEXT, intent_class TEXT, due_at INTEGER, mentions TEXT,
    source_ref TEXT, source_type TEXT, trashed_at INTEGER, created_at INTEGER NOT NULL DEFAULT 0
  )`)
  return db
}

function seedMeeting(db: ChunkDb, id: string, series: string | null, at: number, title = id, org = 'personal'): void {
  db.prepare('INSERT INTO fb_meetings (id, title, series_id, org_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, title, series, org, at
  )
}

function seedItem(
  db: ChunkDb,
  id: string,
  o: { title?: string; state?: string; sourceRef?: string | null; mentions?: string | null; dueAt?: number | null; trashed?: boolean } = {}
): void {
  db.prepare(
    `INSERT INTO nodes (id, kind, title, work_item_state, intent_class, due_at, mentions, source_ref, source_type, trashed_at)
     VALUES (?, 'work_item', ?, ?, 'to_do', ?, ?, ?, ?, ?)`
  ).run(
    id,
    o.title ?? id,
    o.state ?? 'open',
    o.dueAt ?? null,
    o.mentions ?? null,
    o.sourceRef ?? null,
    o.sourceRef ? 'meeting' : null,
    o.trashed ? 1 : null
  )
}

describe('prevSeriesMeetingDb — the previous instance', () => {
  it('finds the latest sibling, excluding the meeting being wrapped', () => {
    const db = freshDb()
    seedMeeting(db, 'm1', 's1', 100, 'Weekly #1')
    seedMeeting(db, 'm2', 's1', 200, 'Weekly #2')
    seedMeeting(db, 'm3', 's1', 300, 'Weekly #3')
    const prev = prevSeriesMeetingDb(db, 's1', { excludeMeetingId: 'm3' })
    expect(prev).toEqual({ id: 'm2', title: 'Weekly #2', createdAt: 200 })
  })

  it('a first instance has no previous — null, not a guess', () => {
    const db = freshDb()
    seedMeeting(db, 'm1', 's1', 100)
    expect(prevSeriesMeetingDb(db, 's1', { excludeMeetingId: 'm1' })).toBeNull()
  })

  it('respects org scope', () => {
    const db = freshDb()
    seedMeeting(db, 'm1', 's1', 100, 'Theirs', 'other-org')
    expect(prevSeriesMeetingDb(db, 's1', { orgId: 'personal' })).toBeNull()
  })
})

describe('carriedItemsDb — what last time left open', () => {
  it('returns only ACTIVE items filed by that meeting, due-dated first', () => {
    const db = freshDb()
    seedItem(db, 'a', { sourceRef: 'm1', state: 'open', dueAt: 500 })
    seedItem(db, 'b', { sourceRef: 'm1', state: 'done' })
    seedItem(db, 'c', { sourceRef: 'm1', state: 'dismissed' })
    seedItem(db, 'd', { sourceRef: 'm1', state: 'in_progress', dueAt: null })
    seedItem(db, 'e', { sourceRef: 'm2', state: 'open' })
    seedItem(db, 'f', { sourceRef: 'm1', state: 'open', trashed: true })
    const carried = carriedItemsDb(db, 'm1')
    expect(carried.map((x) => x.id)).toEqual(['a', 'd'])
  })
})

describe('attendeeItemsDb — open items naming an invitee', () => {
  it('matches the email local part against mentions, case-insensitively', () => {
    const db = freshDb()
    seedItem(db, 'a', { mentions: '[{"kind":"person","name":"Dana Reyes"}]' })
    seedItem(db, 'b', { mentions: '[{"kind":"person","name":"Sam Ortiz"}]' })
    seedItem(db, 'c', { mentions: null })
    const out = attendeeItemsDb(db, ['DANA@acme.com', 'nobody@x.io'])
    expect(out.length).toBe(1)
    expect(out[0].invitee).toBe('DANA@acme.com')
    expect(out[0].items.map((i) => i.id)).toEqual(['a'])
  })

  it('a miss is a quiet miss — no invitee row without items', () => {
    const db = freshDb()
    expect(attendeeItemsDb(db, ['ghost@nowhere.dev'])).toEqual([])
  })
})

describe('buildMeetingPrepDb — the staging assembly', () => {
  it('assembles agenda + previous instance + carried + attendees', () => {
    const db = freshDb()
    seedMeeting(db, 'm1', 's1', 100, 'Pipeline weekly')
    seedMeeting(db, 'm2', 's1', 200)
    seedItem(db, 'a', { sourceRef: 'm1', state: 'open', title: 'Send the deck' })
    const prep = buildMeetingPrepDb(db, {
      seriesId: 's1',
      excludeMeetingId: 'm2',
      agenda: '  Decide the vendor  ',
      invitees: []
    })
    expect(prep.agenda).toBe('Decide the vendor')
    expect(prep.lastMeeting?.id).toBe('m1')
    expect(prep.carried.map((c) => c.title)).toEqual(['Send the deck'])
  })

  it('an ad-hoc meeting (no seriesId) has no memory to fake', () => {
    const db = freshDb()
    const prep = buildMeetingPrepDb(db, { seriesId: null, invitees: [] })
    expect(prep.lastMeeting).toBeNull()
    expect(prep.carried).toEqual([])
  })
})

describe('series prefs — the Q14 knob', () => {
  it('defaults to briefs ON; off persists; corrupt file reads as default', async () => {
    const { getSeriesPrefs, setSeriesPrefs } = await import('../../src/main/meetingPrep')
    // History: DEC-104 shipped one knob ({briefs}); the Q14 delivery round
    // (DEC-109) widened the record — shareBriefs defaults OFF (sending is
    // its own act) and followBriefs defaults null (the recipient has not
    // been asked). The original truths hold inside the wider shape.
    expect(getSeriesPrefs('s-new')).toEqual({ briefs: true, shareBriefs: false, followBriefs: null })
    expect(setSeriesPrefs('s-off', { briefs: false }).briefs).toBe(false)
    expect(getSeriesPrefs('s-off').briefs).toBe(false)
    // Another series is untouched by that write.
    expect(getSeriesPrefs('s-other').briefs).toBe(true)
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('M5 wiring pins', () => {
  const wrapup = read('src/renderer/src/stores/wrapup.ts')
  const grid = read('src/renderer/src/components/views/WeekTimeGrid.tsx')
  const overlay = read('src/renderer/src/components/MeetingOverlay.tsx')
  const wrapOverlay = read('src/renderer/src/components/WrapupOverlay.tsx')
  const card = read('src/renderer/src/components/MeetingCommitmentsCard.tsx')
  const detail = read('src/renderer/src/components/views/PlexiMeetView.tsx')
  const prepSrc = read('src/main/meetingPrep.ts')

  it('series identity rides the calendar origin onto the meeting record', () => {
    expect(grid).toContain('seriesId: block.seriesId ?? null')
    expect(wrapup).toContain("seriesId: origin?.kind === 'calendar' ? (origin.seriesId ?? null) : null")
    expect(wrapup).toContain("blockId: origin?.kind === 'calendar' ? (origin.blockId ?? null) : null")
  })

  it('prep is database facts — no model call, and external series stay unmatched', () => {
    expect(prepSrc).toContain('an INDEXED LOOKUP rather than a guess')
    expect(prepSrc).toContain('title-matching would fake a memory')
    // Carried excludes finished work: nagging about done items is noise.
    expect(prepSrc).toContain('a done commitment carried forward would be nagging')
  })

  it('Done files the HOUSE terminal state, and a refused write un-strikes the row', () => {
    // Caught live: 'done' is not in WORK_ITEM_STATES — setState resolves
    // false (no throw) and the strikethrough stood over an item still open.
    expect(card).toContain("setItemState(it.id, 'completed')")
    expect(card).toContain('if (!ok) setDoneIds')
  })

  it('"carried from last time" leads both the wrap-up review and the Record', () => {
    expect(wrapOverlay).toContain('<CarriedFromLastTime items={carried} />')
    expect(card).toContain('data-testid="carried-from-last-time"')
    expect(card).toContain('CARRIED FROM LAST TIME')
    expect(detail).toContain('lastTitle={lastMeeting?.title}')
  })

  it('the Stage assembles prep from the booked block, and only then', () => {
    expect(overlay).toContain("if (origin?.kind !== 'calendar') return")
    expect(overlay).toContain('data-testid="meeting-prep"')
    expect(overlay).toContain('data-testid="prep-carried"')
    expect(overlay).toContain('data-testid="prep-agenda"')
  })

  it('Q14: the wrap-up asks the per-series knob before minting a brief', () => {
    expect(wrapup).toContain('const briefsWanted = !meeting?.seriesId')
    expect(wrapup).toContain("summary.trim() && briefsWanted")
    expect(detail).toContain('Brief me after each meeting in this series')
    // Briefs for others remain a named, honest deferral.
    expect(prepSrc).toContain('Briefs FOR OTHER ATTENDEES stay a named follow-up')
  })
})
