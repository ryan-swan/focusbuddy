import { describe, it, expect } from 'vitest'
import { knowledgeEntryToSourceDoc } from '../../src/main/brain/connectors/knowledge'
import type { KnowledgeEntry } from '../../src/shared/knowledge'

// ── M2 — THE MIRROR-IMMUNITY LOCK ───────────────────────────────────────────────
//
// `main` ships src/main/brainIngest.ts, which syncs the whole workspace — every desk,
// document, note/page and Drive file — into fb_knowledge, and fires from three renderer
// call sites (fileManager, CommandCenter's navigate-to-Brain, BrainMapView on open).
// Measured on the operator's live DB the first time the merged app opened the Brain Map:
// fb_knowledge went 5 rows -> 273 (180 document + 43 node + 40 widget + 5 file mirrors,
// 5 hand-authored survivors).
//
// fb_knowledge is a table OUR knowledge connector indexes. So without this rule every
// one of those 180 documents would enter the retrieval corpus TWICE: once via the
// document connector reading `documents` directly, and once via a knowledge entry
// mirroring the same source id with different text (his path caps bodies at 8,000 chars;
// ours chunks the full extraction). Two copies of one object, different text, competing
// in the same RRF fusion — the precise duplication U3 exists to end.
//
// THE RULE — one object, one path into the index. fb_knowledge carries CURATED TRUTH
// somebody authored (source_kind IS NULL). Every other object is indexed from its own
// source table by its own connector. A mirror is a copy, not truth.
//
// WHY IMMUNITY RATHER THAN DISABLING HIS INGEST: editing main's call sites on this branch
// would conflict on every future merge, and would not even work — the operator runs the
// main-branch app against this same database, so those rows appear regardless of what
// this branch does. A skip rule at OUR door holds no matter what main writes, forever,
// with nothing to re-litigate per merge.
//
// Red-then-green teeth (each verified by planting the regression and watching it fail):
//   • drop the sourceKind check from knowledgeEntryToSourceDoc ⇒ every mirror case below
//     returns a SourceDoc instead of null.
//   • invert it to `=== null` ⇒ the hand-authored cases go null and the corpus empties.
//   • narrow it to one literal kind (e.g. only 'document') ⇒ the node/widget/file cases
//     leak. This is why the test enumerates every kind main's ingest can emit AND asserts
//     a property over unknown kinds, rather than checking one spelling.

function entry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'k1',
    title: 'Scrap-Metal Recycler Master List (317 companies)',
    body: 'ACME Metals — Sheffield — 0114 555 0100',
    tags: ['document'],
    pinned: false,
    createdAt: 1,
    updatedAt: 2,
    sourceKind: null,
    ...over
  }
}

// Every source_kind main's ingestWorkspaceIntoBrain can stamp, read off its own record()
// calls. If it ever grows a new one, the unknown-kind property test below still covers it.
const MIRROR_KINDS = ['document', 'node', 'widget', 'file'] as const

describe('M2 — the knowledge connector is immune to main\'s workspace mirrors', () => {
  it('indexes a hand-authored entry (source_kind IS NULL) — curated truth is the point of fb_knowledge', () => {
    const doc = knowledgeEntryToSourceDoc(entry({ sourceKind: null }))
    expect(doc).not.toBeNull()
    expect(doc!.sourceType).toBe('knowledge')
    expect(doc!.sourceId).toBe('k1')
  })

  it.each(MIRROR_KINDS)('SKIPS a "%s" mirror — that object is already indexed by its own connector', (kind) => {
    expect(knowledgeEntryToSourceDoc(entry({ sourceKind: kind }))).toBeNull()
  })

  it('skips ANY non-null source_kind, including kinds that do not exist yet', () => {
    // A property, not an enumeration: if main's ingest grows a 5th object type tomorrow,
    // it is skipped on arrival rather than silently entering the corpus until someone
    // notices. The rule is "not hand-authored ⇒ not ours to index", not a kind allowlist.
    for (const kind of ['table', 'chat', 'email', 'whatever-ships-next', '']) {
      expect(knowledgeEntryToSourceDoc(entry({ sourceKind: kind }))).toBeNull()
    }
  })

  it('the skip is decided by provenance ALONE — identical content, opposite verdicts', () => {
    // The two entries differ in exactly one field. If the connector ever starts deciding
    // on content (length, title, tags) instead of provenance, this pair stops disagreeing.
    const authored = knowledgeEntryToSourceDoc(entry({ sourceKind: null }))
    const mirrored = knowledgeEntryToSourceDoc(entry({ sourceKind: 'document' }))
    expect(authored).not.toBeNull()
    expect(mirrored).toBeNull()
  })

  it('still skips an empty entry regardless of provenance — the pre-existing no-text rule survives', () => {
    expect(knowledgeEntryToSourceDoc(entry({ title: '', body: '', tags: [], sourceKind: null }))).toBeNull()
  })
})

// ── The source-level half of the lock ──────────────────────────────────────────
// The runtime tests above prove the predicate. This proves the connector has exactly ONE
// place that predicate can be spelled, so a future edit cannot reintroduce a second,
// unguarded path from fb_knowledge into the corpus (the way collect/collectOne diverged
// before I2b routed both through one toDoc).
describe('M2 — structural: one guarded path from fb_knowledge into the index', () => {
  it('both collect and collectOne route through the single guarded builder', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/main/brain/connectors/knowledge.ts'),
      'utf8'
    )
    // Comment-stripped, so prose about the rule cannot satisfy the count.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

    // Exactly ONE construction site for a knowledge SourceDoc. `sourceId:` is the
    // discriminator: the Connector descriptor carries `sourceType` too (so counting that
    // would read 2 and prove nothing), but only a SourceDoc literal assigns `sourceId:`.
    // A second builder appearing anywhere in this file trips the count.
    expect((code.match(/sourceId:/g) ?? []).length).toBe(1)

    // Deliberately NOT asserted here: the spelling of the provenance read itself.
    // An earlier draft required the literal `k.sourceKind`, and planting a regression
    // proved it wrong — destructuring (`const { sourceKind: sk } = k`) is behaviour-
    // preserving, correct code, and the assertion failed it. A lock that fires on a good
    // refactor trains people to weaken it, which is the lock-theater failure mode.
    // Behaviour is already fully covered above: deleting the guard fails 7 of those 8
    // runtime tests, inverting it fails 7, and narrowing it to one kind fails 4. This
    // block exists only for the risk runtime tests structurally cannot see — a SECOND,
    // unguarded construction path appearing in this file.
  })
})
