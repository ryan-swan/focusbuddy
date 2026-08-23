import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A2 reach verification (#16/#17, engine 2a-2c): content that was previously
// unreachable — a living-doc widget, a Drive file, a past Plexii conversation —
// grounds a real retrieval, wears an identity in the trace, and its trace row
// is a live door (R5). Runs the REAL path: fake Claude via ANTHROPIC_BASE_URL,
// real main-process retrieval over a seeded profile. Throwaway; delete when A2
// closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const ENVELOPE = JSON.stringify({
  reply: 'Grounded: the answer rests on the retrieved sources [1].',
  actions: []
})

test('plexii A2 reach: widget, file, and chat pools ground and open', async () => {
  const fake = await startFakeClaude({ text: ENVELOPE, charsPerDelta: 16, deltaMs: 8 })
  const launched = await launchApp({
    env: { ANTHROPIC_API_KEY: 'sk-ant-fake-e2e', ANTHROPIC_BASE_URL: fake.url }
  })
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), process.env.SHOT_THEME ?? 'dark')
  await window.reload()
  await waitForReady(window)

  // Seed the three previously-unreachable populations through the app's own
  // APIs, so every save-chokepoint index hook runs exactly as it would live.
  await window.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          nodes: { create: (d: unknown) => Promise<{ id: string }> }
          widgets: { create: (d: unknown) => Promise<{ id: string }> }
          files: {
            ingestBuffer: (i: {
              buffer: ArrayBuffer
              originalName: string
              mimeType: string
            }) => Promise<{ id: string }>
          }
          aiChat: {
            createConversation: (i: unknown) => Promise<{ id: string }>
            appendMessage: (id: string, m: unknown) => Promise<unknown>
          }
        }
      }
    ).api
    const desk = await api.nodes.create({ parentId: null, kind: 'task', title: 'Hydrofoil build' })
    await api.widgets.create({
      taskId: desk.id,
      kind: 'living-doc',
      title: 'Desk digest',
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Desk digest: the hydrofoil budget is $4,200 and the mast order ships Tuesday.'
              }
            ]
          }
        ]
      })
    })
    const fileText = 'Vendor shortlist for the hydrofoil: Acme Marine leads, Tidal Works as backup.'
    await api.files.ingestBuffer({
      buffer: new TextEncoder().encode(fileText).buffer as ArrayBuffer,
      originalName: 'vendor-shortlist.txt',
      mimeType: 'text/plain'
    })
    const convo = await api.aiChat.createConversation({ taskId: null, title: 'Pricing strategy' })
    await api.aiChat.appendMessage(convo.id, {
      role: 'user',
      content: 'What should our pricing be?',
      ts: Date.now() - 1000
    })
    await api.aiChat.appendMessage(convo.id, {
      role: 'assistant',
      content: 'We decided pricing is three numbers on one page: 9k project, 4k monthly, 3k annual.',
      ts: Date.now() - 999
    })
  })
  // The index hooks are async (dynamic import + reindex); give them a beat.
  await window.waitForTimeout(1200)

  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)

  const composer = window.locator('[data-testid="chat-composer"]')
  const collapsed = window.locator('[data-testid="trace-collapsed"]')

  // Round 1: one question whose answer spans the widget AND the file.
  await composer.click()
  await window.keyboard.type('What is the hydrofoil budget and vendor shortlist?', { delay: 3 })
  await window.keyboard.press('Enter')
  await expect(collapsed.first()).toBeVisible({ timeout: 60_000 })
  await collapsed.first().click() // unfold the finished trace to read its rows
  const leaves1 = window.locator('[data-testid="trace-leaf"]')
  await expect(leaves1.filter({ hasText: 'Desk digest' }).first()).toBeVisible({ timeout: 5000 })
  await expect(leaves1.filter({ hasText: 'vendor-shortlist.txt' }).first()).toBeVisible()
  await window.screenshot({ path: `${OUT}/reach-1-widget-file-sources.png` })

  // The file row is a live door: it reveals the file in the Drive.
  await window
    .locator('[data-testid="trace-leaf-link"]')
    .filter({ hasText: 'vendor-shortlist.txt' })
    .first()
    .click()
  await expect(window.locator('text=vendor-shortlist.txt').first()).toBeVisible({ timeout: 5000 })
  await window.screenshot({ path: `${OUT}/reach-2-file-revealed.png` })

  // Round 2: cross-conversation recall (#18's mechanism) from a fresh chat.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)
  await composer.click()
  await window.keyboard.type('What did we decide about pricing last week?', { delay: 3 })
  await window.keyboard.press('Enter')
  await expect(collapsed.first()).toBeVisible({ timeout: 60_000 })
  await collapsed.first().click()
  const chatLeaf = window
    .locator('[data-testid="trace-leaf-link"]')
    .filter({ hasText: 'Pricing strategy' })
    .first()
  await expect(chatLeaf).toBeVisible({ timeout: 5000 })
  await window.screenshot({ path: `${OUT}/reach-3-chat-source.png` })

  // The chat row opens the cited conversation itself.
  await chatLeaf.click()
  await expect(window.locator('text=three numbers on one page').first()).toBeVisible({
    timeout: 5000
  })
  await window.screenshot({ path: `${OUT}/reach-4-chat-opened.png` })

  await launched.dispose()
})
