import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 5 (the composer as a
// card): glass tier, Send⇄Stop swap, discovery placeholder. Delete after the
// mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii P5: glass composer, stop swap, discovery placeholder', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(500)
  // Idle: glass composer, send affordance.
  await window.screenshot({ path: `${OUT}/p5-composer-idle.png` })

  // While sending: the same seat holds Stop, and the edge-light is on.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    const ts = Date.now()
    w.__fbChat?.setState({
      activeConversationId: null,
      sending: true,
      messagesByTask: {
        __new__: [
          { role: 'user', content: 'Draft the plan', ts: ts - 1 },
          { role: 'assistant', content: 'Here is a first pass at the plan, starting with', ts }
        ]
      },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(400)
  await expect(window.locator('[data-testid="chat-stop"]')).toBeVisible()
  await window.screenshot({ path: `${OUT}/p5-composer-stop.png` })

  // Back to idle; discovery placeholder in a fresh discovery conversation.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    w.__fbChat?.setState({
      sending: false,
      pendingMode: 'discovery',
      activeConversationId: null,
      messagesByTask: { __new__: [] }
    })
  })
  await window.waitForTimeout(400)
  const ph = await window
    .locator('.assistant-composer-input p.is-editor-empty')
    .first()
    .getAttribute('data-placeholder')
    .catch(() => null)
  expect(ph ?? '').toContain('Start anywhere')
  await window.screenshot({ path: `${OUT}/p5-composer-discovery.png` })

  await launched.dispose()
})
