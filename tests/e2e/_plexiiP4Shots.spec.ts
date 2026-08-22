import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 4 (the presence):
// breathing double-i in the live trace, shimmering status label, and the
// composer edge-light, in dark theme. Delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii P4: breathing mark, shimmer, edge-light', async () => {
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
        __new__: [{ role: 'user', content: 'What does the launch budget look like?', ts: ts - 1 }]
      },
      liveTraceByThread: {
        __new__: {
          status: 'running',
          startedAt: ts - 900,
          retrievedAt: ts - 200,
          retrievalMs: 640,
          repliedAt: null,
          completedAt: null,
          mentions: [],
          sources: [
            { n: 1, docId: 'd1', title: 'Launch budget v3', docType: 'doc', snippet: 'the venue line is' },
            { n: 2, docId: 'd2', title: 'Vendor quotes', docType: 'sheet', snippet: 'catering per head' }
          ],
          tools: [],
          activity: null,
          error: null
        }
      },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(900)
  await expect(window.locator('[data-testid="plexii-thinking"]').first()).toBeVisible()
  await window.screenshot({ path: `${OUT}/p4-presence-dark.png` })
  // F1 ruling: no edge-light, no shimmer — the breathing mark is the only
  // thinking motion, ever.
  expect(await window.locator('.fb-ai-edge').count()).toBe(0)
  expect(await window.locator('.fb-status-shimmer').count()).toBe(0)

  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    w.__fbChat?.setState({ sending: false, liveTraceByThread: {} })
  })
  await window.waitForTimeout(300)
  await window.screenshot({ path: `${OUT}/p4-presence-idle.png` })

  await launched.dispose()
})
