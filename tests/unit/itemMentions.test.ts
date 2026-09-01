import { describe, it, expect } from 'vitest'
import {
  parseMentions,
  serializeMentions,
  mentionKey,
  MENTION_ICON,
  MENTION_KINDS,
  type ItemMention
} from '../../src/renderer/src/lib/itemMentions'

// DEC-039 — typed entity mentions. Defensive by design: the column rides sync
// and a peer could write anything.

const m = (kind: ItemMention['kind'], id: string, title = id): ItemMention => ({ kind, id, title })

describe('parseMentions', () => {
  it('round-trips valid mentions', () => {
    const list = [m('person', 'p1', 'Caleb'), m('desk', 'd1', 'Cetra Review')]
    expect(parseMentions(serializeMentions(list))).toEqual(list)
  })

  it('garbage never crashes: bad JSON, non-arrays, junk entries → dropped', () => {
    expect(parseMentions('not json')).toEqual([])
    expect(parseMentions('{"a":1}')).toEqual([])
    expect(parseMentions(null)).toEqual([])
    expect(
      parseMentions(
        JSON.stringify([
          { kind: 'alien', id: 'x', title: 'X' },
          { kind: 'desk' }, // no id
          { kind: 'desk', id: '  ' }, // blank id
          42,
          null,
          { kind: 'plan', id: 'ok', title: 'Q3' }
        ])
      )
    ).toEqual([m('plan', 'ok', 'Q3')])
  })

  it('de-duplicates by kind+id and caps the list', () => {
    const dupes = [m('desk', 'd1', 'A'), m('desk', 'd1', 'B'), m('room', 'd1', 'C')]
    // Same id under a DIFFERENT kind is a different entity — both survive.
    expect(parseMentions(JSON.stringify(dupes))).toEqual([m('desk', 'd1', 'A'), m('room', 'd1', 'C')])
    const many = Array.from({ length: 40 }, (_, i) => m('desk', `d${i}`))
    expect(parseMentions(JSON.stringify(many)).length).toBeLessThanOrEqual(20)
  })

  it('a missing title degrades to the kind, never a blank chip', () => {
    expect(parseMentions(JSON.stringify([{ kind: 'person', id: 'p1' }]))[0].title).toBe('person')
  })

  it('empty means NULL in the column', () => {
    expect(serializeMentions([])).toBeNull()
  })

  it('every kind has an icon and a stable key', () => {
    for (const k of MENTION_KINDS) expect(MENTION_ICON[k]).toBeTruthy()
    expect(mentionKey(m('desk', 'd1'))).toBe('desk:d1')
  })
})
