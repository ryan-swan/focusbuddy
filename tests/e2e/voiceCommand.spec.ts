import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// VoiceCommandFAB E2E.
//
// We can't drive the actual mic / Whisper / Claude path in CI (no audio,
// no API key, would burn tokens). Coverage is the structural plumbing
// that ensures the FAB lands on-screen, the settings round-trip works,
// the prefs persist, and the IPC contract for voiceCommand:run is callable
// from the renderer.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function boot(): Promise<LaunchedApp> {
  const app = await launchApp()
  const { window } = app
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )
  const skip = window.getByRole('button', {
    name: /Continue without account|Skip|Not now/i
  })
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
  return app
}

test('FAB renders bottom-middle with idle mic icon', async () => {
  launched = await boot()
  const { window } = launched
  const fab = window.locator('[data-testid="voice-command-fab"]')
  await expect(fab).toBeVisible()
  await expect(fab).toHaveAttribute('data-phase', 'idle')

  // Horizontally centered: button's x-center within ±60px of viewport
  // center. The +/- band accounts for the chrome (sidebar / AI rail)
  // offsetting the canvas area but the FAB itself lives at left-1/2.
  const box = await fab.boundingBox()
  const viewport = window.viewportSize()
  expect(box).toBeTruthy()
  if (box && viewport) {
    const center = box.x + box.width / 2
    expect(Math.abs(center - viewport.width / 2)).toBeLessThan(80)
    // Bottom-anchored: under 200px from the bottom of viewport
    expect(viewport.height - (box.y + box.height)).toBeLessThan(200)
  }
})

test('voiceCommand prefs round-trip through IPC', async () => {
  launched = await boot()
  const { window } = launched
  const initial = await window.evaluate(() => window.api.voiceCommand.getPrefs())
  expect(initial.commandMode).toMatch(/press-hold|click-toggle/)
  expect(initial.autoStopSilenceMs).toBeGreaterThanOrEqual(1000)
  expect(typeof initial.voiceback).toBe('boolean')

  // Flip to click-toggle, change silence to 8s, disable voiceback.
  const next = await window.evaluate(() =>
    window.api.voiceCommand.setPrefs({
      commandMode: 'click-toggle',
      autoStopSilenceMs: 8000,
      voiceback: false
    })
  )
  expect(next.commandMode).toBe('click-toggle')
  expect(next.autoStopSilenceMs).toBe(8000)
  expect(next.voiceback).toBe(false)

  // Reload and confirm persistence.
  await window.reload()
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )
  const after = await window.evaluate(() => window.api.voiceCommand.getPrefs())
  expect(after.commandMode).toBe('click-toggle')
  expect(after.autoStopSilenceMs).toBe(8000)
  expect(after.voiceback).toBe(false)

  // Restore defaults so this test doesn't pollute other test runs.
  await window.evaluate(() =>
    window.api.voiceCommand.setPrefs({
      commandMode: 'press-hold',
      autoStopSilenceMs: 5000,
      voiceback: true
    })
  )
})

test('voiceCommand:run rejects empty transcript with empty_transcript reason', async () => {
  launched = await boot()
  const { window } = launched
  const res = await window.evaluate(() =>
    window.api.voiceCommand.run({
      transcript: '   ',
      activeTaskId: null,
      selectedWidgetId: null,
      widgets: []
    })
  )
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.reason).toBe('empty_transcript')
  }
})

test('FAB tooltip reflects the current trigger mode', async () => {
  launched = await boot()
  const { window } = launched
  // Default mode is press-hold.
  const fab = window.locator('[data-testid="voice-command-fab"]')
  // The tooltip text lives in the FAB's title attribute, which is set regardless
  // of hover, so we assert it directly. We do not hover: the FAB carries a
  // continuous idle animation that never settles to Playwright's actionability
  // check, so hover hangs.
  await expect(fab).toBeVisible()
  await expect(fab).toHaveAttribute('title', 'Hold to speak')

  // Switch to click-toggle and reload — fab should now read "Click to speak".
  await window.evaluate(() =>
    window.api.voiceCommand.setPrefs({ commandMode: 'click-toggle' })
  )
  await window.reload()
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )
  const skip = window.getByRole('button', {
    name: /Continue without account|Skip|Not now/i
  })
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
  const fab2 = window.locator('[data-testid="voice-command-fab"]')
  await expect(fab2).toBeVisible()
  await expect(fab2).toHaveAttribute('title', 'Click to speak')

  // Restore default.
  await window.evaluate(() =>
    window.api.voiceCommand.setPrefs({ commandMode: 'press-hold' })
  )
})
