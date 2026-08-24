import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// A4 build 2 (AI-07, R19): the conversation-mode chip. A mode is a property
// of the conversation, worn on the composer, switched deliberately from the
// chip's menu, sticky on the row; the header keeps only the informational
// badge and its old toggle is retired. Throwaway; delete when A4 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii A4: the conversation-mode chip wears, switches, and sticks', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  // In through the mascot to the composer.
  await window.locator('[data-testid="assistant-pill"]').click()
  await window.locator('[data-testid="assistant-tab-chat"]').click()
  const chip = window.locator('[data-testid="chat-mode-chip"]')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('Chat')
  // The retired header toggle is genuinely gone.
  await expect(window.locator('[data-testid="chat-mode-toggle"]')).toHaveCount(0)

  // The menu lists the registry with blurbs; the active mode is checked.
  await chip.click()
  const menu = window.locator('[data-testid="chat-mode-menu"]')
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-testid="chat-mode-option-chat"]')).toContainText('Chat')
  await expect(menu.locator('[data-testid="chat-mode-option-discovery"]')).toContainText(
    'Nothing is created'
  )
  // Let the pop-in entrance finish so the shot shows the settled menu.
  await window.waitForTimeout(350)
  await window.screenshot({ path: `${OUT}/a4-mode-menu.png` })

  // Picking Discovery flips the chip AND raises the header badge.
  await menu.locator('[data-testid="chat-mode-option-discovery"]').click()
  await expect(menu).toHaveCount(0)
  await expect(chip).toContainText('Discovery')
  await expect(window.locator('[data-testid="chat-mode-badge"]')).toBeVisible()
  await window.screenshot({ path: `${OUT}/a4-mode-discovery.png` })

  // And back — never a one-way door.
  await chip.click()
  await window.locator('[data-testid="chat-mode-option-chat"]').click()
  await expect(chip).toContainText('Chat')
  await expect(window.locator('[data-testid="chat-mode-badge"]')).toHaveCount(0)

  await launched.dispose()
})

test('plexii A4: proposal checkboxes turn Apply all into Apply selected', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  // Seed a settled assistant turn carrying a three-card build (AI-09).
  await window.evaluate(() => {
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
          { role: 'user', content: 'Set up the launch workspace', ts: ts - 10_000 },
          { role: 'assistant', content: 'Here is the launch setup — apply the cards below.', ts }
        ]
      },
      proposalsByMessage: {
        [String(ts)]: [
          { id: 'p1', kind: 'create-todo-list', title: 'Launch checklist', items: ['Hosting', 'Pilot'] },
          { id: 'p2', kind: 'create-table', title: 'Episodes', columns: [{ label: 'Title', type: 'text-short' }] },
          { id: 'p3', kind: 'create-widget', widgetKind: 'markdown', title: 'Notes' }
        ]
      }
    })
  })

  // All three pending: the batch button offers Apply all.
  const batchBtn = window.locator('[data-testid="proposal-apply-batch"]')
  await expect(batchBtn).toContainText('Apply all 3')

  // Tick two — the button flips to Apply selected 2; untick back to all.
  await window.locator('[data-testid="proposal-check-p1"]').click()
  await window.locator('[data-testid="proposal-check-p3"]').click()
  await expect(batchBtn).toContainText('Apply selected 2')
  await window.waitForTimeout(250)
  await window.screenshot({ path: `${OUT}/a4-apply-selected.png` })
  await window.locator('[data-testid="proposal-check-p1"]').click()
  await window.locator('[data-testid="proposal-check-p3"]').click()
  await expect(batchBtn).toContainText('Apply all 3')

  await launched.dispose()
})
