/**
 * E2E tests for DocBubbleMenu "apply this style across the whole document" action.
 *
 * Coverage:
 *  AA-1  Bold text selected → bubble shows apply-across button → confirm dialog
 *        lists "Bold" chip → clicking confirm propagates bold to other paragraphs.
 *  AA-2  Undo (best-effort): after apply-across, Ctrl/Cmd+Z reverts the other
 *        paragraphs to plain text.
 *  AA-3  Empty-state path: plain unformatted text selected → confirm dialog
 *        shows "nothing to apply" message and no confirm button.
 *
 * Uses window.__docEditor to drive selections deterministically (same pattern as
 * existing docEditor.spec.ts).
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

// ── Shared helpers ────────────────────────────────────────────────────────────

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({
    timeout: 8_000
  })
}

async function startBlankDoc(window: Page): Promise<void> {
  const blankRow = window.locator('text=Or start blank:').locator('..')
  await blankRow.locator('button', { hasText: 'Document' }).first().click()
  await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({
    timeout: 8_000
  })
}

/**
 * Set editor content and select the first paragraph via the __docEditor debug
 * handle so the BubbleMenu's `from !== to` gate fires reliably.
 */
async function seedAndSelectFirst(window: Page): Promise<void> {
  // Seed three paragraphs using the editor's setContent command.
  await window.evaluate(() => {
    const e = (
      window as unknown as {
        __docEditor?: {
          commands: { setContent: (html: string, emit?: boolean) => void }
        }
      }
    ).__docEditor
    e?.commands.setContent('<p>alpha</p><p>beta</p><p>gamma</p>', true)
  })
  await window.waitForTimeout(150)

  // Select the first paragraph ("alpha") — positions 1..6 in a three-paragraph
  // doc seeded via setContent (ProseMirror wraps each paragraph with offset 1
  // for the paragraph node itself, so "alpha" occupies positions 1–5 and we use
  // setTextSelection({from:1, to:6}) to be safe).
  await window.evaluate(() => {
    const e = (
      window as unknown as {
        __docEditor?: {
          chain: () => {
            focus: () => {
              setTextSelection: (range: { from: number; to: number }) => {
                run: () => void
              }
            }
          }
        }
      }
    ).__docEditor
    e?.chain().focus().setTextSelection({ from: 1, to: 6 }).run()
  })
  await window.waitForTimeout(200)
}

/**
 * Apply bold to the current selection via the editor debug handle (avoids
 * relying on the bubble-menu bold button, which collapses selection on some
 * Electron builds).
 */
async function setBoldOnSelection(window: Page): Promise<void> {
  await window.evaluate(() => {
    const e = (
      window as unknown as {
        __docEditor?: {
          chain: () => {
            focus: () => {
              setBold: () => { run: () => void }
            }
          }
        }
      }
    ).__docEditor
    e?.chain().focus().setBold().run()
  })
  await window.waitForTimeout(150)
}

/**
 * Re-select the first paragraph after the bold mark is set so the BubbleMenu
 * fires again (setBold may collapse the selection in some Tiptap versions).
 */
async function reselectFirst(window: Page): Promise<void> {
  await window.evaluate(() => {
    const e = (
      window as unknown as {
        __docEditor?: {
          chain: () => {
            focus: () => {
              setTextSelection: (range: { from: number; to: number }) => {
                run: () => void
              }
            }
          }
        }
      }
    ).__docEditor
    e?.chain().focus().setTextSelection({ from: 1, to: 6 }).run()
  })
  await window.waitForTimeout(300)
}

// ── AA-1: Bold propagates to all paragraphs ───────────────────────────────────

test('AA-1 — apply-across: bold selection propagates to whole document', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    // Seed content and select first paragraph.
    await seedAndSelectFirst(window)

    // Make selection bold via the editor handle.
    await setBoldOnSelection(window)

    // Re-select the now-bold first paragraph so the BubbleMenu fires.
    await reselectFirst(window)

    // Bubble menu must be visible.
    const bubbleMenu = window.locator('[data-testid="doc-bubble-menu"]')
    await expect(bubbleMenu).toBeVisible({ timeout: 5_000 })

    // Click the paint-roller / apply-across button.
    await bubbleMenu.locator('[data-testid="doc-bubble-apply-across"]').click()

    // Confirm dialog must appear.
    const confirmDialog = window.locator('[data-testid="doc-apply-across-confirm"]')
    await expect(confirmDialog).toBeVisible({ timeout: 4_000 })

    // "Bold" chip must be present.
    await expect(confirmDialog.locator('text=Bold')).toBeVisible()

    // Click "Apply to whole document".
    await confirmDialog.locator('[data-testid="doc-apply-across-confirm-btn"]').click()
    await window.waitForTimeout(400)

    // Dialog closes.
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 })

    // Verify that "beta" and "gamma" paragraphs now carry a bold mark.
    // We do this via the editor's JSON output, which is authoritative and
    // doesn't depend on rendering details.
    const json = await window.evaluate(() => {
      const e = (
        window as unknown as {
          __docEditor?: {
            getJSON: () => unknown
          }
        }
      ).__docEditor
      return e?.getJSON()
    })

    const docJson = json as {
      content?: Array<{
        content?: Array<{
          text?: string
          marks?: Array<{ type: string }>
        }>
      }>
    }

    // Helper: find text node for a given paragraph text and check for bold mark.
    function hasBold(text: string): boolean {
      for (const para of docJson?.content ?? []) {
        for (const node of para?.content ?? []) {
          if (node.text?.includes(text)) {
            return (node.marks ?? []).some((m) => m.type === 'bold')
          }
        }
      }
      return false
    }

    expect(hasBold('beta'), 'beta paragraph should now be bold').toBe(true)
    expect(hasBold('gamma'), 'gamma paragraph should now be bold').toBe(true)
  } finally {
    await dispose()
  }
})

