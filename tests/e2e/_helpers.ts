import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Boot the built Electron app with an isolated userData directory so each test
 * gets a fresh SQLite database. The caller is responsible for calling
 * `disposeApp` in afterEach/afterAll — otherwise we leak temp dirs.
 *
 * Returns the launched application, its first window, and a cleanup function.
 */
export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  userDataDir: string
  dispose: () => Promise<void>
}

export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'focusbuddy-e2e-'))
  // ELECTRON_RUN_AS_NODE=1 makes Electron boot as a plain Node process — which
  // is what happens when these tests run from inside another Electron host
  // (e.g. Claude Code's terminal). Strip it before launching so we get a real
  // Electron browser process. The user's own dev script does the same (see
  // package.json `dev: env -u ELECTRON_RUN_AS_NODE electron-vite dev`).
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env }
  delete cleanEnv.ELECTRON_RUN_AS_NODE
  // Keep e2e hermetic: never make real (paid, slow, non-deterministic) AI calls.
  // The mind-map / voice / wire / agent specs all assert structural plumbing and
  // the graceful no-key path, not real model output. Leaving a developer's key
  // in the env made agent/transform runs hit Sonnet for 10-30s and race the
  // Electron teardown ("Target page has been closed"). Stripping the keys forces
  // the fast, deterministic no-key path.
  delete cleanEnv.ANTHROPIC_API_KEY
  delete cleanEnv.OPENAI_API_KEY

  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...cleanEnv,
      FB_TEST_USER_DATA: userDataDir,
      NODE_ENV: 'test'
    },
    timeout: 20_000
  })
  // Forward main-process stdout/stderr to test stdout so debugging "page
  // closed" failures actually shows the real Electron error.
  app.process().stdout?.on('data', (b) => process.stdout.write(`[main] ${b}`))
  app.process().stderr?.on('data', (b) => process.stderr.write(`[main] ${b}`))
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  async function dispose(): Promise<void> {
    try {
      await app.close()
    } catch {
      // App may already be closed
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // Best effort
    }
  }
  return { app, window, userDataDir, dispose }
}

/**
 * Wait for the React shell to mount and dismiss any post-boot modals
 * (launch sign-in dialog, welcome prompts) that would otherwise
 * intercept pointer events.
 *
 * Single source of truth for "the app is ready to drive" so future
 * rebrands / wordmark changes only require an edit in one place. The
 * sidebar wordmark heading is the canary (its accessible name is
 * "FOCUSBUDDY" after the futuristic-theme rebrand — matched via regex
 * so a future rename doesn't break every spec again).
 */
export async function waitForReady(
  window: Page,
  opts: { dismissModals?: boolean } = {}
): Promise<void> {
  const dismissModals = opts.dismissModals ?? true
  // Wait for window.api so renderer-side IPC calls inside the test are
  // safe to make immediately after this resolves.
  await window.waitForFunction(
    () => typeof (window as unknown as { api?: unknown }).api === 'object',
    null,
    { timeout: 10_000 }
  )

  // Sidebar wordmark — anchored on an EXACT case-insensitive regex so
  // future case rebrands (FocusBuddy → FOCUSBUDDY → Haptyx) survive a
  // one-line edit here. Must NOT match the launch sign-in dialog's
  // "Sign in to FocusBuddy" heading, hence the anchored ^...$ form.
  await expect(
    window.getByRole('heading', { name: /^(focusbuddy|haptyx)$/i, level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  if (!dismissModals) return

  // First-run onboarding — a fresh test DB triggers it, and its full-screen
  // overlay would intercept pointer events for every UI-driving spec. Click
  // through to dismiss (welcome → skip key → start blank). Best-effort; absent
  // for an existing-data DB. Specs that assert on onboarding pass
  // { dismissModals: false }.
  const onb = window.locator('[role="dialog"][aria-label="Welcome to Haptyx"]')
  if (await onb.isVisible().catch(() => false)) {
    await window.getByRole('button', { name: 'Get started' }).click().catch(() => {})
    await window.getByRole('button', { name: 'Skip for now' }).click().catch(() => {})
    await window.locator('[data-testid="onboarding-start-blank"]').click().catch(() => {})
  }

  // Sign-in modal — dismiss with "Continue without account" so subsequent
  // interactions don't get pointer-intercepted by the modal overlay.
  // Best-effort: if the modal isn't there (account already signed in, or
  // already dismissed within the 7-day TTL) the call is a no-op.
  const skip = window.getByRole('button', {
    name: /continue without account|skip|not now/i
  })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {})
  }
}
