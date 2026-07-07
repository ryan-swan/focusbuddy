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

export async function launchApp(opts?: {
  env?: Record<string, string>
  // Reuse an existing userData directory instead of minting a fresh one —
  // for restart-persistence specs that need a second Electron instance to
  // see what the first one saved (e.g. confirming a server-side save
  // survives a relaunch + session revalidation, not just in-memory state).
  // The caller owns cleanup of a reused dir; `dispose()` only removes
  // directories this call itself created.
  userDataDir?: string
}): Promise<LaunchedApp> {
  const userDataDir = opts?.userDataDir ?? mkdtempSync(join(tmpdir(), 'focusbuddy-e2e-'))
  const ownsDir = !opts?.userDataDir
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
      NODE_ENV: 'test',
      // Per-test overrides (e.g. PLEXI_APP=office to boot the PlexiOffice shell).
      ...(opts?.env ?? {})
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
    // app.close() on Electron 37 / macOS can hang indefinitely when the
    // inspector remains attached. Race it against a 5 s timeout and fall back
    // to SIGKILL so tests don't exhaust the 30 s afterEach budget.
    try {
      await Promise.race([
        app.close(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('app.close() timed out')), 5_000)
        )
      ])
    } catch {
      // Grace period elapsed or app already gone — force-kill the process.
      try {
        app.process().kill()
      } catch {
        // Already dead
      }
    }
    if (ownsDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        // Best effort
      }
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

  // App-shell painted signal. The old wordmark heading only rendered on the
  // home/suite view, so a test that reloaded into a non-home view (Documents,
  // Calendar, an editor) would hang here even though the app was fully ready.
  // The global footer sync chip renders in every view as a sibling of <main>,
  // so it is the robust "shell is up" signal that survives a reload into any
  // view. (The renderer-ready gate above already confirms window.api exists.)
  await expect(window.locator('[data-testid="footer-sync-chip"]')).toBeVisible({ timeout: 10_000 })

  if (!dismissModals) return

  // First-run onboarding — a fresh test DB triggers it, and its full-screen
  // overlay would intercept pointer events for every UI-driving spec. Click
  // through to dismiss (welcome → skip key → start blank). Best-effort; absent
  // for an existing-data DB. Specs that assert on onboarding pass
  // { dismissModals: false }.
  const onb = window.locator('[role="dialog"][aria-label="Welcome to PlexiDesk"]')
  if (await onb.isVisible().catch(() => false)) {
    await window.getByRole('button', { name: 'Get started' }).click().catch(() => {})
    await window.locator('[data-testid="onboarding-key-skip"]').click().catch(() => {})
    // Tour step (surfaces overview) sits between the key step and the starter.
    await window.locator('[data-testid="onboarding-tour-continue"]').click().catch(() => {})
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

// Where each former top-level product now lives under the three-segment IA.
//   - `seg` products live inside a SegmentShell (PlexiDesk / PlexiBrain): open
//     the segment via its nav testid, then click `segment-app-<app>`.
//   - `comms` products live inside the PlexiOffice shell's Communicate menu:
//     open PlexiOffice, then click `office-comms-app-<app>`.
//   - `direct` products no longer have a segment home (Build / Form); navigate
//     straight to their view through the view store so their spec coverage
//     survives. The view renders in the global MainPane, testids unchanged.
type ProductRoute =
  | { mode: 'seg'; switch: string; app: string }
  | { mode: 'comms'; app: string }
  | { mode: 'direct'; go: string }

const SEGMENT_OF: Record<string, ProductRoute> = {
  // Plans and Tasks are Desk-area views reachable straight from the view store.
  projects: { mode: 'direct', go: 'goProjects' },
  tasks: { mode: 'direct', go: 'goAllTasks' },
  reports: { mode: 'direct', go: 'goReports' },
  // Flow / API live in the PlexiBrain area; jump there via the always-visible
  // area switcher, then click the app tile.
  flow: { mode: 'seg', switch: 'switch-plexibrain', app: 'flows' },
  api: { mode: 'seg', switch: 'switch-plexibrain', app: 'api' },
  chat: { mode: 'comms', app: 'chat' },
  meet: { mode: 'comms', app: 'meet' },
  build: { mode: 'direct', go: 'goApps' },
  form: { mode: 'direct', go: 'goForms' }
}

// Navigate to a product. The area switcher (Desk / Office / People / Brain) is
// visible on every view, so we switch area then open the app; Desk-area views are
// driven straight through the view store. The product's own view + testids render
// unchanged.
export async function openProduct(window: Page, product: keyof typeof SEGMENT_OF): Promise<void> {
  const route = SEGMENT_OF[product]

  if (route.mode === 'direct') {
    await window.evaluate((go) => {
      const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
      w.__fbView?.getState()[go]?.()
    }, route.go)
    return
  }

  if (route.mode === 'comms') {
    await window.locator('[data-testid="switch-office"]').click()
    await window.locator(`[data-testid="office-comms-app-${route.app}"]`).click()
    return
  }

  await window.locator(`[data-testid="${route.switch}"]`).click()
  await window.locator(`[data-testid="segment-app-${route.app}"]`).click()
}

// Navigate through the exposed view store. The object-based IA no longer has
// literal sidebar buttons for these destinations, so specs drive navigation via
// __fbView (the same approach documents.spec.ts / documentTrash.spec.ts use).
// Use this instead of getByRole('button', { name: /^Documents$/ }) and friends.
export async function gotoView(
  window: Page,
  fn:
    | 'goHome'
    | 'goDocuments'
    | 'goCalendar'
    | 'goVault'
    | 'goAllTasks'
    | 'goProjects'
    | 'goReports'
    | 'goFiles'
    | 'goInbox'
    | 'goMeetings'
    | 'goMail'
): Promise<void> {
  await window.evaluate((f) => {
    const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
    w.__fbView?.getState()[f]?.()
  }, fn)
  await window.waitForTimeout(300)
}
