import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from '../e2e/_helpers'
import { EVAL_CASES, FILLER_IDS, type EvalCase } from './brainEvalCases'
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

// plexi-brain I0 — THE RULER.
//
// Scores the SHIPPED retrieval path (retrieveSources → retrieveViaBrain) against the
// real dogfood corpus using tests/eval/brainEvalCases.ts. Non-circular by construction:
// the fixture was written from the corpus inventory BEFORE any ranker internals were
// consulted, and this runner measures the real compiled code through the real IPC —
// never a reimplementation.
//
// Method (never touches the live DB): sqlite .backup the live corpus into an isolated
// temp userData dir, launch the built app pointed at that copy, enable the brain, and
// run every case. All writes hit the throwaway copy.
//
// This is a MEASUREMENT, not a pass/fail gate — it prints a scorecard and writes a
// report. The only hard assertions are integrity ones (corpus present, embedder live),
// because a silently-degenerate run would produce a misleading number.
//
//   npm run brain:eval                      score the corpus's index AS IT STANDS
//   BRAIN_EVAL_REINDEX=1 npm run brain:eval  reindex the copy first, then score
//
// ── Why the reindex mode exists (I0b) ────────────────────────────────────────────
// The default run scores the index rows already in the copy — which is what the
// operator's app currently answers from, and is the right thing to hold constant when
// asking "did a change move the RANKER?".
//
// But an index only reflects the corpus as of the last time someone built it, and I0b
// found the gap that opens up: 72 of the live corpus's 450 chunks were content the
// operator had already deleted, still fully retrievable. Scoring the stale index would
// keep measuring those ghosts. The reindex mode brings the copy up to date first, so the
// numbers describe what the operator will actually see after their next index run.

const LIVE_DB = join(homedir(), 'Library/Application Support/focusbuddy/focusbuddy.db')
const TOP_K = 6
const REINDEX = process.env.BRAIN_EVAL_REINDEX === '1'

interface Retrieved {
  rank: number
  docId: string
  title: string
  docType: string
  score: number
  disagrees: boolean
}

interface CaseResult {
  c: EvalCase
  got: Retrieved[]
  ms: number
  hitRank: number | null // 1-based rank of the first correct source, null = miss
  sidesFound: number
  sidesTotal: number
  dupLeak: number // duplicate-group members beyond the first
  fillerLeak: string[] // forbidden ids that surfaced
}

function pct(n: number, d: number): string {
  return d === 0 ? '  n/a' : `${Math.round((n / d) * 100)}%`.padStart(5)
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}

