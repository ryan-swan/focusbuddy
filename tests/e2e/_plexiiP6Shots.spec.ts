import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 6 (trace narrative):
// live elapsed counter, collapsed summary with duration. Delete after the
// mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii P6: live elapsed and summary duration', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)

  await window.evaluate(() => {
    const w = window as unknown as {
      __fbView?: { getState: () => { goPlexii: () => void } }
      __fbChat?: { setState: (s: Record<string, unknown>) => void }
    }
    w.__fbView?.getState().goPlexii()
    const ts = Date.now()
    w.__fbChat?.setState({
      activeConversationId: null,
      sending: true,
      messagesByTask: {
        __new__: [{ role: 'user', content: 'Pull the venue numbers together', ts: ts - 5000 }]
      },
      liveTraceByThread: {
        __new__: {
          status: 'running',
          startedAt: ts - 4500,
          retrievedAt: null,
          retrievalMs: null,
          repliedAt: null,
          completedAt: null,
          mentions: [],
          sources: [],
          tools: [],
          activity: null,
          error: null
        }
      },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(1400)
  const live = window.locator('[data-testid="assistant-trace"], [data-testid="chat-pending"]').first()
  await expect(live).toBeVisible()
  const liveText = await window.locator('[aria-live="polite"]').first().innerText()
  expect(liveText).toMatch(/\d+s/)
  await window.screenshot({ path: `${OUT}/p6-trace-live.png` })

  // A finished turn whose trace collapsed to the quiet summary + duration.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    const ts = Date.now()
    w.__fbChat?.setState({
      sending: false,
      liveTraceByThread: {},
      messagesByTask: {
        __new__: [
          { role: 'user', content: 'Pull the venue numbers together', ts: ts - 9000 },
          { role: 'assistant', content: 'The venue runs $1,200 for the evening [1].', ts }
        ]
      },
      traceByMessage: {
        [String(ts)]: {
          status: 'done',
          startedAt: ts - 5000,
          retrievedAt: ts - 3800,
          retrievalMs: 1200,
          repliedAt: ts - 2000,
          completedAt: ts - 1800,
          mentions: [],
          sources: [
            { n: 1, docId: 'd1', title: 'Venue contract', docType: 'doc', snippet: 'the evening rate' }
          ],
          tools: [],
          activity: null,
          error: null
        }
      },
      traceDisclosureByMessage: { [String(ts)]: 'closed' },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(500)
  const collapsed = window.locator('[data-testid="trace-collapsed"]').first()
  await expect(collapsed).toBeVisible()
  const summary = await collapsed.innerText()
  expect(summary).toContain('source')
  expect(summary).toMatch(/·\s*3\.2s/)
  await window.screenshot({ path: `${OUT}/p6-trace-collapsed.png` })

  await launched.dispose()
})
