// #16 (analysis/27, Phase 4) — AI-suggested tags at the confirm stop.
//
// The ruled shape: tags stay deliberately never-mandatory, so the fix is
// SUGGESTED tags, accent-marked as inferred like every other inference. And
// the DEC-088 people pattern is the template: suggestions are DETERMINISTIC
// and grounded in what already exists — a tag is suggested only when the
// capture's own words match a tag ALREADY IN USE on the user's work items.
// No model call, no invented taxonomy (the DEC-029 taxonomy law holds: this
// module can never mint a vocabulary, only echo the user's back). Empty
// whenever the workspace's tag population is — honesty over recall.
//
// Structural-db style (the chunkIndex precedent) so the unit suite runs the
// vocabulary query against real SQLite.

import { getDb } from '../db/database'
import type { ChunkDb } from '../chunkIndex'

export interface TagUsage {
  tag: string
  count: number
}

// Mirrors renderer lib/itemTags normalizeTag (comma-separated, lowercased,
// '#' stripped) — main cannot import renderer libs, and the format is pinned
// on both sides.
function normalize(part: string): string {
  return part.replace(/^#+/, '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 40)
}

/** Every tag currently in use on live work items, with usage counts. */
export function collectTagVocabularyDb(db: ChunkDb): TagUsage[] {
  const rows = db
    .prepare(
      `SELECT tags FROM nodes WHERE kind = 'work_item' AND trashed_at IS NULL AND tags IS NOT NULL AND tags != ''`
    )
    .all() as Array<{ tags: string }>
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const part of r.tags.split(',')) {
      const t = normalize(part)
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count }))
}

/** Pure: which existing tags does this capture's text evoke? A tag matches
 *  when every word of it appears in the text (whole-word); ties break toward
 *  the more-used tag — the user's own habits rank their own vocabulary. */
export function suggestTagsFromText(text: string, vocab: TagUsage[], limit = 3): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const scored: Array<{ tag: string; count: number }> = []
  for (const v of vocab) {
    // The tag tokenizes exactly like the hay (live round caught the drift:
    // 'test-seed' never matched because the text side folds punctuation to
    // spaces and the tag side didn't).
    const words = v.tag.split(/[^a-z0-9]+/).filter(Boolean)
    if (words.length === 0) continue
    if (words.every((w) => hay.includes(` ${w} `))) scored.push(v)
  }
  return scored
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((s) => s.tag)
}

/** The live wrapper — degrades to [] (the recall precedent): a suggestion
 *  surface must never break a capture. */
export function suggestTags(text: string): string[] {
  try {
    return suggestTagsFromText(text, collectTagVocabularyDb(getDb() as unknown as ChunkDb))
  } catch {
    return []
  }
}
