// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { collectTagVocabularyDb, suggestTagsFromText } from '../../src/main/ai/tagSuggest'
import type { ChunkDb } from '../../src/main/chunkIndex'

// #16 (analysis/27 Phase 4) — AI-suggested tags. The ruled shape under test:
// suggestions are DETERMINISTIC and grounded in the vocabulary already in
// use (the DEC-088 people template) — never invented, never applied, empty
// whenever the workspace's tag population is. Tags stay never-mandatory.

function freshDb(): ChunkDb {
  const db = new DatabaseSync(':memory:') as unknown as ChunkDb
  db.exec(`CREATE TABLE nodes (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    tags TEXT, trashed_at INTEGER
  )`)
  return db
}

function seed(db: ChunkDb, id: string, tags: string | null, trashed = false): void {
  db.prepare('INSERT INTO nodes (id, kind, tags, trashed_at) VALUES (?, ?, ?, ?)').run(
    id, 'work_item', tags, trashed ? 1 : null
  )
}

describe('collectTagVocabularyDb — the user\'s own vocabulary', () => {
  it('counts usage across live items, normalized and case-folded', () => {
    const db = freshDb()
    seed(db, 'a', 'Cetra, urgent')
    seed(db, 'b', 'cetra,  Follow Up ')
    seed(db, 'c', null)
    seed(db, 'd', 'cetra', true) // trashed — not vocabulary
    const vocab = collectTagVocabularyDb(db)
    expect(vocab.find((v) => v.tag === 'cetra')?.count).toBe(2)
    expect(vocab.find((v) => v.tag === 'follow up')?.count).toBe(1)
    expect(vocab.some((v) => v.tag === 'Cetra')).toBe(false)
  })
})

describe('suggestTagsFromText — grounded, whole-word, habit-ranked', () => {
  const vocab = [
    { tag: 'cetra', count: 9 },
    { tag: 'urgent', count: 2 },
    { tag: 'follow up', count: 4 },
    { tag: 'up', count: 1 }
  ]

  it('suggests only tags whose every word appears whole in the text', () => {
    expect(suggestTagsFromText('Send the Cetra lease follow up notes', vocab)).toEqual([
      'cetra',
      'follow up',
      'up'
    ])
  })

  it('whole words only: "update" does not evoke the tag "up"', () => {
    expect(suggestTagsFromText('update the deck', vocab)).toEqual([])
  })

  it('ranks by the user\'s own usage, caps at three', () => {
    const wide = [
      { tag: 'alpha', count: 1 },
      { tag: 'beta', count: 5 },
      { tag: 'gamma', count: 3 },
      { tag: 'delta', count: 4 }
    ]
    expect(suggestTagsFromText('alpha beta gamma delta', wide)).toEqual(['beta', 'delta', 'gamma'])
  })

  it('an empty vocabulary suggests nothing — honesty over recall', () => {
    expect(suggestTagsFromText('anything at all', [])).toEqual([])
  })

  it('hyphenated tags tokenize like the text — the live-caught drift', () => {
    // 'test-seed' must match "test-seed" AND "test seed" in prose, because
    // the hay folds punctuation to spaces.
    const v = [{ tag: 'test-seed', count: 10 }]
    expect(suggestTagsFromText('dismiss the test-seed items', v)).toEqual(['test-seed'])
    expect(suggestTagsFromText('dismiss the test seed items', v)).toEqual(['test-seed'])
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('#16 wiring pins', () => {
  const classify = read('src/main/ai/intentClassify.ts')
  const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')
  const suggest = read('src/main/ai/tagSuggest.ts')
  const preload = read('src/preload/index.ts')

  it('every classify path carries the suggestions — rules, model, fallback', () => {
    expect(classify.split('tags: tagSuggestions').length - 1).toBe(3)
    // Deterministic: the scan happens before the rules/model fork.
    expect(classify.indexOf('const tagSuggestions = suggestTags(text)')).toBeLessThan(
      classify.indexOf('const ruled = classifyByRules(primaryText)')
    )
  })

  it('waiting suggestions LIGHT the desk pill — the DEC-088 pill doctrine', () => {
    expect(card).toContain('const pendingTagSuggestions = tagSuggestions.filter((s) => !capTags.includes(s))')
    expect(card).toContain('pendingTagSuggestions.length > 0')
  })

  it('suggested is never applied: accent chips, click to accept, chosen ones vanish', () => {
    expect(card).toContain('data-testid="tag-suggestions"')
    expect(card).toContain('nothing applies on its own')
    expect(card).toContain('onClick={() => setCapTags([...capTags, s])}')
    expect(card).toContain('.filter((s) => !capTags.includes(s))')
  })

  it('the suggester can never mint a vocabulary, and degrades to []', () => {
    expect(suggest).toContain('can never mint a vocabulary, only echo the user\'s back')
    expect(suggest).toContain('return []')
    expect(preload).toContain('suggested, never applied')
  })
})
