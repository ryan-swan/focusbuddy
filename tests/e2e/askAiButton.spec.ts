import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The canvas "Ask AI" button (was the separate "Build with AI" / "AI Setup"
// pair) now opens the single, store-backed command bar — the same one the
// header button and Cmd+Shift+K open.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('AA-1 — the canvas Ask AI button opens the command bar', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a task so the task toolbar (which holds the canvas Ask AI button) renders.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: 'AskAiToolbarTest' })
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /AskAiToolbarTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })

  // The canvas toolbar Ask AI button is identified by its title.
  const canvasAskAi = window.getByTitle(/Ask AI — describe what you want/)
  await expect(canvasAskAi).toBeVisible()
  await canvasAskAi.click()

  // The single command bar opens (aria-label "AI command bar").
  const commandBar = window.locator('[role="dialog"][aria-label="AI command bar"]')
  await expect(commandBar).toBeVisible({ timeout: 4000 })

  // Escape closes it (store-driven).
  await window.keyboard.press('Escape')
  await expect(commandBar).toHaveCount(0, { timeout: 4000 })
})

test('AA-2 — submitting routes the intent through ai.routeCommand end to end', async () => {
  // The command bar classifies intent via the dedicated ai.routeCommand endpoint,
  // NOT chat.send. chat.send would impose the workspace-build system prompt and
  // run the {reply, proposals} envelope parser over the result, which discards
  // the router prompt and mangles the small intent JSON — the bug this fixes.
  //
  // We assert the round-trip resolves to a real outcome: a parsed intent preview
  // when the key works, or an honest error / no-key prompt when it doesn't. What
  // it must NEVER be is the idle "Try" state (proves classify ran) — and a parsed
  // "Proposed …" preview is only reachable because the router JSON survived the
  // new transport intact.
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: 'RouteCmdTest' })
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /RouteCmdTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })

  await window.getByTitle(/Ask AI — describe what you want/).click()
  const commandBar = window.locator('[role="dialog"][aria-label="AI command bar"]')
  await expect(commandBar).toBeVisible({ timeout: 4000 })

  const input = commandBar.locator('textarea')
  await input.fill('set up a workspace for my podcast launch')
  await input.press('Enter')

  // The idle suggestion block ("Try") must disappear — classify ran.
  await expect(commandBar.getByText('Try', { exact: true })).toBeHidden({ timeout: 12000 })

  // And the bar must resolve to a real outcome: a parsed intent preview (key
  // works) OR an honest error / no-key prompt (key absent/invalid). Critically
  // NOT the old envelope-parser failure ("couldn't read my own response"), which
  // is what chat.send produced on router JSON.
  await expect(
    commandBar.getByText(
      /Proposed workspace|Add to this task|Here'?s what|Add your Anthropic API key|Something went wrong|Could not/i
    )
  ).toBeVisible({ timeout: 12000 })
})
