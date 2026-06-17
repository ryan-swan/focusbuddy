/**
 * E2E tests for the named heading-style feature added to DocEditor.
 *
 * DHS-1  When the cursor is in a heading, doc-heading-style-btn appears in the
 *        toolbar; clicking it opens doc-heading-style-panel.
 * DHS-2  Setting a font size applies the new size via injected CSS to ALL
 *        headings of that level in the editor simultaneously.
 * DHS-3  The style persists: after saving and reopening the document the same
 *        CSS is re-applied (headingStyles survives the round-trip).
 * DHS-4  A legacy raw-Tiptap document (body = { type:'doc', ... } with no
 *        headingStyles wrapper) still opens correctly and is editable.
 *
 * IPC stubs are not needed here — only the documents IPC is used, which runs
 * against the in-process SQLite and is always available.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// ── Navigation helpers ────────────────────────────────────────────────────────

async function openDocumentsHub(window: Page): Promise<void> {
  await window.getByRole('button', { name: /^Documents$/i }).click()
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

/** Use the block-type select to set the current block. */
async function setBlockType(window: Page, value: string): Promise<void> {
  await window.locator('select[title="Block type"]').selectOption(value)
  await window.waitForTimeout(200)
}

/** Select all text via the __docEditor handle (ProseMirror-level, reliable). */
async function selectAll(window: Page): Promise<void> {
  await window.evaluate(() => {
    const e = (window as unknown as { __docEditor?: { chain: () => { focus: () => { selectAll: () => { run: () => void } } } } }).__docEditor
    e?.chain().focus().selectAll().run()
  })
  await window.waitForTimeout(250)
}

// ── DHS-1: Heading-style button appears when cursor is in a heading ───────────

test('DHS-1 — cursor in heading shows doc-heading-style-btn; click opens panel', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    const surface = window.locator('[data-testid="doc-editor-surface"]')

    // Type some text then make it a Heading 2.
    await surface.click()
    await surface.type('Test heading style button')
    // Select all text and convert to H2.
    await selectAll(window)
    await setBlockType(window, 'h2')

    // After setBlock the selection is still active; click into the H2 text to
    // move the cursor (caret) inside the heading so editor.isActive('heading')
    // returns true and the heading-style button appears in the toolbar.
    await surface.locator('h2').first().click()
    await window.waitForTimeout(300)

    // The heading-style button should now be visible in the toolbar.
    await expect(window.locator('[data-testid="doc-heading-style-btn"]')).toBeVisible({
      timeout: 3_000
    })

    // Clicking it opens the panel.
    await window.locator('[data-testid="doc-heading-style-btn"]').click()
    await expect(window.locator('[data-testid="doc-heading-style-panel"]')).toBeVisible({
      timeout: 3_000
    })

    // The panel shows the heading level label.
    await expect(window.locator('[data-testid="doc-heading-style-panel"]')).toContainText('Heading 2')

    // Close by pressing Escape (the panel's own mousedown-outside handler).
    // Click elsewhere to dismiss.
    await surface.click({ position: { x: 5, y: 5 } })
    await window.waitForTimeout(200)
    await expect(window.locator('[data-testid="doc-heading-style-panel"]')).not.toBeVisible({
      timeout: 2_000
    })

    // When cursor is in a paragraph, the button is gone.
    // Convert back to paragraph and click somewhere in the surface (not in a heading).
    await setBlockType(window, 'p')
    // Click the surface to ensure the cursor is in the paragraph node.
    await surface.click()
    await window.waitForTimeout(200)
    await expect(window.locator('[data-testid="doc-heading-style-btn"]')).not.toBeVisible({
      timeout: 2_000
    })
  } finally {
    await dispose()
  }
})

// ── DHS-2: Setting size updates ALL headings of that level via CSS ────────────

