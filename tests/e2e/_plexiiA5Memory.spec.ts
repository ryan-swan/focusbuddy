import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A5 engine (M4, R22): settle-time memory extraction on the REAL path — SDK,
// streaming chat, settle, the background Haiku extraction call, the parser,
// and the org-scoped store, with no seam stubbed. The fake Claude streams the
// chat answer; its non-stream lane (which serves the extraction call) returns
// a memory envelope, and the probe asserts the memory genuinely landed in
// fb_memory via the real IPC. Throwaway; delete when A5 closes.

const ENVELOPE = JSON.stringify({
  reply: 'Austin it is — keeping the whole plan here. What is the guest count looking like?',
  actions: []
})

const MEMORY_JSON = JSON.stringify({
  facts: [{ text: 'The wedding venue city is Austin', subject: 'wedding' }],
  preferences: [],
  commitments: [{ text: 'Caleb pays the venue deposit', subject: 'Caleb', due: 'Friday' }]
})

test('plexii A5: a settled turn writes org-scoped memory through the real path', async () => {
  const fake = await startFakeClaude({ text: ENVELOPE, charsPerDelta: 12, deltaMs: 10, shortText: MEMORY_JSON })
  const launched = await launchApp({
    env: { ANTHROPIC_API_KEY: 'sk-ant-fake-e2e', ANTHROPIC_BASE_URL: fake.url }
  })
  const { window } = launched
  await waitForReady(window)
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)

  // A substantive user turn (past the 40-char extraction floor), sent through
  // the real composer.
  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.click()
  await window.keyboard.type(
    'We decided the wedding venue will be in Austin and I will pay the deposit by Friday.',
    { delay: 3 }
  )
  await window.keyboard.press('Enter')
  // The streamed answer settles.
  await expect(window.getByText(/Austin it is/).first()).toBeVisible({ timeout: 15_000 })

  // The extraction is fire-and-forget after settle: poll the real memory IPC
  // until the fact arrives (or fail loudly).
  await expect
    .poll(
      async () =>
        window.evaluate(async () => {
          const api = (window as unknown as {
            api: { memory: { list: () => Promise<Array<{ kind: string; text: string }>> } }
          }).api
          const items = await api.memory.list()
          return items.map((m) => `${m.kind}:${m.text}`).join('|')
        }),
      { timeout: 15_000 }
    )
    .toContain('fact:The wedding venue city is Austin')

  const all = await window.evaluate(async () => {
    const api = (window as unknown as {
      api: { memory: { list: () => Promise<Array<{ kind: string; text: string; due: string }>> } }
    }).api
    return api.memory.list()
  })
  const commitment = all.find((m) => m.kind === 'commitment')
  expect(commitment?.text).toBe('Caleb pays the venue deposit')
  expect(commitment?.due).toBe('Friday')

  await launched.dispose()
  await fake.close()
})
