import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// A5.5 verification: the floating panel with a screenshot-shaped answer.
// Asserts the container scale engages (13.5px prose in the ~420px panel),
// nothing overflows the panel horizontally, and the compact composer fits.
// Throwaway; delete when A5.5 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const PROSE = [
  "You're building toward a **90-day investor-ready milestone** with specific proof points to hit before raising.",
  '',
  '## 🚀 Open Commitments',
  '- **Handle the venue deposit — due Friday** (venue budget is capped at $12,000)',
  '',
  '## 💡 Other Context',
  '- You have been exploring a concept of recording all in-app Plexi interactions (inspired by Little Bird AI) to serve as a personal activity memory — with privacy controls built in.',
  '- You have a **scrap-metal recycler outreach list** (317 companies) in your workspace.',
  '- You have ad copy, investor materials, and persona docs suggesting active go-to-market work on Plexi.',
  '- A very long unbroken token for the wrap test: supercalifragilisticexpialidociousantidisestablishmentarianism-pneumonoultramicroscopicsilicovolcanoconiosis',
  '',
  'That is the state of play. Want the milestone plan as a checklist?'
].join('\n')

test('a5.5 repro: floating panel with a formatted answer', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)
  await window.evaluate((prose) => {
    interface Chrome { getState: () => { setMode: (m: string) => void; setTab: (t: string) => void; openPanel: () => void } }
    const w = window as unknown as {
      __fbAssistantChrome?: Chrome
      __fbChat?: { setState: (s: Record<string, unknown>) => void }
    }
    w.__fbAssistantChrome?.getState().setMode('floating')
    w.__fbAssistantChrome?.getState().setTab('chat')
    w.__fbAssistantChrome?.getState().openPanel()
    const ts = 1_755_900_000_000
    w.__fbChat?.setState({
      activeConversationId: null,
      sending: false,
      messagesByTask: {
        __new__: [
          { role: 'user', content: 'Where do we stand?', ts: ts - 10_000 },
          { role: 'assistant', content: prose, ts }
        ]
      }
    })
  }, PROSE)
  await window.waitForTimeout(600)
  await expect(window.locator('[data-testid="assistant-overlay"]')).toBeVisible()

  // The container scale engaged: prose renders at the compact size.
  const proseSize = await window
    .locator('[data-testid="chat-scroll"] .fb-chat-prose')
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(proseSize).toBe('13px')

  // Nothing overflows the panel horizontally — the "words hanging off the
  // edge" check, measured, not eyeballed.
  const overflow = await window.evaluate(() => {
    const panel = document.querySelector('[data-testid="assistant-panel"]') as HTMLElement
    const scroll = document.querySelector('[data-testid="chat-scroll"]') as HTMLElement
    const panelRight = panel.getBoundingClientRect().right
    let worst = 0
    for (const el of Array.from(panel.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width > 0) worst = Math.max(worst, r.right - panelRight)
    }
    return { worst, hscroll: scroll.scrollWidth - scroll.clientWidth }
  })
  expect(overflow.worst).toBeLessThanOrEqual(1)
  expect(overflow.hscroll).toBeLessThanOrEqual(1)

  // The compact composer: chip labels hidden, the chips themselves present.
  await expect(window.locator('[data-testid="chat-mode-chip"] .fb-cq-label')).toBeHidden()
  await expect(window.locator('[data-testid="chat-web-globe"]')).toBeVisible()
  await expect(window.locator('[data-testid="chat-turn-into-desk"]')).toBeVisible()

  // The card wears a radius (AI-39): the overlay clips at radius-card.
  const radius = await window
    .locator('[data-testid="assistant-overlay"]')
    .evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
  expect(parseFloat(radius)).toBeGreaterThanOrEqual(12)

  await window.screenshot({ path: `${OUT}/a55-after.png`, clip: { x: 940, y: 100, width: 500, height: 800 } })
  await launched.dispose()
})
