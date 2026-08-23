import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual-review shots + a timing probe for AI-30 (sentence waves,
// the source cascade, the drain after completion). Seeds the live turn via
// the store handles, no model in the loop. Delete when the stage closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const SRC = [
  { n: 1, docId: 'doc-1', title: 'Launch budget', docType: 'document', snippet: 'Venue ceiling $1,200' },
  { n: 2, docId: 'kb-1', title: 'Launch decisions', docType: 'knowledge', snippet: 'Partner-led preferred' },
  { n: 3, docId: 'doc-2', title: 'Runsheet draft', docType: 'document', snippet: 'Doors at 6pm' },
  { n: 4, docId: 'https://example.com/venues/the-foundry', title: 'The Foundry — events', docType: 'web', snippet: 'Capacity 180' },
  { n: 5, docId: 'https://example.org/launch-playbooks', title: 'Launch playbooks that worked', docType: 'web', snippet: 'Soft launch first' }
]

const PROSE = [
  'Here are the directions we could take the launch, grounded in your workspace [1]. The venue decision gates everything else, and the budget sheet already carries the ceiling for it. A soft launch buys two weeks of signal before the public date.',
  '',
  '## What to decide first',
  '',
  '- **Venue**: The Foundry fits 180 and sits inside the $1,200 ceiling [1][4].',
  '- **Date**: the runsheet assumes doors at 6pm on a Thursday [3].',
  '- **Partners**: the three anchor partners carry the announcement [2].',
  '',
  'If you want, I can draft the runsheet and the partner note now. Both land on this desk, and you can apply them one at a time or all together.'
].join('\n')