test.describe('plexi-brain I0 — retrieval eval on the real corpus', () => {
  test('score the shipped retriever against the fixture', async () => {
    test.skip(!existsSync(LIVE_DB), 'live corpus DB not present — skip on machines without the dogfood seed')
    test.setTimeout(300_000)

    // 1. Isolated userData dir with a consistent COPY of the live corpus.
    const userDataDir = mkdtempSync(join(tmpdir(), 'fb-brain-eval-'))
    const dbCopy = join(userDataDir, 'focusbuddy.db')
    execFileSync('sqlite3', [`file:${LIVE_DB}?immutable=1`, `.backup '${dbCopy}'`])
    expect(existsSync(dbCopy)).toBe(true)

    const { window, dispose } = await launchApp({ userDataDir })
    const results: CaseResult[] = []
    let chunkCount = 0

    try {
      await waitForReady(window)

      const enabled = await window.evaluate(() => window.api.brain.setEnabled(true))
      expect(enabled.enabled).toBe(true)

      if (REINDEX) {
        const res = await window.evaluate(() => window.api.brain.buildIndex(false))
        // eslint-disable-next-line no-console
        console.log(
          `[eval] reindexed the copy: +${res.chunksWritten} chunks written, ` +
            `-${res.reconcile?.chunksRemoved ?? 0} chunks reconciled away ` +
            `(${res.reconcile?.sourcesRemoved ?? 0} removed sources)`
        )
      }

      // INTEGRITY GATE 1 — the corpus actually came across. Without this the eval
      // would happily score an empty index at 0% and look like a ranker failure.
      const status = await window.evaluate(() => window.api.brain.status())
      chunkCount = status.chunkCount
      expect(chunkCount, 'corpus chunks present in the copy').toBeGreaterThan(100)

      // INTEGRITY GATE 2 — the local embedder is live. If embedQuery() returns null the
      // retriever silently degrades to a keyword-only floor, and every semantic number
      // below would be measuring something we are not shipping. Warm it, then assert.
      await window.evaluate(() => window.api.brain.testRetrieve('warmup query'))
      const warm = await window.evaluate(() => window.api.brain.status())
      expect(warm.localEmbedderReady, 'local embedder ready — else this measures keyword-only').toBe(true)

      // 2. Run every case through the REAL retrieval path.
      for (const c of EVAL_CASES) {
        const t0 = Date.now()
        const res = await window.evaluate((q) => window.api.brain.testRetrieve(q), c.query)
        const ms = Date.now() - t0
        const got = res.results as Retrieved[]
        const ids = got.map((r) => r.docId)

        const hitIdx = ids.findIndex((id) => c.expectAnyOf.includes(id))
        const sides = c.expectAllSides ?? []
        const sidesFound = sides.filter((side) => side.some((id) => ids.includes(id))).length

        let dupLeak = 0
        for (const g of c.dupGroups ?? []) {
          const n = ids.filter((id) => g.includes(id)).length
          if (n > 1) dupLeak += n - 1
        }

        const forbid = c.forbid ?? []
        const fillerLeak = ids.filter((id) => forbid.includes(id))

        results.push({
          c,
          got,
          ms,
          hitRank: hitIdx === -1 ? null : hitIdx + 1,
          sidesFound,
          sidesTotal: sides.length,
          dupLeak,
          fillerLeak
        })
      }
    } finally {
      await dispose()
    }

    // ── INTEGRITY GATE 3 (added I0b) — THE RULER MUST BE MADE OF LIVE CORPUS ───────
    //
    // Every ground-truth id names a source that must actually be LIVE. When one stops
    // being so, the case silently becomes unpassable and the fixture starts measuring the
    // ranker on content that no longer exists — a ruler that quietly shortens. I0b found
    // exactly that: 19 of the fixture's 62 ids named content the operator had deleted,
    // including BOTH the flagship contradiction case's Louisiana side and R03's only answer.
    //
    // "Live" = in fb_chunks AND its base row is not trashed/absent. Subtracting the dead
    // set makes this gate catch rot in BOTH eval modes: the default (non-reindex) run
    // scores the stale index, which still HOLDS deleted chunks, so a plain "is it in
    // fb_chunks" check would miss the rot until the next reconcile. Computing liveness
    // against the base rows instead means the gate reflects reality, not the stale index.
    // Read directly from the copy after the app closed — checks the DB, not the code.
    const chunkSourceIds = execFileSync('sqlite3', [dbCopy, 'SELECT DISTINCT source_id FROM fb_chunks'], {
      encoding: 'utf8'
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    // Source ids whose base row is trashed, archived, on a trashed container, or gone —
    // i.e. content the user removed but that a stale index may still carry.
    const deadIds = new Set(
      execFileSync(
        'sqlite3',
        [
          dbCopy,
          `SELECT DISTINCT c.source_id FROM fb_chunks c WHERE
              (c.source_type='task' AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id=c.source_id AND n.trashed_at IS NULL))
           OR (c.source_type='document' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=c.source_id AND d.trashed_at IS NULL AND d.archived=0))
           OR (c.source_type='knowledge' AND NOT EXISTS (SELECT 1 FROM fb_knowledge k WHERE k.id=c.source_id))
           OR (c.source_type='widget' AND NOT EXISTS (
                 SELECT 1 FROM widgets w JOIN nodes n ON n.id=w.task_id
                  WHERE w.id=c.source_id AND w.trashed_at IS NULL AND n.trashed_at IS NULL));`
        ],
        { encoding: 'utf8' }
      )
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    )
    const liveIds = new Set(chunkSourceIds.filter((id) => !deadIds.has(id)))
    const deadGroundTruth: string[] = []
    const shrunkGuards: string[] = []
    for (const c of EVAL_CASES) {
      if (!c.expectAnyOf.some((id) => liveIds.has(id))) {
        deadGroundTruth.push(`${c.id}: NO live expectAnyOf id (${c.expectAnyOf.length} listed, 0 in index)`)
      }
      ;(c.expectAllSides ?? []).forEach((side, i) => {
        if (!side.some((id) => liveIds.has(id))) {
          deadGroundTruth.push(`${c.id}: side ${i + 1} has no live id — the contradiction no longer exists`)
        }
      })
      // forbid / dupGroups legitimately shrink when junk or a duplicate is deleted —
      // informational, never a failure. A guard with nothing left to guard is reported
      // so nobody reads its now-trivial pass as a win.
      const deadForbid = (c.forbid ?? []).filter((id) => !liveIds.has(id)).length
      if (deadForbid > 0) shrunkGuards.push(`${c.id}: ${deadForbid}/${(c.forbid ?? []).length} forbid ids gone`)
      for (const g of c.dupGroups ?? []) {
        const live = g.filter((id) => liveIds.has(id)).length
        if (live < 2) shrunkGuards.push(`${c.id}: dupGroup down to ${live} live member(s) — no longer a dup test`)
      }
    }

    // 3. Aggregate.
    const n = results.length
    const hit1 = results.filter((r) => r.hitRank === 1).length
    const hit3 = results.filter((r) => r.hitRank !== null && r.hitRank <= 3).length
    const hit6 = results.filter((r) => r.hitRank !== null && r.hitRank <= TOP_K).length
    const contraCases = results.filter((r) => r.sidesTotal > 0)
    const contraFull = contraCases.filter((r) => r.sidesFound === r.sidesTotal).length
    const dupCases = results.filter((r) => (r.c.dupGroups ?? []).length > 0)
    const dupLeakTotal = results.reduce((a, r) => a + r.dupLeak, 0)
    const fillerCases = results.filter((r) => (r.c.forbid ?? []).length > 0)
    const fillerLeakTotal = results.reduce((a, r) => a + r.fillerLeak.length, 0)
    const lat = results.map((r) => r.ms)

    const byClass = new Map<string, { hit: number; total: number }>()
    for (const r of results) {
      const e = byClass.get(r.c.klass) ?? { hit: 0, total: 0 }
      e.total++
      if (r.hitRank !== null && r.hitRank <= TOP_K) e.hit++
      byClass.set(r.c.klass, e)
    }

    // 4. Scorecard.
    const L: string[] = []
    L.push('')
    L.push('════════════════════════════════════════════════════════════════════')
    L.push(`  BRAIN EVAL · ${n} queries · corpus: ${chunkCount} chunks · top-K=${TOP_K}`)
    L.push('════════════════════════════════════════════════════════════════════')
    L.push('')
    L.push(`  hit@1                    ${pct(hit1, n)}   (${hit1}/${n})`)
    L.push(`  hit@3                    ${pct(hit3, n)}   (${hit3}/${n})`)
    L.push(`  hit@6                    ${pct(hit6, n)}   (${hit6}/${n})`)
    L.push(`  contradiction coverage   ${pct(contraFull, contraCases.length)}   (${contraFull}/${contraCases.length} surfaced BOTH sides)`)
    L.push(`  duplicate slots wasted   ${String(dupLeakTotal).padStart(5)}   (across ${dupCases.length} dup cases — target 0)`)
    L.push(`  filler leaks             ${String(fillerLeakTotal).padStart(5)}   (across ${fillerCases.length} guarded cases — target 0)`)
    L.push(`  latency p50 / p95        ${percentile(lat, 50)}ms / ${percentile(lat, 95)}ms`)
    L.push('')
    L.push('  ── by case class ──')
    for (const [k, v] of [...byClass.entries()].sort()) {
      L.push(`     ${k.padEnd(16)} hit@6 ${pct(v.hit, v.total)}   (${v.hit}/${v.total})`)
    }
    L.push('')
    L.push('  ── fixture integrity ──')
    L.push(
      `     ground-truth ids in the index: ${
        [...new Set(EVAL_CASES.flatMap((c) => c.expectAnyOf))].filter((id) => liveIds.has(id)).length
      }/${[...new Set(EVAL_CASES.flatMap((c) => c.expectAnyOf))].length}`
    )
    if (deadGroundTruth.length === 0) L.push('     ✓ every case has live ground truth')
    for (const d of deadGroundTruth) L.push(`     ✗ ${d}`)
    for (const s of shrunkGuards) L.push(`     · ${s}`)
    L.push('')
    L.push('  ── per case ──')
    for (const r of results) {
      const mark = r.hitRank === null ? '✗ MISS' : `✓ @${r.hitRank}`
      const flags: string[] = []
      if (r.sidesTotal > 0) flags.push(`sides ${r.sidesFound}/${r.sidesTotal}${r.sidesFound < r.sidesTotal ? ' ✗' : ' ✓'}`)
      if (r.dupLeak > 0) flags.push(`dup+${r.dupLeak}`)
      if (r.fillerLeak.length) flags.push(`FILLER×${r.fillerLeak.length}`)
      L.push(`   ${r.c.id} ${mark.padEnd(7)} ${r.c.klass.padEnd(14)} ${flags.join(' · ').padEnd(26)} "${r.c.query.slice(0, 46)}"`)
      for (const g of r.got.slice(0, TOP_K)) {
        const isHit = r.c.expectAnyOf.includes(g.docId)
        const isBad = (r.c.forbid ?? []).includes(g.docId)
        const tag = isBad ? ' ⛔' : isHit ? ' ←' : '  '
        L.push(`        ${g.rank}. ${g.title.replace(/\s+/g, ' ').slice(0, 52).padEnd(52)}${tag} ${g.docType}`)
      }
    }
    L.push('')
    const report = L.join('\n')
    console.log(report)

    const outDir = join(process.cwd(), 'tests/eval/reports')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'latest.txt'), report)
    writeFileSync(
      join(outDir, 'latest.json'),
      JSON.stringify(
        {
          corpusChunks: chunkCount,
          topK: TOP_K,
          totals: { n, hit1, hit3, hit6, contraFull, contraCases: contraCases.length, dupLeakTotal, fillerLeakTotal },
          latency: { p50: percentile(lat, 50), p95: percentile(lat, 95) },
          cases: results.map((r) => ({
            id: r.c.id,
            klass: r.c.klass,
            query: r.c.query,
            hitRank: r.hitRank,
            sidesFound: r.sidesFound,
            sidesTotal: r.sidesTotal,
            dupLeak: r.dupLeak,
            fillerLeak: r.fillerLeak,
            got: r.got.map((g) => ({ rank: g.rank, docId: g.docId, title: g.title }))
          }))
        },
        null,
        2
      )
    )

    // 5. The ONLY hard assertions are integrity ones — the scores are the measurement.
    expect(results.length).toBe(EVAL_CASES.length)
    expect(FILLER_IDS.length).toBeGreaterThan(0)
    // A case whose ground truth is no longer in the corpus cannot be scored honestly.
    // Fail loudly rather than let the number quietly drift down and get read as a
    // ranker regression.
    expect(deadGroundTruth, 'fixture ground truth must name content that still exists').toEqual([])
  })
})