// ── AA-2: Undo reverts the propagation ───────────────────────────────────────

test('AA-2 — apply-across: undo reverts bold propagation (best-effort)', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    await seedAndSelectFirst(window)
    await setBoldOnSelection(window)
    await reselectFirst(window)

    const bubbleMenu = window.locator('[data-testid="doc-bubble-menu"]')
    await expect(bubbleMenu).toBeVisible({ timeout: 5_000 })
    await bubbleMenu.locator('[data-testid="doc-bubble-apply-across"]').click()

    const confirmDialog = window.locator('[data-testid="doc-apply-across-confirm"]')
    await expect(confirmDialog).toBeVisible({ timeout: 4_000 })
    await confirmDialog.locator('[data-testid="doc-apply-across-confirm-btn"]').click()
    await window.waitForTimeout(400)

    // Confirm "beta" is bold before undo.
    const jsonBefore = await window.evaluate(() => {
      const e = (
        window as unknown as {
          __docEditor?: { getJSON: () => unknown }
        }
      ).__docEditor
      return e?.getJSON()
    })
    const docBefore = jsonBefore as {
      content?: Array<{
        content?: Array<{ text?: string; marks?: Array<{ type: string }> }>
      }>
    }
    function hasBold(doc: typeof docBefore, text: string): boolean {
      for (const para of doc?.content ?? []) {
        for (const node of para?.content ?? []) {
          if (node.text?.includes(text)) {
            return (node.marks ?? []).some((m) => m.type === 'bold')
          }
        }
      }
      return false
    }
    expect(hasBold(docBefore, 'beta'), 'beta bold before undo').toBe(true)

    // Trigger undo via the editor handle (more reliable than keyboard in Electron).
    await window.evaluate(() => {
      const e = (
        window as unknown as {
          __docEditor?: {
            commands: { undo: () => void }
          }
        }
      ).__docEditor
      e?.commands.undo()
    })
    await window.waitForTimeout(400)

    const jsonAfter = await window.evaluate(() => {
      const e = (
        window as unknown as {
          __docEditor?: { getJSON: () => unknown }
        }
      ).__docEditor
      return e?.getJSON()
    })
    const docAfter = jsonAfter as typeof docBefore

    // After undo, "beta" should no longer be bold (the apply-across is a single
    // undo step in ProseMirror). If the editor merges the bold-first-para step
    // with the apply-across step (two-step undo granularity), "beta" may still
    // lack bold but "alpha" might also lose it — either way, "beta" should not
    // be bold if apply-across was truly reverted.
    const betaBoldAfterUndo = hasBold(docAfter, 'beta')
    expect(betaBoldAfterUndo, 'beta should not be bold after undoing apply-across').toBe(false)
  } finally {
    await dispose()
  }
})

// ── AA-3: Empty-state — no formatting → no apply button ──────────────────────

test('AA-3 — apply-across: plain unformatted selection shows nothing-to-apply message', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    // Type plain text — no marks applied.
    const surface = window.locator('[data-testid="doc-editor-surface"]')
    await surface.click()
    await surface.type('plain unformatted text')
    await window.waitForTimeout(150)

    // Select the text via editor handle.
    await window.evaluate(() => {
      const e = (
        window as unknown as {
          __docEditor?: {
            chain: () => {
              focus: () => {
                selectAll: () => { run: () => void }
              }
            }
          }
        }
      ).__docEditor
      e?.chain().focus().selectAll().run()
    })
    await window.waitForTimeout(300)

    // Bubble menu must be visible.
    const bubbleMenu = window.locator('[data-testid="doc-bubble-menu"]')
    await expect(bubbleMenu).toBeVisible({ timeout: 5_000 })

    // Open the apply-across confirm.
    await bubbleMenu.locator('[data-testid="doc-bubble-apply-across"]').click()

    const confirmDialog = window.locator('[data-testid="doc-apply-across-confirm"]')
    await expect(confirmDialog).toBeVisible({ timeout: 4_000 })

    // The "nothing to apply" message must be visible.
    await expect(
      confirmDialog.locator(
        'text=This selection has no character formatting to apply'
      )
    ).toBeVisible()

    // The confirm button must NOT exist.
    await expect(
      confirmDialog.locator('[data-testid="doc-apply-across-confirm-btn"]')
    ).not.toBeVisible()

    // Cancel closes the dialog.
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 })
  } finally {
    await dispose()
  }
})
