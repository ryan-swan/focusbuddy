import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for the facelift's F1 (layout truth):
// replicates Caleb's judged scenario — two Q/A pairs with finished traces and
// a docked follow-up question — and captures the rebuilt rhythm, the
// floating composer, and the line-free bottom region. Delete after mission.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii F1: pair rhythm, floating composer, docked question', async () => {
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
    const now = Date.now()
    const trace = (ts: number, titles: string[]): Record<string, unknown> => ({
      status: 'done',
      startedAt: ts - 2000,
      retrievedAt: ts - 1900,
      retrievalMs: 98,
      repliedAt: ts - 100,
      completedAt: ts,
      mentions: [],
      sources: titles.map((t, i) => ({ n: i + 1, docId: `d${ts}-${i}`, title: t, docType: i % 2 ? 'doc' : 'knowledge', snippet: '…' })),
      tools: [],
      activity: null,
      error: null
    })
    const ts1 = now - 60000
    const ts2 = now - 30000
    w.__fbChat?.setState({
      activeConversationId: null,
      sending: false,
      messagesByTask: {
        __new__: [
          { role: 'user', content: 'Testing', ts: ts1 - 1 },
          { role: 'assistant', content: "I'm here! What are you working on?", ts: ts1 },
          { role: 'user', content: 'Build me a desk', ts: ts2 - 1 },
          { role: 'assistant', content: "What should the desk be for? Tell me the topic or goal and I'll set it up.", ts: ts2 }
        ]
      },
      traceByMessage: {
        [String(ts1)]: trace(ts1, ['PAE — Scoring Integrity', 'ResilientIQ — README', 'Feature Testing Tracker']),
        [String(ts2)]: trace(ts2, ['AI-Routed Messenger — build-spec', 'The Build — Plexi Brain — index', 'PlexiDesk reconciliation'])
      },
      traceDisclosureByMessage: { [String(ts1)]: 'closed', [String(ts2)]: 'closed' },
      questionByMessage: {
        [String(ts2)]: {
          prompt: 'What kind of desk do you want to build?',
          options: ['Flamelit project overview', 'New workstream (ResilientIQ, PAE, AIND)', 'Something unrelated to Flamelit'],
          allowFreeText: true
        }
      },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(600)

  // The question docks inside the composer card; no free-standing card.
  await expect(window.locator('[data-testid="assistant-question-card"]')).toBeVisible()
  // No dividing lines in the bottom region, and the form floats.
  const borders = await window.evaluate(() => {
    const form = document.querySelector('form')
    if (!form) return 'no-form'
    const cs = getComputedStyle(form)
    return `${cs.position} borderTop=${cs.borderTopWidth}`
  })
  expect(borders).toContain('absolute')
  expect(borders).toContain('borderTop=0px')
  await window.screenshot({ path: `${OUT}/f1-rhythm-dark.png` })

  // F2: expand a trace — the evidence panel with kind-coloured icons and
  // provenance slots.
  await window.locator('[data-testid="trace-collapsed"]').first().click()
  await window.waitForTimeout(400)
  await expect(window.locator('[data-testid="trace-leaf"]').first()).toBeVisible()
  await window.screenshot({ path: `${OUT}/f2-trace-open.png` })

  await launched.dispose()
})
