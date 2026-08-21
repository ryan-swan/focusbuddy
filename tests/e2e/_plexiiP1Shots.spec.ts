import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual-review shots for the Plexii UI/UX mission, Phase 1 gate
// (prose layer on tokens + radius/type law). Not part of the suite's
// assertions; delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const MD = [
  '# Launch plan',
  'Here is the **structure** I suggest, grounded in your workspace [1].',
  '## Timeline',
  'Kickoff runs *two weeks*, then we review. `npm run build` gates each step.',
  '> The best launch is the one your calendar can survive.',
  '### Checklist',
  '- [ ] Venue booked',
  '- [x] Budget approved',
  '1. Draft the invite',
  '2. Send to the list',
  '#### Budget detail',
  '| Item | Cost | Owner |',
  '|---|---|---|',
  '| Venue | $1,200 | Sam |',
  '| Catering | $800 | Ana |',
  '```ts',
  'const total = items.reduce((a, b) => a + b.cost, 0)',
  '```',
  'Final note with a [link](https://example.com) and ~~a cut item~~.'
].join('\n')

test('plexii P1 prose + law shots, four themes', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  // Into the hub with a markdown-heavy seeded turn.
  const seed = async (): Promise<void> => {
    await window.evaluate((md) => {
      const w = window as unknown as {
        __fbView?: { getState: () => { goPlexii: () => void; goHome: () => void } }
        __fbChat?: { setState: (s: Record<string, unknown>) => void }
      }
      w.__fbView?.getState().goPlexii()
      const ts = Date.now()
      w.__fbChat?.setState({
        activeConversationId: null,
        messagesByTask: {
          __new__: [
            { role: 'user', content: 'Lay out the launch plan with budget and code sample', ts: ts - 1 },
            { role: 'assistant', content: md, ts }
          ]
        },
        blocksByMessage: {}
      })
    }, MD)
    await window.waitForTimeout(500)
  }

  for (const theme of ['dark', 'light', 'futuristic', 'atelier']) {
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await seed()
    await window.screenshot({ path: `${OUT}/p1-prose-${theme}.png` })
  }

  // Dark theme detail shots: composer + a mode menu open.
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await seed()
  const composer = window.locator('[data-testid="chat-composer"]')
  if (await composer.isVisible().catch(() => false)) await composer.click()
  await window.screenshot({ path: `${OUT}/p1-composer-focus.png` })

  await launched.dispose()
})