test('DHS-2 — set H2 size to 40px; all H2 elements render at 40px; H1 unaffected', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    const surface = window.locator('[data-testid="doc-editor-surface"]')

    // Create: Heading 2 line A, paragraph, Heading 2 line B, Heading 1 line C.
    await surface.click()
    await surface.type('H2 Line A')
    await setBlockType(window, 'h2')

    await window.keyboard.press('Enter')
    await surface.type('paragraph text')
    await setBlockType(window, 'p')

    await window.keyboard.press('Enter')
    await surface.type('H2 Line B')
    await setBlockType(window, 'h2')

    await window.keyboard.press('Enter')
    await surface.type('H1 Line C')
    await setBlockType(window, 'h1')

    // Put cursor back in "H2 Line A" — click the first h2.
    await surface.locator('h2').first().click()
    await window.waitForTimeout(200)

    // Heading-style button should appear.
    await expect(window.locator('[data-testid="doc-heading-style-btn"]')).toBeVisible({
      timeout: 3_000
    })
    await window.locator('[data-testid="doc-heading-style-btn"]').click()
    await expect(window.locator('[data-testid="doc-heading-style-panel"]')).toBeVisible({
      timeout: 3_000
    })

    // Set font size to 40 in the Size (px) input.
    const panel = window.locator('[data-testid="doc-heading-style-panel"]')
    const sizeInput = panel.locator('input[type="number"]')
    await sizeInput.fill('40')
    // Trigger onChange by tabbing away (the input uses onChange, no submit button).
    await sizeInput.press('Tab')
    await window.waitForTimeout(400)

    // Both H2 elements should now render at 40px (injected CSS).
    const h2s = surface.locator('h2')
    const count = await h2s.count()
    expect(count, 'should have 2 H2 elements').toBeGreaterThanOrEqual(2)

    for (let i = 0; i < count; i++) {
      const fs = await h2s.nth(i).evaluate((el) => window.getComputedStyle(el).fontSize)
      expect(fs, `H2[${i}] font-size must be 40px`).toBe('40px')
    }

    // H1 should NOT be affected.
    const h1 = surface.locator('h1').first()
    if (await h1.isVisible()) {
      const h1fs = await h1.evaluate((el) => window.getComputedStyle(el).fontSize)
      expect(h1fs, 'H1 font-size must not be 40px').not.toBe('40px')
    }
  } finally {
    await dispose()
  }
})

// ── DHS-3: Heading styles persist across save/reload ─────────────────────────

test('DHS-3 — headingStyles survive autosave and re-open; H2 renders at 36px on reopen', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankDoc(window)

    const surface = window.locator('[data-testid="doc-editor-surface"]')

    // Create a Heading 2 and set its size to 36.
    await surface.click()
    await surface.type('Persisted heading')
    await setBlockType(window, 'h2')
    await window.waitForTimeout(200)

    // Open the heading style panel and set size.
    await expect(window.locator('[data-testid="doc-heading-style-btn"]')).toBeVisible({
      timeout: 3_000
    })
    await window.locator('[data-testid="doc-heading-style-btn"]').click()
    const panel = window.locator('[data-testid="doc-heading-style-panel"]')
    await expect(panel).toBeVisible({ timeout: 3_000 })

    const sizeInput = panel.locator('input[type="number"]')
    await sizeInput.fill('36')
    await sizeInput.press('Tab')
    await window.waitForTimeout(400)

    // Verify the CSS applied now.
    const h2Before = surface.locator('h2').first()
    const fsBefore = await h2Before.evaluate((el) => window.getComputedStyle(el).fontSize)
    expect(fsBefore, 'H2 renders at 36px before reload').toBe('36px')

    // Wait for autosave debounce.
    await window.waitForTimeout(1_500)

    // Verify headingStyles is in the persisted body.
    const stored = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      return doc?.body
    }) as { headingStyles?: Record<number, { fontSize?: number }>; doc?: unknown }

    expect(stored.headingStyles, 'body.headingStyles must be present').toBeTruthy()
    expect(stored.headingStyles?.[2]?.fontSize, 'headingStyles[2].fontSize must be 36').toBe(36)

    // Navigate away and back to re-open.
    await window.locator('button[title="Back to Documents"]').click()
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({
      timeout: 5_000
    })
    await window.locator('text=Untitled document').first().click()

    const reloadedSurface = window.locator('[data-testid="doc-editor-surface"]')
    await expect(reloadedSurface).toBeVisible({ timeout: 8_000 })
    await expect(reloadedSurface).toContainText('Persisted heading', { timeout: 5_000 })

    // The H2 on reopen must still be 36px (injected CSS from reloaded headingStyles).
    const h2After = reloadedSurface.locator('h2').first()
    await expect(h2After).toBeVisible({ timeout: 5_000 })
    const fsAfter = await h2After.evaluate((el) => window.getComputedStyle(el).fontSize)
    expect(fsAfter, 'H2 must still be 36px after reload').toBe('36px')
  } finally {
    await dispose()
  }
})

// ── DHS-4: Legacy raw-Tiptap body still opens and is editable ────────────────

test('DHS-4 — legacy raw-tiptap body (no headingStyles wrapper) opens and is editable', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    // Create a document with a legacy body directly via the API.
    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'doc',
        title: 'Legacy raw body',
        body: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Old style heading' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Legacy paragraph here' }] }
          ]
        }
      })
    })

    // Reload so the Recent list refreshes.
    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)

    await expect(window.locator('text=Legacy raw body').first()).toBeVisible({ timeout: 5_000 })
    await window.locator('text=Legacy raw body').first().click()

    const surface = window.locator('[data-testid="doc-editor-surface"]')
    await expect(surface).toBeVisible({ timeout: 8_000 })
    await expect(surface).toContainText('Old style heading', { timeout: 5_000 })
    await expect(surface).toContainText('Legacy paragraph here')

    // Still editable — append text.
    await surface.click()
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await surface.type('Appended to legacy doc')
    await expect(surface).toContainText('Appended to legacy doc')
  } finally {
    await dispose()
  }
})
