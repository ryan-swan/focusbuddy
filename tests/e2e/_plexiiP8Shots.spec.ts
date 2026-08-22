import { expect, test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Throwaway visual verification for Plexii UI/UX Phase 8 (the shell): the
// time-grouped history rail with search, the empty-state invitation, and the
// final four-theme sweep of the finished hub. Delete after the mission.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii P8: rail groups, search, four-theme finale', async () => {
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
      // The panel refreshes conversations from the DB on mount; make that a
      // no-op so the seeded list below survives the race.
      ;(w.__fbChat as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
        refreshConversations: async () => {}
      })
      const now = Date.now()
      const conv = (id: string, title: string, daysAgo: number): Record<string, unknown> => ({
        id,
        title,
        updatedAt: now - daysAgo * 86_400_000,
        createdAt: now - daysAgo * 86_400_000
      })
      w.__fbChat?.setState({
        activeConversationId: 'c1',
        conversations: [
          conv('c1', 'Wedding planning desk', 0),
          conv('c2', 'Launch budget questions', 0),
          conv('c3', 'Draft the vendor email', 1),
          conv('c4', 'Q3 review prep', 3),
          conv('c5', 'Supper club idea', 5),
          conv('c6', 'Website copy pass', 12),
          conv('c7', 'Old brainstorm', 60)
        ],
        messagesByTask: {
          c1: [
            { role: 'user', content: 'Set up the wedding planning desk', ts: now - 60000 },
            { role: 'assistant', content: 'Done — the desk is live with your checklist, vendors table, and budget.', ts: now - 59000 }
          ]
        },
        blocksByMessage: {}
      })
    })
    await window.waitForTimeout(700)
  }

  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await seed()

  const rail = window.locator('[data-testid="conversation-rail"]')
  await expect(rail.getByText('Today', { exact: true })).toBeVisible()
  await expect(rail.getByText('Yesterday', { exact: true })).toBeVisible()
  await expect(rail.getByText('Previous 7 days', { exact: true })).toBeVisible()
  await expect(rail.getByText('Previous 30 days', { exact: true })).toBeVisible()
  await expect(rail.getByText('Older', { exact: true })).toBeVisible()
  await window.screenshot({ path: `${OUT}/p8-rail-dark.png` })

  // Search filters and clears.
  await rail.locator('[data-testid="conversation-search"]').fill('vendor')
  await window.waitForTimeout(200)
  await expect(rail.locator('[data-testid="conversation-row"]')).toHaveCount(1)
  await window.screenshot({ path: `${OUT}/p8-rail-search.png` })
  await rail.locator('[data-testid="conversation-search"]').fill('')
  await window.waitForTimeout(200)
  await expect(rail.locator('[data-testid="conversation-row"]')).toHaveCount(7)

  // The finale: the finished hub across all four themes.
  for (const theme of ['light', 'futuristic', 'atelier']) {
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await seed()
    await window.screenshot({ path: `${OUT}/p8-final-${theme}.png` })
  }

  await launched.dispose()
})
