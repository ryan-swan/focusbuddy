import { test, expect } from '@playwright/test'
import { launchApp } from './_helpers'

// Throwaway diagnostic for the "raw minified bundle source rendered as a
// window/surface" report. Instruments web-contents-created + navigation
// events on the main process and checks the rendered DOM for JS-source
// leakage. Not a permanent spec — delete after triage.

test('diag: PlexiDesk boot — no webContents ever navigates to a bundle .js URL', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      electronApp.on('web-contents-created', (_e, contents) => {
        const type = contents.getType()
        const id = contents.id
        // eslint-disable-next-line no-console
        console.log(`[DIAG] web-contents-created id=${id} type=${type}`)
        const flagIfAsset = (event: string, url: string): void => {
          const suspicious =
            (/\/assets\/.*\.js(\?|#|$)/.test(url) || (/^file:\/\//.test(url) && /\.js(\?|#|$)/.test(url))) &&
            !/\.html/.test(url)
          const tag = suspicious ? '[DIAG][SUSPECT-JS-URL]' : '[DIAG]'
          // eslint-disable-next-line no-console
          console.log(`${tag} id=${id} type=${type} event=${event} url=${url}`)
        }
        contents.on('did-start-loading', () => {
          // eslint-disable-next-line no-console
          console.log(`[DIAG] id=${id} type=${type} did-start-loading current-url=${contents.getURL()}`)
        })
        contents.on('will-navigate', (_e2, url) => flagIfAsset('will-navigate', url))
        contents.on('did-navigate', (_e2, url) => flagIfAsset('did-navigate', url))
        contents.on('did-navigate-in-page', (_e2, url) => flagIfAsset('did-navigate-in-page', url))
      })
      // Snapshot all windows right now and report their URLs.
      for (const w of BrowserWindow.getAllWindows()) {
        // eslint-disable-next-line no-console
        console.log(`[DIAG] existing window url=${w.webContents.getURL()}`)
      }
    })

    // Let the app settle into its default restored state.
    await window.waitForTimeout(2000)

    const bodyTextAtBoot = await window.evaluate(() => document.body.innerText.slice(0, 500))
    const hasJsLeakAtBoot = /office-related-panel|office-related-item-|data-testid: ?"office-related/.test(
      bodyTextAtBoot
    )
    console.log('[DIAG] boot body text sample:', JSON.stringify(bodyTextAtBoot.slice(0, 300)))
    expect(hasJsLeakAtBoot, `Boot-time body text looked like raw JS source: ${bodyTextAtBoot}`).toBe(false)

    // Enumerate all windows + webContents URLs after boot.
    const windowsAfterBoot = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => w.webContents.getURL())
    )
    console.log('[DIAG] windows after boot:', windowsAfterBoot)
    for (const url of windowsAfterBoot) {
      expect(url, `A window loaded a raw JS asset: ${url}`).not.toMatch(/\/assets\/.*\.js(\?|#|$)/)
    }
  } finally {
    await dispose()
  }
})

test('diag: PlexiOffice standalone (PLEXI_APP=office) — boot + Related click', async () => {
  const { app, window, dispose } = await launchApp({ env: { PLEXI_APP: 'office' } })
  try {
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      electronApp.on('web-contents-created', (_e, contents) => {
        const type = contents.getType()
        const id = contents.id
        // eslint-disable-next-line no-console
        console.log(`[DIAG-OFFICE] web-contents-created id=${id} type=${type}`)
        const flagIfAsset = (event: string, url: string): void => {
          const suspicious =
            (/\/assets\/.*\.js(\?|#|$)/.test(url) || (/^file:\/\//.test(url) && /\.js(\?|#|$)/.test(url))) &&
            !/\.html/.test(url)
          const tag = suspicious ? '[DIAG-OFFICE][SUSPECT-JS-URL]' : '[DIAG-OFFICE]'
          // eslint-disable-next-line no-console
          console.log(`${tag} id=${id} type=${type} event=${event} url=${url}`)
        }
        contents.on('will-navigate', (_e2, url) => flagIfAsset('will-navigate', url))
        contents.on('did-navigate', (_e2, url) => flagIfAsset('did-navigate', url))
        contents.on('did-navigate-in-page', (_e2, url) => flagIfAsset('did-navigate-in-page', url))
      })
      for (const w of BrowserWindow.getAllWindows()) {
        // eslint-disable-next-line no-console
        console.log(`[DIAG-OFFICE] existing window url=${w.webContents.getURL()}`)
      }
    })

    await window.waitForTimeout(1500)
    const topUrl = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL())
    console.log('[DIAG-OFFICE] top window url:', topUrl)

    const bodyTextAtBoot = await window.evaluate(() => document.body.innerText.slice(0, 500))
    console.log('[DIAG-OFFICE] boot body text sample:', JSON.stringify(bodyTextAtBoot.slice(0, 300)))

    // Create + open a doc so the "Related" control renders (it only shows once
    // a document is active). Use the exposed IPC surface directly — deterministic,
    // no reliance on drive UI double-click semantics.
    const created = await window.evaluate(async () => {
      const w = window as unknown as {
        api: { office: { createDoc?: (t: string, type: string) => Promise<{ id: string }> } }
      }
      // Fall back through whatever doc-create surface exists; log what we find.
      return typeof w.api?.office === 'object' ? Object.keys(w.api.office) : null
    })
    console.log('[DIAG-OFFICE] window.api.office keys:', created)

    // Drive via UI: click "New document" if present, else skip doc-open steps
    // and just report on the drive/list surface.
    const newDocBtn = window.getByRole('button', { name: /new document|new doc/i }).first()
    if (await newDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newDocBtn.click()
      await window.waitForTimeout(800)
    }

    const relatedBtn = window.locator('[data-testid="office-related-btn"]')
    const relatedVisible = await relatedBtn.isVisible({ timeout: 3000 }).catch(() => false)
    console.log('[DIAG-OFFICE] related button visible:', relatedVisible)
    if (relatedVisible) {
      await relatedBtn.click()
      await window.waitForTimeout(500)
      const panelText = await window
        .locator('[data-testid="office-related-panel"]')
        .innerText()
        .catch(() => '(panel not found)')
      console.log('[DIAG-OFFICE] related panel text:', panelText)
    }

    const windowsAfterClick = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => w.webContents.getURL())
    )
    console.log('[DIAG-OFFICE] windows after related click:', windowsAfterClick)
    for (const url of windowsAfterClick) {
      expect(url, `A window loaded a raw JS asset: ${url}`).not.toMatch(/\/assets\/.*\.js(\?|#|$)/)
    }

    const bodyTextAfter = await window.evaluate(() => document.body.innerText.slice(0, 2000))
    const looksLikeRawSource = /export default function|=>\{|function\s*\w*\(/.test(bodyTextAfter) &&
      /office-related-panel/.test(bodyTextAfter)
    console.log('[DIAG-OFFICE] looksLikeRawSource:', looksLikeRawSource)
    expect(looksLikeRawSource, `Body text after Related click looked like raw JS: ${bodyTextAfter}`).toBe(false)
  } finally {
    await dispose()
  }
})
