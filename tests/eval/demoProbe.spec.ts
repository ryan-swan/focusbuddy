import { test } from '@playwright/test'
import { launchApp, waitForReady } from '../e2e/_helpers'
import { mkdtempSync, existsSync, writeFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

// Demo probe — NOT a scored eval. Runs the operator's real demo questions through the
// brain retriever against a COPY of the live corpus and prints what comes back, so we
// can see before the demo whether these questions land.
//
// Deliberately has no ground truth and no assertions about quality: the fixture eval's
// ground truth names a seeded corpus that no longer exists in this database, and a
// number scored against absent content is worse than no number. This prints sources and
// lets a human judge. The only hard assertion is that the corpus indexed at all.
//
//   npx playwright test --config playwright.eval.config.ts demoProbe

const LIVE_DB = join(homedir(), 'Library/Application Support/focusbuddy/focusbuddy.db')

const QUESTIONS: Array<{ tier: string; q: string }> = [
  { tier: 'T1 rare-token', q: 'What is GAP-006?' },
  { tier: 'T1 rare-token', q: "What's our honesty rule before investor material?" },
  { tier: 'T1 rare-token', q: 'What is ResilientIQ?' },
  { tier: 'T1 rare-token', q: 'What does Gate 3 closed mean?' },
  { tier: 'T2 widget-only', q: "What's on my wedding checklist?" },
  { tier: 'T2 widget-only', q: "What's the shippability line — what is real versus roadmap?" },
  { tier: 'T3 cross-desk', q: 'What did the co-founder calls say about our moat and positioning?' },
  { tier: 'T3 cross-desk', q: 'Who are our main competitors and how do we differ?' },
  { tier: 'T3 cross-desk', q: 'What do we need to be fundraising-ready, and by when?' },
  { tier: 'T3 cross-desk', q: "What's the 4-week path to launch?" },
  { tier: 'T4 cross-room', q: 'What did the Flamelit website audit find?' },
  { tier: 'T4 cross-room', q: 'How does the Loop operating model work?' },
  { tier: 'T4 cross-room', q: "What's our cold-call process?" }
]

interface Src {
  docId: string
  title: string
  docType: string
  score: number
  disagrees?: boolean
}

test('demo probe — run the real demo questions through the brain', async () => {
  test.skip(!existsSync(LIVE_DB), 'live corpus DB not present')
  test.setTimeout(600_000)

  const userDataDir = mkdtempSync(join(tmpdir(), 'fb-demo-probe-'))
  execFileSync('sqlite3', [`file:${LIVE_DB}?immutable=1`, `.backup '${join(userDataDir, 'focusbuddy.db')}'`])

  const { window, dispose } = await launchApp({ userDataDir })
  const lines: string[] = []
  try {
    await waitForReady(window)
    await window.evaluate(() => window.api.brain.setEnabled(true))
    const built = await window.evaluate(() => window.api.brain.buildIndex(false))
    const status = await window.evaluate(() => window.api.brain.status())
    lines.push(`corpus: ${status.chunkCount} chunks · embedder ready: ${status.localEmbedderReady}`)
    lines.push(`build: ${JSON.stringify(built)}`)
    lines.push('')

    for (const { tier, q } of QUESTIONS) {
      const t0 = Date.now()
      const res = await window.evaluate((query) => window.api.brain.testRetrieve(query), q)
      const got = (res.results ?? []) as Src[]
      const ms = Date.now() - t0
      lines.push(`━━ [${tier}] "${q}"   (${ms}ms, ${got.length} sources)`)
      if (!got.length) lines.push('     (nothing returned)')
      for (const [i, s] of got.entries()) {
        const flag = s.disagrees ? '  ⚠ disagrees' : ''
        lines.push(`   ${i + 1}. ${(s.title || '(untitled)').slice(0, 62).padEnd(62)} ${s.docType}${flag}`)
      }
      lines.push('')
    }
  } finally {
    await dispose()
  }

  const out = lines.join('\n')
  console.log('\n' + out)
  writeFileSync(join(process.cwd(), 'tests/eval/reports/demo-probe.txt'), out)
})
