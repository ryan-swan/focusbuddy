import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 3 (streaming). Drives
// the REAL StreamingProse path by simulating deltas through the chat store the
// same way onReplyDelta writes them. Delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const FULL = [
  'Here is the launch plan, in three moves.',
  '',
  '## First move',
  'We lock the **venue** and the date, then confirm the caterer within the week.',
  '',
  '## Second move',
  'Invites go out in two waves so the room fills without a rush at the door.',
  '',
  '```ts',
  'const rsvps = waves.flatMap((w) => w.responses)',
  '```',
  '',
  '## Third move',
  'A quiet follow-up two days before, and a printed list at the entrance. ' +
    'The plan holds as long as the checklist above stays green and the vendors confirm on time.'
].join('\n')

test('plexii P3 streaming: paced reveal, caret, scroll lock', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)

  // Open the stream: user turn + empty assistant turn, sending=true — exactly
  // the state the first onReplyDelta leaves behind.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    const ts = Date.now()
    // Enough prior history that the transcript genuinely scrolls — the lock
    // and the pill only exist when there is somewhere to scroll back to.
    const filler = Array.from({ length: 4 }, (_, k) => [
      { role: 'user', content: `Earlier question ${k + 1} about the plan`, ts: ts - 100 + k * 2 },
      {
        role: 'assistant',
        content: `An earlier answer, long enough to take real vertical space.\n\n${'Planning detail line, repeated to give the transcript height.\n\n'.repeat(6)}`,
        ts: ts - 99 + k * 2
      }
    ]).flat()
    w.__fbChat?.setState({
      activeConversationId: null,
      sending: true,
      messagesByTask: {
        __new__: [
          ...filler,
          { role: 'user', content: 'Lay out the launch plan', ts: ts - 1 },
          { role: 'assistant', content: '', ts }
        ]
      },
      blocksByMessage: {}
    })
  })

  // Feed cumulative deltas in bursts (network-shaped: irregular, chunky).
  const feed = async (upTo: number): Promise<void> => {
    await window.evaluate((slice) => {
      const w = window as unknown as {
        __fbChat?: {
          getState: () => { messagesByTask: Record<string, Array<Record<string, unknown>>> }
          setState: (s: Record<string, unknown>) => void
        }
      }
      const st = w.__fbChat!.getState()
      const msgs = [...st.messagesByTask.__new__]
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: slice }
      w.__fbChat!.setState({ messagesByTask: { ...st.messagesByTask, __new__: msgs } })
    }, FULL.slice(0, upTo))
  }

  await feed(120)
  await window.waitForTimeout(300)
  await expect(window.locator('[data-testid="streaming-prose"]')).toBeVisible()
  await window.screenshot({ path: `${OUT}/p3-stream-early.png` })

  await feed(FULL.length)
  await window.waitForTimeout(700)
  await window.screenshot({ path: `${OUT}/p3-stream-mid.png` })
  // Mid-reveal the fence is either held back entirely or complete — never torn.
  const midText = await window.locator('[data-testid="streaming-prose"]').innerText()
  const fenceOpen = midText.includes('const rsvps')
  if (fenceOpen) {
    await expect(window.locator('[data-testid="streaming-prose"] pre')).toBeVisible()
  }

  // Scroll lock: pin the view to the top while the reveal still grows.
  await window.evaluate(() => {
    const el = document.querySelector('[data-testid="streaming-prose"]')?.closest('.overflow-auto')
    if (el) el.scrollTop = 0
    el?.dispatchEvent(new Event('scroll'))
  })
  await window.waitForTimeout(400)
  const pill = window.locator('[data-testid="jump-to-latest"]')
  await expect(pill).toBeVisible()
  await window.screenshot({ path: `${OUT}/p3-jump-pill.png` })
  await pill.click()
  await window.waitForTimeout(600)
  await expect(pill).toBeHidden()

  // Close the stream: the turn re-renders through the completed pipeline.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    w.__fbChat?.setState({ sending: false })
  })
  await window.waitForTimeout(400)
  await expect(window.locator('[data-testid="streaming-prose"]')).toHaveCount(0)
  await window.screenshot({ path: `${OUT}/p3-stream-done.png` })

  await launched.dispose()
})
