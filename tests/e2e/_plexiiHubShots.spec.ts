import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual-review shots for the Phase 1 gate. Not part of the suite's
// assertions; delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii hub visual shots', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
    w.__fbView?.getState().goHome()
  })
  await window.waitForTimeout(500)
  await window.screenshot({ path: `${OUT}/p1-home.png` })

  // Seed a conversation via the hero.
  const input = window.locator('[data-testid="start-or-ask-input"]')
  await input.fill('Plan a product launch for spring')
  await window.locator('[data-testid="start-or-ask-go"]').click()
  await window.waitForTimeout(1200)
  await window.screenshot({ path: `${OUT}/p1-hub-after-hero.png` })

  // Fresh-chat hub home state.
  await window.locator('[data-testid="conversation-new"]').click()
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/p1-hub-empty.png` })

  // Interactive blocks (P4): seed a turn carrying every block type.
  await window.evaluate(() => {
    const w = window as unknown as { __fbChat?: { setState: (s: Record<string, unknown>) => void } }
    const ts = Date.now()
    w.__fbChat?.setState({
      activeConversationId: null,
      messagesByTask: {
        __new__: [
          { role: 'user', content: 'I want to start something around cooking', ts: ts - 1 },
          { role: 'assistant', content: 'Great starting point — a few directions this could take:', ts }
        ]
      },
      blocksByMessage: {
        [String(ts)]: [
          {
            type: 'cards',
            items: [
              { icon: 'menu_book', title: 'Recipe library', body: 'Collect and organize what you cook' },
              { icon: 'videocam', title: 'Cooking channel', body: 'Film and publish your dishes' },
              { icon: 'storefront', title: 'Pop-up supper club', body: 'Host paid dinners at home' },
              { icon: 'edit_note', title: 'Food newsletter', body: 'Write weekly about what you learn' }
            ]
          },
          {
            type: 'choices',
            id: 'dir',
            prompt: 'Which direction pulls you most?',
            options: [
              { id: 'a', label: 'Recipe library', icon: 'menu_book' },
              { id: 'b', label: 'Cooking channel', icon: 'videocam' },
              { id: 'c', label: 'Supper club', icon: 'storefront' },
              { id: 'd', label: 'Newsletter', icon: 'edit_note' }
            ]
          },
          { type: 'scale', id: 'amb', label: 'How ambitious should this be?', min: 1, max: 10, minLabel: 'Hobby', maxLabel: 'Business' }
        ]
      }
    })
  })
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/p4-blocks.png` })

  // Linked desk (P5): the seed needs a REAL persisted conversation (linking is
  // keyed by conversation id), so reopen the hero-made one from the rail first.
  await window.locator('[data-testid="conversation-row"]').first().click()
  await window.waitForTimeout(600)
  await window.evaluate(() => {
    const w = window as unknown as {
      __fbChat?: {
        getState: () => {
          activeConversationId: string | null
          messagesByTask: Record<string, unknown[]>
        }
        setState: (s: Record<string, unknown>) => void
      }
    }
    const st = w.__fbChat?.getState()
    const convId = st?.activeConversationId
    if (!convId) throw new Error('expected a persisted conversation for the P5 shot')
    const ts = Date.now()
    w.__fbChat?.setState({
      messagesByTask: {
        ...st.messagesByTask,
        [convId]: [
          { role: 'user', content: 'Turn this into a workspace', ts: ts - 1 },
          { role: 'assistant', content: 'Here is the desk this becomes:', ts }
        ]
      },
      proposalsByMessage: {
        [String(ts)]: [
          { id: 'mk-desk', kind: 'create-task', title: 'Supper club', reason: 'the workspace' }
        ]
      },
      blocksByMessage: {}
    })
  })
  await window.waitForTimeout(300)
  const card = window.locator('[data-testid="proposal-card-mk-desk"]')
  if (await card.isVisible().catch(() => false)) {
    await card.click()
    await window.waitForTimeout(900)
  }
  await window.screenshot({ path: `${OUT}/p5-linked-desk.png` })

  // Back home: sidebar sublist with the recent conversation. Place the
  // Discover icon while we are here so the icon block is in the shot.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
    w.__fbView?.getState().goHome()
  })
  await window.waitForTimeout(500)
  await window.locator('[data-testid="home-customize-toggle"]').click()
  await window.locator('[data-testid="home-add-widget"]').click()
  await window.locator('[data-testid="home-gallery-discover"]').click()
  await window.locator('[data-testid="home-picker-add"]').click()
  await window.locator('[data-testid="home-customize-toggle"]').click()
  await window.waitForTimeout(600)
  await window.screenshot({ path: `${OUT}/p1-home-with-recents.png` })

  // The Discover app icon itself, framed with its icon-tier neighbours.
  const iconTile = window.locator('[data-testid="home-discover"]')
  await iconTile.scrollIntoViewIfNeeded()
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/p6-discover-icon.png` })

  // Discovery mode (P6): one tap from the Home icon.
  await window.locator('[data-testid="home-discover-start"]').click()
  await window.waitForTimeout(700)
  await window.screenshot({ path: `${OUT}/p6-discovery.png` })

  await launched.dispose()
})
