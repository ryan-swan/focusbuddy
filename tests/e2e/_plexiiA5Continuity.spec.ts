import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// A5 build 2 (AI-04, R24): desk-to-chat continuity, both doors. A desk whose
// conversation exists wears the breadcrumb chip (door 1), and opening the
// assistant from that desk lands in that conversation (door 2). Throwaway;
// delete when A5 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

test('plexii A5: a desk reopens the conversation that built it', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')

  // Seed: a desk, and a conversation linked to it as PRIMARY with one turn.
  const deskId = await window.evaluate(async () => {
    const api = (window as unknown as {
      api: {
        nodes: { create: (d: unknown) => Promise<{ id: string }> }
        aiChat: {
          createConversation: (i: unknown) => Promise<{ id: string }>
          appendMessage: (id: string, m: unknown) => Promise<unknown>
          linkDesk: (id: string, taskId: string, primary?: boolean) => Promise<unknown>
        }
      }
    }).api
    const desk = await api.nodes.create({ parentId: null, kind: 'task', title: 'Wedding desk' })
    const conv = await api.aiChat.createConversation({ taskId: null, title: 'Wedding planning' })
    await api.aiChat.appendMessage(conv.id, {
      role: 'user',
      content: 'Plan my sister’s wedding',
      ts: Date.now()
    })
    await api.aiChat.linkDesk(conv.id, desk.id, true)
    return desk.id
  })
  await window.reload()
  await waitForReady(window)

  // Onto the desk: the breadcrumb wears the continuity chip (door 1).
  await window.evaluate((id) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
    w.__fbView?.getState().goTask(id)
  }, deskId)
  const chip = window.locator('[data-testid="desk-conversation-chip"]')
  await expect(chip).toBeVisible()
  await window.waitForTimeout(300)
  await window.screenshot({ path: `${OUT}/a5-desk-chip.png`, clip: { x: 0, y: 0, width: 900, height: 220 } })

  // Door 1: the chip opens the assistant ON the linked conversation.
  await chip.click()
  await expect(window.locator('[data-testid="assistant-tab-chat"]')).toBeVisible()
  await expect(window.getByText(/Plan my sister/).first()).toBeVisible()
  await window.waitForTimeout(300)
  await window.screenshot({ path: `${OUT}/a5-door1-open.png` })

  // Door 2: close the panel, start a NEW chat so the panel points elsewhere,
  // close again, and reopen from the desk — it lands back in the desk's
  // conversation by default.
  await window.evaluate(() => {
    const w = window as unknown as {
      __fbChat?: { getState: () => { newConversation: () => void } }
    }
    w.__fbChat?.getState().newConversation()
  })
  await window.evaluate(() => {
    interface Chrome { getState: () => { close: () => void; openPanel: () => void } }
    const w = window as unknown as { __fbAssistantChrome?: Chrome }
    w.__fbAssistantChrome?.getState().close()
  })
  await window.evaluate(() => {
    interface Chrome { getState: () => { close: () => void; openPanel: () => void } }
    const w = window as unknown as { __fbAssistantChrome?: Chrome }
    w.__fbAssistantChrome?.getState().openPanel()
  })
  await expect(window.getByText(/Plan my sister/).first()).toBeVisible()

  await launched.dispose()
})