test('plexii A1 waves: cascade, sentence waves, drain to the end', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')))
  window.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 600)) })
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  const ts = 1_755_900_000_000
  // 1) Retrieval lands: the tree cascades in.
  await window.evaluate(
    ({ sources, ts }) => {
      const w = window as unknown as {
        __fbView?: { getState: () => { goPlexii: () => void } }
        __fbChat?: { setState: (s: Record<string, unknown>) => void }
      }
      w.__fbView?.getState().goPlexii()
      const now = Date.now()
      w.__fbChat?.setState({
        activeConversationId: null,
        sending: true,
        liveRequestId: 'probe',
        messagesByTask: { __new__: [{ role: 'user', content: 'What are our options for the launch?', ts: ts - 10_000 }] },
        liveTraceByThread: {
          __new__: {
            status: 'running',
            startedAt: now - 900,
            retrievedAt: now,
            retrievalMs: 412,
            repliedAt: null,
            completedAt: null,
            mentions: [],
            semantic: false,
            sources,
            tools: [],
            activity: null,
            error: null
          }
        }
      })
    },
    { sources: SRC, ts }
  )
  await window.waitForTimeout(120)
  await window.screenshot({ path: `${OUT}/waves-1-cascade-mid.png` })
  await window.waitForTimeout(500)
  await window.screenshot({ path: `${OUT}/waves-2-tree-landed.png` })

  // 2) Prose arrives in one burst (the worst case for a flood) — it must
  //    still land in waves at reading pace.
  await window.evaluate(
    ({ prose, ts }) => {
      const w = window as unknown as {
        __fbChat?: { getState: () => { messagesByTask: Record<string, unknown[]> }; setState: (s: Record<string, unknown>) => void }
      }
      const s = w.__fbChat!.getState()
      w.__fbChat!.setState({
        messagesByTask: { __new__: [...s.messagesByTask.__new__, { role: 'assistant', content: prose, ts }] }
      })
    },
    { prose: PROSE, ts }
  )
  const prose = window.locator('[data-testid="streaming-prose"]')
  await window.waitForTimeout(300)
  // eslint-disable-next-line no-console
  console.log(
    'probe:',
    await window.evaluate(() => {
      const w = window as unknown as { __fbChat?: { getState: () => Record<string, unknown> } }
      const s = w.__fbChat?.getState()
      if (!s) return 'no getState'
      const msgs = (s.messagesByTask as Record<string, unknown[]>).__new__
      return JSON.stringify({ sending: s.sending, live: Object.keys(s.liveTraceByThread as object), msgs: msgs.map((m) => (m as { role: string; content: string }).role + ':' + (m as { content: string }).content.length) })
    }),
    'turns:', await window.locator('[data-testid="assistant-turn"]').count(),
    'prose:', await prose.count()
  )
  const lengths: number[] = []
  for (let i = 0; i < 14; i++) {
    await window.waitForTimeout(250)
    lengths.push((await prose.innerText().catch(() => '')).length)
    if (i === 2) await window.screenshot({ path: `${OUT}/waves-3-first-waves.png` })
    if (i === 7) await window.screenshot({ path: `${OUT}/waves-4-mid-answer.png` })
  }
  // eslint-disable-next-line no-console
  console.log('visible lengths while streaming:', lengths.join(' '))
  // Never the whole answer in one go, never going backwards.
  expect(lengths[0]).toBeLessThan(PROSE.length)
  for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1])

  // 3) The stream closes while waves are still landing: the store settles,
  //    the drain keeps the same pace, cards cascade in after the last wave.
  await window.evaluate(
    ({ sources, ts }) => {
      const w = window as unknown as {
        __fbChat?: { getState: () => { liveTraceByThread: Record<string, Record<string, unknown>> }; setState: (s: Record<string, unknown>) => void }
      }
      const live = w.__fbChat!.getState().liveTraceByThread.__new__
      w.__fbChat!.setState({
        sending: false,
        liveRequestId: null,
        liveTraceByThread: {},
        traceByMessage: { [String(ts)]: { ...live, status: 'done', repliedAt: Date.now() - 50, completedAt: Date.now() } },
        sourcesByMessage: { [String(ts)]: sources },
        proposalsByMessage: {
          [String(ts)]: [
            { id: 'p-1', kind: 'create-doc', title: 'Launch runsheet', reason: 'Doors at 6pm, three partner slots' },
            { id: 'p-2', kind: 'create-doc', title: 'Partner note', reason: 'One paragraph each anchor partner can forward' }
          ]
        }
      })
    },
    { sources: SRC, ts }
  )
  await window.waitForTimeout(60)
  // eslint-disable-next-line no-console
  console.log('after settle:', await window.evaluate(() => {
    const q = (sel: string): number => document.querySelectorAll(sel).length
    return JSON.stringify({ turns: q('[data-testid="assistant-turn"]'), prose: q('[data-testid="streaming-prose"]'), cards: q('[data-testid^="proposal-card-"]'), collapsed: q('[data-testid="trace-collapsed"]'), expanded: q('[data-testid="assistant-trace"]') })
  }))
  const drainedAtSettle = await prose.getAttribute('data-drained').catch(() => null)
  const lenAtSettle = (await prose.innerText().catch(() => '')).length
  // eslint-disable-next-line no-console
  console.log('at settle: drained =', drainedAtSettle, 'visible =', lenAtSettle, 'of', PROSE.length)
  await window.screenshot({ path: `${OUT}/waves-5-draining.png` })
  expect(drainedAtSettle).toBe('false')

  await expect(prose).toHaveCount(0, { timeout: 15_000 })
  await window.waitForTimeout(120)
  await window.screenshot({ path: `${OUT}/waves-6-cards-entering.png` })
  // The handoff mounts the tree in place (no cascade replay), then the
  // auto-fold glides it to the summary line.
  await expect(window.locator('[data-testid="assistant-trace"]')).toBeVisible()
  await window.waitForTimeout(1500)
  await window.screenshot({ path: `${OUT}/waves-7-folding.png` })
  await expect(window.locator('[data-testid="trace-collapsed"]')).toBeVisible({ timeout: 3000 })
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/waves-8-done.png` })

  await launched.dispose()
})
