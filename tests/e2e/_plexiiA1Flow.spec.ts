import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// The real streaming path, end to end, judged by instruments instead of by
// eye: a fake Claude streams an SDR-shaped envelope (headings, citations, a
// bare quote in the prose, a list, a table, one action) at token cadence
// through the SDK, the envelope scanner, IPC, the store, and the renderer.
// A MutationObserver counts every character that was on screen and then
// removed while the answer was still revealing (a remount = a flash), a
// frame sampler records how much text lands per frame (a flood) and how far
// the viewport moves per frame (a jump). Throwaway for the A1 gate; delete
// when the stage closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const REPLY = [
  '# How to Be a Great SDR in 2026',
  '',
  'The role has fundamentally shifted from high-volume activity to high-precision, signal-based execution [1][2]. Cold call counts don\'t win anymore; the best SDRs target buying moments — funding rounds, new hires, tech-stack changes — rather than blasting static persona lists [1].',
  '',
  '---',
  '',
  '### 1. Lead with buying signals, not volume',
  'Fewer, better-timed touches beat spray-and-pray every time [2]. The new definition: "a strategic operator — the critical human intelligence layer guiding an automated prospecting engine" [3].',
  '',
  '### 2. Let AI handle the research layer',
  'AI now reliably handles the tasks that used to eat 40-60% of an SDR\'s day [3]:',
  '- Reading company sites, news feeds, and tech stacks in seconds',
  '- Building lists against ICP criteria',
  '- First-draft email personalization',
  '- Lead qualification and fit scoring',
  '',
  'Your job is to guide the engine, not feed it manually.',
  '',
  '### 3. The stack',
  '',
  '| Layer | Tool |',
  '|---|---|',
  '| Signals | Intent data |',
  '| Research | An agent |',
  '| Sequencing | The CRM |',
  '',
  'If you want, I can turn the three pillars into a checklist on this desk.'
].join('\n')

const ENVELOPE = JSON.stringify({
  reply: REPLY,
  actions: [{ kind: 'create-task', title: 'Build the SDR signal checklist', reason: 'The three pillars as a working list' }]
})

test('plexii A1 flow: the real stream reveals without a flash, a flood, or a jump', async () => {
  const fake = await startFakeClaude({ text: ENVELOPE, charsPerDelta: 9, deltaMs: 30 })
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
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)

  // Instruments.
  await window.evaluate(() => {
    type Probe = {
      removedChars: number
      removedSamples: string[]
      frames: { t: number; len: number; scroll: number }[]
      done: boolean
    }
    const probe: Probe = { removedChars: 0, removedSamples: [], frames: [], done: false }
    ;(window as unknown as { __probe: Probe }).__probe = probe
    const textOf = (n: Node): string => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
      const el = n as Element
      if (el.classList?.contains('fb-stream-caret')) return ''
      return (el.textContent ?? '').trim()
    }
    const mo = new MutationObserver((records) => {
      if (probe.done) return
      for (const r of records) {
        const host = (r.target as Element).closest?.('[data-testid="streaming-prose"]')
        if (!host) continue
        if (host.getAttribute('data-drained') === 'true') continue
        for (const n of Array.from(r.removedNodes)) {
          const t = textOf(n)
          if (t.trim()) {
            probe.removedChars += t.trim().length
            if (probe.removedSamples.length < 12) probe.removedSamples.push(t.trim().slice(0, 60))
          }
        }
      }
    })
    mo.observe(document.body, { childList: true, subtree: true, characterData: false })
    const scroller = document.querySelector('[data-testid="chat-scroll"]')
    const tick = (): void => {
      const prose = document.querySelector('[data-testid="streaming-prose"]')
      if (prose) {
        probe.frames.push({
          t: performance.now(),
          len: (prose.textContent ?? '').length,
          scroll: scroller?.scrollTop ?? 0
        })
        if (prose.getAttribute('data-drained') === 'true') probe.done = true
      }
      if (!probe.done) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.click()
  await window.keyboard.type('How do I become a great SDR in 2026?', { delay: 5 })
  await window.keyboard.press('Enter')

  const prose = window.locator('[data-testid="streaming-prose"]')
  await expect(prose).toHaveCount(1, { timeout: 30_000 })
  await window.waitForTimeout(1500)
  await window.screenshot({ path: `${OUT}/flow-1-early.png` })
  await window.waitForTimeout(4000)
  await window.screenshot({ path: `${OUT}/flow-2-mid.png` })
  await expect(prose).toHaveCount(0, { timeout: 90_000 })
  await window.waitForTimeout(300)
  await window.screenshot({ path: `${OUT}/flow-3-handoff.png` })
  await expect(window.locator('[data-testid="trace-collapsed"]')).toBeVisible({ timeout: 5000 })
  await window.waitForTimeout(500)
  await window.screenshot({ path: `${OUT}/flow-4-done.png` })

  const probe = await window.evaluate(() => (window as unknown as { __probe: unknown }).__probe) as {
    removedChars: number
    removedSamples: string[]
    frames: { t: number; len: number; scroll: number }[]
  }
  let maxLenJump = 0
  let maxScrollJump = 0
  let shrinks = 0
  for (let i = 1; i < probe.frames.length; i++) {
    const a = probe.frames[i - 1]
    const b = probe.frames[i]
    maxLenJump = Math.max(maxLenJump, b.len - a.len)
    if (b.len < a.len) shrinks++
    maxScrollJump = Math.max(maxScrollJump, Math.abs(b.scroll - a.scroll))
  }
  const finalText = await window.locator('[data-testid="assistant-turn"]').last().innerText()
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      frames: probe.frames.length,
      removedChars: probe.removedChars,
      removedSamples: probe.removedSamples,
      maxLenJumpPerFrame: maxLenJump,
      shrinks,
      maxScrollJumpPerFrame: Math.round(maxScrollJump),
      durationS: probe.frames.length ? ((probe.frames.at(-1)!.t - probe.frames[0].t) / 1000).toFixed(1) : 0,
      requests: fake.requests.length
    })
  )
  // No flash: nothing that was on screen while revealing was ever removed.
  expect(probe.removedChars).toBe(0)
  // Never going backwards.
  expect(shrinks).toBe(0)
  // No flood: a frame lands at most a held construct's worth, never a burst.
  expect(maxLenJump).toBeLessThan(160)
  // No jump: the viewport glides.
  expect(maxScrollJump).toBeLessThan(40)
  // Decoded and formatted: no literal escapes, the headings are headings.
  expect(finalText).not.toContain('\\n')
  expect(finalText).not.toContain('###')
  await expect(window.locator('[data-testid="assistant-turn"] h3').first()).toBeVisible()
  // The divider that crashed the renderer whenever it hit the streaming edge
  // (caret injected into a void <hr>) renders as a rule, not a crash.
  await expect(window.locator('[data-testid="assistant-turn"] hr').first()).toBeAttached()
  await expect(window.locator('[data-testid^="proposal-card-"]').first()).toBeVisible()

  await launched.dispose()
  await fake.close()
})
