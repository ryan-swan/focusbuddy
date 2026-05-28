import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
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
