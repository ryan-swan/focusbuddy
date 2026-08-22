import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual-review shots for the Plexii AI program, stage A1
// (interactive blocks, folded-at-completion trace, keyword-match disclosure).
// Not part of the suite's assertions; delete when the stage closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const PROSE = [
  'Here are the directions we could take the launch, grounded in your workspace [1].',
  '',
  'The short version: the venue decision gates everything else, and the budget sheet already carries the ceiling for it.'
].join('\n')

test('plexii A1 shots: blocks act, trace folds, keyword disclosure', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  const seed = async (disclosure: 'open' | 'closed'): Promise<void> => {
    await window.evaluate(
      ({ prose, disc }) => {
        const w = window as unknown as {
          __fbView?: { getState: () => { goPlexii: () => void } }
          __fbChat?: { setState: (s: Record<string, unknown>) => void }
        }
        w.__fbView?.getState().goPlexii()
        const ts = 1_755_900_000_000
        w.__fbChat?.setState({
          activeConversationId: null,
          sending: false,
          messagesByTask: {
            __new__: [
              { role: 'user', content: 'What are our options for the launch?', ts: ts - 10_000 },
              { role: 'assistant', content: prose, ts }
            ]
          },
          blocksByMessage: {
            [String(ts)]: [
              {
                type: 'cards',
                items: [
                  { icon: 'rocket_launch', title: 'Soft launch first', body: 'Two weeks with the beta list before the public date.' },
                  { icon: 'groups', title: 'Partner-led', body: 'Let the three anchor partners carry the announcement.' },
                  { icon: 'calendar_month', title: 'Single-day event', body: 'One coordinated push, everything lands together.' }
                ]
              },
              {
                type: 'icon-row',
                items: [
                  { icon: 'description', label: 'Docs' },
                  { icon: 'table_chart', label: 'Budget sheet' },
                  { icon: 'checklist', label: 'Runsheet' }
                ]
              }
            ]
          },
          sourcesByMessage: {
            [String(ts)]: [
              { n: 1, docId: 'doc-1', title: 'Launch budget', docType: 'document', snippet: 'Venue ceiling $1,200' }
            ]
          },
          traceByMessage: {
            [String(ts)]: {
              status: 'done',
              startedAt: ts - 9000,
              retrievedAt: ts - 8000,
              retrievalMs: 412,
              repliedAt: ts - 2000,
              completedAt: ts,
              mentions: [],
              semantic: false,
              sources: [
                { n: 1, docId: 'doc-1', title: 'Launch budget', docType: 'document', snippet: 'Venue ceiling $1,200' },
                { n: 2, docId: 'kb-1', title: 'Launch decisions', docType: 'knowledge', snippet: 'Partner-led preferred' }
              ],
              tools: [],
              activity: null,
              error: null
            }
          },
          traceDisclosureByMessage: { [String(ts)]: disc }
        })
      },
      { prose: PROSE, disc: disclosure }
    )
    await window.waitForTimeout(600)
  }

  // 1) The completed turn as it lands: trace folded to its summary line,
  //    interactive cards + icon-row below the prose. Dark + atelier.
  for (const theme of ['dark', 'atelier']) {
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await seed('closed')
    await window.screenshot({ path: `${OUT}/a1-turn-folded-${theme}.png` })
  }

  // 2) Dark, trace expanded: the keyword-match disclosure on the search line.
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await seed('open')
  await window.screenshot({ path: `${OUT}/a1-trace-open-dark.png` })

  // 3) Dark, hover a card: the drill-in affordance (press surface + arrow).
  const card = window.locator('[data-testid="ui-card-item"]').first()
  if (await card.isVisible().catch(() => false)) {
    await card.hover()
    await window.waitForTimeout(200)
    await window.screenshot({ path: `${OUT}/a1-card-hover-dark.png` })
  }

  await launched.dispose()
})
