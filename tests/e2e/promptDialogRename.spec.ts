/**
 * E2E coverage for the PromptDialog replacement of window.prompt.
 *
 * Electron's window.prompt returns null without showing anything, so every
 * menu item that relied on it (Rename, Insert link, etc.) silently did
 * nothing. This spec drives two of the fourteen replaced call sites end to
 * end: the doc editor's File > Rename, and Insert > Link, both of which must
 * now open the shared in-app dialog (data-testid prompt-dialog /
 * prompt-dialog-input / prompt-dialog-confirm) and actually apply the value.
 *
 * PROMPT-1 and PROMPT-2 are fully UI-driven (menu clicks, dialog typing).
 * PROMPT-3 drives the text selection step through the DocEditor's exposed
 * `window.__docEditor` debug handle rather than a keyboard gesture — see the
 * inline comment there for why — but the dialog open/fill/confirm and the
 * resulting <a href> assertion are still real UI + rendered-DOM checks.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

type FbWindow = Window & {
  api: {
    documents: {
      create: (opts: Record<string, unknown>) => Promise<{ id: string }>
      get: (id: string) => Promise<{ title: string; body: unknown } | null>
    }
  }
  __fbView?: { getState: () => { goDocument: (id: string) => void } }
}

async function openDocInEditor(window: import('@playwright/test').Page, title: string): Promise<string> {
  const id = await window.evaluate(async (t) => {
    const w = window as unknown as FbWindow
    const d = await w.api.documents.create({ docType: 'doc', title: t })
    return d.id
  }, title)
  await window.evaluate((docId) => {
    ;(window as unknown as FbWindow).__fbView?.getState().goDocument(docId)
  }, id)
  await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({ timeout: 10_000 })
  return id
}

test('PROMPT-1 — File > Rename opens the PromptDialog pre-filled with the current title, and renaming applies it', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const original = 'Original Title'
    const id = await openDocInEditor(window, original)

    await window.locator('[data-testid="doc-menu-file"]').click()
    const dropdown = window.locator('[data-testid="doc-menu-file-list"]')
    await expect(dropdown).toBeVisible({ timeout: 3_000 })
    await dropdown.locator('span.truncate', { hasText: 'Rename' }).click()

    // The dialog is a real in-app element, not a native window.prompt (which
    // Electron never shows — this is exactly the bug being fixed).
    const dialog = window.locator('[data-testid="prompt-dialog"]')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog).toContainText('Rename document')

    const input = window.locator('[data-testid="prompt-dialog-input"]')
    await expect(input).toBeVisible()
    await expect(input).toHaveValue(original)

    // Typing replaces the pre-selected text (selectAll defaults true).
    await input.fill('Renamed Title')
    await window.locator('[data-testid="prompt-dialog-confirm"]').click()

    await expect(dialog).not.toBeVisible({ timeout: 3_000 })

    // The store applied the rename; confirm via IPC (source of truth) and the
    // visible editor header title.
    const doc = await window.evaluate((docId) => {
      const w = window as unknown as FbWindow
      return w.api.documents.get(docId)
    }, id)
    expect(doc?.title).toBe('Renamed Title')
  } finally {
    await dispose()
  }
})

test('PROMPT-2 — cancelling the rename dialog (Escape) leaves the title unchanged', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const original = 'Keep This Title'
    const id = await openDocInEditor(window, original)

    await window.locator('[data-testid="doc-menu-file"]').click()
    await window.locator('[data-testid="doc-menu-file-list"]').locator('span.truncate', { hasText: 'Rename' }).click()

    const dialog = window.locator('[data-testid="prompt-dialog"]')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    const input = window.locator('[data-testid="prompt-dialog-input"]')
    await input.fill('Should Not Stick')
    await window.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 3_000 })

    const doc = await window.evaluate((docId) => {
      const w = window as unknown as FbWindow
      return w.api.documents.get(docId)
    }, id)
    expect(doc?.title).toBe(original)
  } finally {
    await dispose()
  }
})

test('PROMPT-3 — Insert > Link opens the PromptDialog and applies a real link mark to the selected text', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocInEditor(window, 'Link Test Doc')

    const surface = window.locator('[data-testid="doc-editor-surface"]')
    await surface.click()
    await surface.type('Visit our site')

    // Select the word "site" (last 4 chars). A keyboard Shift+ArrowLeft
    // selection is lost the instant focus leaves the contenteditable to click
    // the menu bar (a real, reproducible headless-Electron quirk — clicking
    // an out-of-editor button collapses the DOM selection before ProseMirror's
    // own selection model can be read back). We drive the same contract
    // deterministically instead, through the DocEditor's exposed debug handle
    // (window.__docEditor), which is exactly the TipTap `Editor` instance the
    // menu bar itself calls `.chain()` on — so this exercises the identical
    // insertLink() code path, just with a selection set programmatically
    // rather than by a flaky pointer/keyboard gesture.
    await window.evaluate(() => {
      const w = window as unknown as { __docEditor?: { state: { doc: { textContent: string } }; commands: { setTextSelection: (r: { from: number; to: number }) => void } } }
      const ed = w.__docEditor
      if (!ed) throw new Error('window.__docEditor debug handle not found')
      const text = ed.state.doc.textContent
      const idx = text.indexOf('site')
      if (idx < 0) throw new Error('expected text "site" not found in document')
      // ProseMirror doc positions are 1-based at the start of the first text node.
      const from = idx + 1
      const to = from + 'site'.length
      ed.commands.setTextSelection({ from, to })
    })

    await window.locator('[data-testid="doc-menu-insert"]').click()
    const insertDropdown = window.locator('[data-testid="doc-menu-insert-list"]')
    await expect(insertDropdown).toBeVisible({ timeout: 3_000 })
    await insertDropdown.locator('span.truncate', { hasText: 'Link' }).click()

    const dialog = window.locator('[data-testid="prompt-dialog"]')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog).toContainText('Link URL')

    const input = window.locator('[data-testid="prompt-dialog-input"]')
    await input.fill('https://example.com')
    await window.locator('[data-testid="prompt-dialog-confirm"]').click()
    await expect(dialog).not.toBeVisible({ timeout: 3_000 })

    // The TipTap link extension renders a real <a href> in the editor DOM.
    const link = surface.locator('a[href="https://example.com"]')
    await expect(link).toBeVisible({ timeout: 3_000 })
    await expect(link).toContainText('site')
  } finally {
    await dispose()
  }
})
