import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 7 (the cards):
// ProposalCards on fb-card material with Tone tints, pending + applied side
// by side, dark and light. Delete after the mission if unwanted.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii P7: proposal cards in one design generation', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  const seed = async (): Promise<void> => {
    await window.evaluate(() => {
      const w = window as unknown as {
        __fbView?: { getState: () => { goPlexii: () => void } }
        __fbChat?: { setState: (s: Record<string, unknown>) => void }
      }
      w.__fbView?.getState().goPlexii()
      const ts = 1755820000000
      w.__fbChat?.setState({
        activeConversationId: null,
        sending: false,
        messagesByTask: {
          __new__: [
            { role: 'user', content: 'Set up the wedding planning desk', ts: ts - 1 },
            { role: 'assistant', content: "Let's build you a wedding planning desk. Here is what I can set up:", ts }
          ]
        },
        proposalsByMessage: {
          [String(ts)]: [
            { id: 'todo-1', kind: 'create-todo-list', title: 'Wedding Planning Checklist', items: ['Book venue', 'Send invites', 'Confirm caterer', 'Order flowers', 'Print place cards'], reason: 'Core wedding milestones to track' },
            { id: 'table-1', kind: 'create-table', title: 'Vendors & Bookings', columns: [{ label: 'Vendor', type: 'text-short' }, { label: 'Service', type: 'text-short' }, { label: 'Cost', type: 'number' }, { label: 'Booked', type: 'checkbox' }, { label: 'Notes', type: 'text-long' }], reason: 'Track all vendors in one place' },
            { id: 'sticky-1', kind: 'create-widget', widgetKind: 'sticky', title: 'Wedding At-a-Glance', content: 'June 14 · Rosewood Barn · 120 guests · budget $18k', reason: 'Quick-reference card for key details' },
            { id: 'task-1', kind: 'create-task', title: 'Wedding planning', notes: 'The desk that holds it all', reason: 'A home for everything below' }
          ]
        },
        appliedProposals: {
          [`${ts}::todo-1`]: { message: 'Added to this desk', target: null }
        },
        blocksByMessage: {}
      })
    })
    await window.waitForTimeout(500)
  }

  for (const theme of ['dark', 'light']) {
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await seed()
    await expect(window.locator('[data-testid="proposal-card-applied-todo-1"]')).toBeVisible()
    await expect(window.locator('[data-testid="proposal-card-table-1"]')).toBeVisible()
    await window.screenshot({ path: `${OUT}/p7-cards-${theme}.png` })
  }

  await launched.dispose()
})
