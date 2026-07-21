import { test, expect } from '@playwright/test'
import { launchApp } from './_helpers'

// Diagnostic against a COPY of the operator's real profile (never the original —
// see scratchpad path below, populated by the tester agent from
// ~/Library/Application Support/focusbuddy). Instruments every webContents for
// navigation to a bundle .js / dev-server URL and watches for the "raw minified
// source rendered as text" failure mode. Throwaway — delete after triage.

const REAL_PROFILE_COPY =
  '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/08400787-884c-474c-8ae7-9f9d75902fea/scratchpad/userdata-copy'

test('diag: boot against copied real profile, watch every webContents for 12s', async () => {
  test.setTimeout(60_000)
  const { app, window, dispose } = await launchApp({ userDataDir: REAL_PROFILE_COPY })
  try {
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      const log = (line: string): void => {
        // eslint-disable-next-line no-console
        console.log(line)
      }
      electronApp.on('web-contents-created', (_e, contents) => {
        const type = contents.getType()
        const id = contents.id
        log(`[DIAG-REAL] web-contents-created id=${id} type=${type}`)
        const check = (event: string, url: string): void => {
          const suspicious =
            /localhost:5173|localhost:5174|\/assets\/.*\.js(\?|#|$)/.test(url) ||
            (/^file:\/\//.test(url) && /\.js(\?|#|$)/.test(url))
          const tag = suspicious ? '[DIAG-REAL][SUSPECT]' : '[DIAG-REAL]'
          log(`${tag} id=${id} type=${type} event=${event} url=${url}`)
        }
        contents.on('did-start-loading', () =>
          log(`[DIAG-REAL] id=${id} type=${type} did-start-loading current=${contents.getURL()}`)
        )
        contents.on('will-navigate', (_e2, url) => check('will-navigate', url))
        contents.on('did-navigate', (_e2, url) => check('did-navigate', url))
        contents.on('did-navigate-in-page', (_e2, url) => check('did-navigate-in-page', url))
        contents.on('did-fail-load', (_e2, code, desc, url) =>
          log(`[DIAG-REAL] id=${id} type=${type} did-fail-load code=${code} desc=${desc} url=${url}`)
        )
      })
      for (const w of BrowserWindow.getAllWindows()) {
        log(`[DIAG-REAL] existing window url=${w.webContents.getURL()}`)
      }
    })

    // Poll for up to 6s on the default (auto-restored) desk first.
    for (let i = 0; i < 3; i++) {
      await window.waitForTimeout(2000)
      const allWindows = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL(), title: w.getTitle() }))
      )
      console.log(`[DIAG-REAL] pre-nav t+${(i + 1) * 2}s windows:`, JSON.stringify(allWindows))
    }

    // Navigate directly to the desk that hosts the malformed widget
    // (6d2d4ae5-...) whose saved content is a dev-server (localhost:5173) URL —
    // found via direct DB inspection of the copied profile.
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
      w.__fbView?.getState().goTask('db26423b-7358-499e-97e0-8f0078a0b0c4')
    })
    console.log('[DIAG-REAL] navigated to task db26423b (hosts the localhost:5173 widget)')

    // Poll for up to 12s, sampling the top window's URL, all window URLs, and the
    // visible body text (to catch raw-JS-as-text leaking into the DOM itself,
    // e.g. inside a doc body rather than a navigated webContents).
    for (let i = 0; i < 6; i++) {
      await window.waitForTimeout(2000)
      const allWindows = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL(), title: w.getTitle() }))
      )
      console.log(`[DIAG-REAL] t+${(i + 1) * 2}s windows:`, JSON.stringify(allWindows))
      const bodySample = await window
        .evaluate(() => document.body.innerText.slice(0, 400))
        .catch(() => '(eval failed)')
      const looksLikeJs = /data-testid: ?"office-related|export default function|from"\.\.\/|=>\{/.test(bodySample)
      if (looksLikeJs) {
        console.log('[DIAG-REAL][SUSPECT-BODY]', JSON.stringify(bodySample))
      }
    }

    // Don't hard-fail the run on suspects — we want the log either way. Assert
    // only that the process didn't crash and we got at least one window.
    const finalWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    expect(finalWindows).toBeGreaterThan(0)
  } finally {
    await dispose()
  }
})
