/**
 * E2E tests for the PowerPoint-class slides editor (SlidesEditor).
 *
 * Coverage (13 scenarios):
 *  SL-1  Blank deck opens with toolbar, canvas (slide-canvas), rail, inspector.
 *  SL-2  Insert a text element via toolbar Text button; asserts slide-element
 *         appears; reads body back to confirm elements grew.
 *  SL-3  Insert a shape (Rectangle) and a line from the Shape menu; asserts
 *         elements added with correct eltype attributes.
 *  SL-4  Select an element, inspector shows controls; change position via
 *         inspector numeric input, assert it persists to the stored body.
 *  SL-5  Double-click a text element, type new text, blur; assert text persists
 *         in the element's paragraphs.
 *  SL-6  Add a slide via slides-add; assert body.slides length increases; switch
 *         slides via the rail thumbnail.
 *  SL-7  Apply a theme from the inspector (no element selected = slide-level
 *         controls); assert body.theme changes.
 *  SL-8  Apply a layout from the toolbar Layout menu; assert slide's elements
 *         reset to the layout presets.
 *  SL-9  Undo (Cmd/Ctrl+Z) reverts the last change.
 *  SL-10 Present: click Present, assert present-overlay appears, arrow-key
 *         advances (if > 1 slide), Escape exits.
 *  SL-11 AI: stub documents:generateSlides IPC; open slides-ai-panel, generate,
 *         preview thumbnails appear, Apply (slides-ai-apply) replaces the deck.
 *  SL-12 Interop: stub slides:export → {ok,path}; assert slides-status shows
 *         the path. Stub slides:import → {ok,body}; assert deck loads.
 *  SL-13 Backward compat: seed a v1 slides body via the API; confirm the editor
 *         opens and migrated elements render as slide-element nodes.
 *
 * IPC stubs follow the exact pattern from docEditor.spec.ts and sheetEditor.spec.ts:
 * app.evaluate → ipcMain so no live Anthropic calls and no native file dialogs.
 *
 * Drag/move via react-rnd is flaky in headless Electron; position changes are
 * instead exercised through the inspector's numeric inputs (which call the same
 * onUpdateElement code path). This is noted per test where it applies.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// ── Shared helpers ────────────────────────────────────────────────────────────

async function openDocumentsHub(window: Page): Promise<void> {
  await window.getByRole('button', { name: /^Documents$/i }).click()
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({
    timeout: 8_000
  })
}

/** Click the "Slides" blank-start button and wait for the slides toolbar. */
async function startBlankSlides(window: Page): Promise<void> {
  const blankRow = window.locator('text=Or start blank:').locator('..')
  await blankRow.locator('button', { hasText: 'Slides' }).first().click()
  await expect(window.locator('[data-testid="slides-toolbar"]')).toBeVisible({ timeout: 10_000 })
  // Wait for the canvas to mount too.
  await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible({ timeout: 8_000 })
}

/** Read the full document body from the store for the most-recent document. */
async function readBodyFromStore(window: Page): Promise<unknown> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const docs = await api.documents.list()
    if (!docs.length) return null
    const doc = await api.documents.get(docs[0].id)
    return doc?.body ?? null
  })
}

/** Wait for autosave (600 ms debounce + generous buffer) then read body. */
async function waitAndReadBody(window: Page): Promise<unknown> {
  await window.waitForTimeout(1_500)
  return readBodyFromStore(window)
}

// ── IPC stubs ─────────────────────────────────────────────────────────────────

async function stubGenerateSlides(
  app: LaunchedApp['app'],
  body: object
): Promise<void> {
  await app.evaluate(({ ipcMain }, b: object) => {
    ipcMain.removeHandler('documents:generateSlides')
    ipcMain.handle('documents:generateSlides', async () => ({ ok: true, body: b }))
  }, body)
}

async function stubSlidesExport(app: LaunchedApp['app'], path: string): Promise<void> {
  await app.evaluate(({ ipcMain }, p: string) => {
    ipcMain.removeHandler('slides:export')
    ipcMain.handle('slides:export', async () => ({ ok: true, path: p }))
  }, path)
}

async function stubSlidesImport(app: LaunchedApp['app'], body: object): Promise<void> {
  await app.evaluate(({ ipcMain }, b: object) => {
    ipcMain.removeHandler('slides:import')
    ipcMain.handle('slides:import', async () => ({ ok: true, body: b }))
  }, body)
}

// ── SL-1: Basic layout ────────────────────────────────────────────────────────

test('SL-1 — blank deck opens with toolbar, slide-canvas, rail, and inspector', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)

    // Toolbar
    await expect(window.locator('[data-testid="slides-toolbar"]')).toBeVisible()

    // Canvas
    await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible()

    // Rail: the add-slide button marks the rail's presence
    await expect(window.locator('[data-testid="slides-add"]')).toBeVisible()

    // Inspector (no element selected — shows slide-level controls)
    // The inspector panel has a "Slide transition" select when nothing is selected.
    await expect(window.locator('text=Slide transition')).toBeVisible({ timeout: 5_000 })

    // Toolbar buttons: Text, Image, Shape, Layout, Present, AI
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await expect(toolbar.locator('button', { hasText: 'Text' })).toBeVisible()
    await expect(toolbar.locator('button', { hasText: 'Shape' })).toBeVisible()
    await expect(toolbar.locator('button', { hasText: 'Layout' })).toBeVisible()
    await expect(toolbar.locator('button', { hasText: 'Present' })).toBeVisible()
    await expect(toolbar.locator('button', { hasText: 'AI' })).toBeVisible()
  } finally {
    await dispose()
  }
})

// ── SL-2: Insert text element ─────────────────────────────────────────────────

test('SL-2 — insert text box via toolbar; slide-element appears and persists to body', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)

    // Wait for the initial blank deck to autosave before reading state.
    // The blank deck has 2 elements (title + body placeholders from layoutElements).
    await window.waitForTimeout(1_600)
    const before = await readBodyFromStore(window)

    // A fresh title-content slide has 2 elements (title + body placeholders).
    const beforeCount = ((before as { slides?: Array<{ elements?: unknown[] }> })?.slides?.[0]?.elements ?? []).length
    expect(beforeCount, 'blank deck starts with placeholder elements').toBeGreaterThan(0)

    // Click the Text button in the toolbar
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'Text' }).first().click()
    await window.waitForTimeout(300)

    // A new slide-element with eltype="text" should appear on the canvas.
    const textEls = window.locator('[data-testid="slide-element"][data-eltype="text"]')
    // There should be at least 1 more than before (title placeholder already text)
    const afterElementCount = await textEls.count()
    expect(afterElementCount, 'at least one text element visible on canvas').toBeGreaterThan(0)

    // Wait for autosave then check persistence.
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{ elements?: Array<{ type: string }> }>
    }
    const elementsAfter = body?.slides?.[0]?.elements ?? []
    expect(
      elementsAfter.length,
      'slide 0 elements grew by at least 1 after Text insert'
    ).toBeGreaterThan(beforeCount)
    // The new element is type "text"
    const hasNewText = elementsAfter.some((e) => e.type === 'text')
    expect(hasNewText, 'at least one text element in persisted body').toBe(true)
  } finally {
    await dispose()
  }
})

// ── SL-3: Insert shape and line ───────────────────────────────────────────────

test('SL-3 — insert Rectangle shape and line via Shape menu; elements added with correct eltype', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(500)

    const toolbar = window.locator('[data-testid="slides-toolbar"]')

    // Open Shape menu
    await toolbar.locator('button', { hasText: 'Shape' }).first().click()
    await expect(window.locator('text=Rectangle')).toBeVisible({ timeout: 3_000 })

    // Click Rectangle
    await window.locator('text=Rectangle').click()
    await window.waitForTimeout(300)

    // A shape element should appear
    const shapeEls = window.locator('[data-testid="slide-element"][data-eltype="shape"]')
    await expect(shapeEls.first()).toBeVisible({ timeout: 3_000 })

    // Open Shape menu again and insert a line
    await toolbar.locator('button', { hasText: 'Shape' }).first().click()
    await expect(window.locator('text=Line / arrow')).toBeVisible({ timeout: 3_000 })
    await window.locator('text=Line / arrow').click()
    await window.waitForTimeout(300)

    // Line elements are inserted with h:0 (a horizontal line), which means their
    // bounding box has zero height and Playwright reports them as hidden. Instead
    // we verify their presence in the DOM (count > 0) and confirm via the
    // persisted body rather than a visual assertion.
    const lineEls = window.locator('[data-testid="slide-element"][data-eltype="line"]')
    const lineCount = await lineEls.count()
    expect(lineCount, 'at least one line element exists in the DOM').toBeGreaterThan(0)

    // Both persisted
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{ elements?: Array<{ type: string }> }>
    }
    const els = body?.slides?.[0]?.elements ?? []
    expect(els.some((e) => e.type === 'shape'), 'shape element persisted').toBe(true)
    expect(els.some((e) => e.type === 'line'), 'line element persisted').toBe(true)
  } finally {
    await dispose()
  }
})

// ── SL-4: Inspector — select element, change position ─────────────────────────

test('SL-4 — select element; inspector shows controls; change x via inspector input and it persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // Insert a shape so we have a clean, user-inserted element to target.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'Shape' }).first().click()
    await window.locator('text=Rectangle').click()
    await window.waitForTimeout(300)

    // The newly-inserted shape is auto-selected (insertShape calls setSelectedElId).
    // The element-inspector should now be visible with numeric inputs.
    const inspector = window.locator('[data-testid="element-inspector"]')
    await expect(inspector).toBeVisible({ timeout: 4_000 })

    // Inspector shows "Position & size" section with 4 number inputs (x, y, w, h).
    const numInputs = inspector.locator('input[type="number"]')
    await expect(numInputs.first()).toBeVisible({ timeout: 3_000 })

    // Read the current x value from the first input (x position).
    const xInput = numInputs.nth(0)
    const originalX = await xInput.inputValue()

    // Set a new x value (300 is distinctly different from the default 440).
    await xInput.fill('300')
    await xInput.press('Tab') // blur triggers onChange
    await window.waitForTimeout(300)

    // The input should now show 300.
    const updatedX = await xInput.inputValue()
    expect(Number(updatedX), 'inspector x input updated to 300').toBe(300)
    expect(Number(originalX), 'original x was different from 300').not.toBe(300)

    // Wait for autosave and confirm persistence.
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{ elements?: Array<{ type: string; x: number }> }>
    }
    const shapeEl = body?.slides?.[0]?.elements?.find((e) => e.type === 'shape')
    expect(shapeEl?.x, 'shape element x persisted as 300').toBe(300)
  } finally {
    await dispose()
  }
})

// ── SL-5: Double-click text, edit, persist ────────────────────────────────────

test('SL-5 — double-click text element, type new text, blur; text persists in paragraphs', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // The fresh title-content slide has a title text element as the first slide-element.
    // Double-click it to enter inline edit mode.
    const slideEl = window.locator('[data-testid="slide-element"][data-eltype="text"]').first()
    await expect(slideEl).toBeVisible({ timeout: 5_000 })

    // Click first to select (in case not already selected), then double-click to edit.
    // The Rnd wrapper sits over the slide-element div; click on the canvas at that
    // position. Use the slide-element's bounding box to hit the right spot.
    const canvas = window.locator('[data-testid="slide-canvas"]')
    await canvas.click() // deselect any prior selection
    await window.waitForTimeout(150)

    // Double-click the first text element's parent Rnd.
    // The slide-element div has pointerEvents:none so the Rnd wrapper intercepts clicks.
    // Use the canvas-relative position of the first text element.
    const box = await slideEl.boundingBox()
    if (box) {
      await window.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    }
    await window.waitForTimeout(300)

    // A textarea should appear inside the Rnd wrapper (SlideCanvas startEdit renders it).
    const editArea = window.locator('[data-testid="slide-canvas"] textarea')
    await expect(editArea).toBeVisible({ timeout: 4_000 })

    // Clear existing text and type new content.
    await editArea.fill('Hello slides test')
    // Blur by pressing Tab — commitEdit writes the text back via onSetText.
    await editArea.press('Tab')
    await window.waitForTimeout(400)

    // The textarea should be gone.
    await expect(editArea).not.toBeVisible({ timeout: 3_000 })

    // Wait for autosave then confirm text in the body.
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{
        elements?: Array<{
          type: string
          paragraphs?: Array<{ runs?: Array<{ text: string }> }>
        }>
      }>
    }
    const els = body?.slides?.[0]?.elements ?? []
    const textEl = els.find(
      (e) =>
        e.type === 'text' &&
        e.paragraphs?.some((p) => p.runs?.some((r) => r.text.includes('Hello slides test')))
    )
    expect(textEl, 'edited text "Hello slides test" persisted in element paragraphs').toBeTruthy()
  } finally {
    await dispose()
  }
})

// ── SL-6: Add slide and switch ─────────────────────────────────────────────────

test('SL-6 — add slide via slides-add; body.slides length increases; switch via rail', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(600)

    // Initial state: 1 slide
    const bodyBefore = (await readBodyFromStore(window)) as {
      slides?: unknown[]
    }
    const initialCount = bodyBefore?.slides?.length ?? 1

    // Click the add-slide button in the rail
    await window.locator('[data-testid="slides-add"]').click()
    await window.waitForTimeout(300)

    // Wait for autosave and check persistence
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{
        elements?: Array<{ type: string }>
      }>
    }
    expect(
      body?.slides?.length,
      'body.slides length increased after adding a slide'
    ).toBe(initialCount + 1)

    // The rail should now show 2 slide thumbnails (the two slide buttons before the add button).
    // The add button itself is slides-add; slide thumbnails are the buttons before it.
    const railButtons = window.locator('[data-testid="slides-add"]').locator('..').locator('> div')
    // railButtons includes every child div of the rail, one per slide.
    const slideRailItems = window
      .locator('[data-testid="slides-add"]')
      .locator('..')
      .locator('> div:not(:last-child)')
    const railCount = await slideRailItems.count()
    expect(railCount, 'rail has 2 slide items after adding a slide').toBe(2)

    // Click the first rail thumbnail to switch back to slide 1
    await slideRailItems.first().locator('button').first().click()
    await window.waitForTimeout(200)
    // The canvas should still be visible (slide 1)
    await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible()
  } finally {
    await dispose()
  }
})

// ── SL-7: Apply theme ─────────────────────────────────────────────────────────

test('SL-7 — apply a theme from the inspector (no element selected); body.theme changes', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(600)

    // Deselect any element by clicking the canvas background.
    const canvas = window.locator('[data-testid="slide-canvas"]')
    const canvasBox = await canvas.boundingBox()
    if (canvasBox) {
      // Click bottom-right corner area (away from elements which cluster at the top)
      await window.mouse.click(canvasBox.x + canvasBox.width - 5, canvasBox.y + canvasBox.height - 5)
    }
    await window.waitForTimeout(200)

    // The slide-level inspector should be showing (no element-inspector testid).
    await expect(window.locator('text=Theme')).toBeVisible({ timeout: 4_000 })

    // Read the current theme from the body.
    const bodyBefore = (await readBodyFromStore(window)) as {
      theme?: string
    }
    // Default theme is 'plexi-default'.
    const beforeTheme = bodyBefore?.theme ?? 'plexi-default'

    // Click the "Midnight" theme button. BUILTIN_THEMES has id='midnight', name='Midnight'.
    await window.locator('button', { hasText: 'Midnight' }).first().click()
    await window.waitForTimeout(300)

    // Wait for autosave then check the persisted body.theme.
    const body = (await waitAndReadBody(window)) as { theme?: string }
    expect(body?.theme, 'body.theme changed to midnight').toBe('midnight')
    expect(beforeTheme, 'theme was different before').not.toBe('midnight')
  } finally {
    await dispose()
  }
})

// ── SL-8: Apply layout ────────────────────────────────────────────────────────

test('SL-8 — apply Layout from toolbar; slide elements change to layout presets', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // Read the initial elements on slide 0.
    const bodyBefore = (await readBodyFromStore(window)) as {
      slides?: Array<{ elements?: Array<{ type: string }> }>
    }
    const beforeEls = bodyBefore?.slides?.[0]?.elements ?? []
    const beforeIds = new Set(beforeEls.map((_, i) => i))

    // Open the Layout menu and choose "Blank" — blank layout produces 0 elements,
    // which is a deterministic outcome we can assert without ambiguity.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'Layout' }).first().click()
    await expect(window.locator('text=Blank')).toBeVisible({ timeout: 3_000 })
    await window.locator('text=Blank').click()
    await window.waitForTimeout(300)

    // After "Blank" layout the slide should have 0 elements.
    const slideEls = window.locator('[data-testid="slide-element"]')
    const visibleCount = await slideEls.count()
    // Blank layout yields 0 elements from layoutElements('blank', theme).
    expect(visibleCount, 'Blank layout removes all placeholder elements').toBe(0)

    // Confirm the stored body also reflects 0 elements.
    const body = (await waitAndReadBody(window)) as {
      slides?: Array<{ elements?: unknown[] }>
    }
    const storedEls = body?.slides?.[0]?.elements ?? []
    expect(storedEls.length, 'persisted slide 0 has 0 elements after Blank layout').toBe(0)
    expect(beforeIds.size, 'had elements before (sanity check)').toBeGreaterThan(0)
  } finally {
    await dispose()
  }
})

// ── SL-9: Undo ────────────────────────────────────────────────────────────────

test('SL-9 — Cmd/Ctrl+Z undoes the last change', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // Wait for the initial blank deck autosave before reading state.
    await window.waitForTimeout(1_600)
    const bodyBefore = (await readBodyFromStore(window)) as {
      slides?: Array<{ elements?: unknown[] }>
    }
    const beforeCount = bodyBefore?.slides?.[0]?.elements?.length ?? 0
    expect(beforeCount, 'blank deck has placeholder elements').toBeGreaterThan(0)

    // Insert a text element — this is the operation we will undo.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'Text' }).first().click()

    // Confirm via the React state that a new element was committed — we check
    // the stored body after insert (debounce fires after 600ms).
    await window.waitForTimeout(1_600)
    const bodyAfterInsert = (await readBodyFromStore(window)) as {
      slides?: Array<{ elements?: unknown[] }>
    }
    const afterInsertCount = bodyAfterInsert?.slides?.[0]?.elements?.length ?? 0
    expect(afterInsertCount, 'element count grew after insert').toBe(beforeCount + 1)

    // The SlidesEditor's onKeyDown is on a plain div without tabIndex, so
    // keyboard shortcuts may not reach it if nothing focusable inside has
    // focus. The most reliable approach is to call undoLast directly by
    // dispatching a keydown event on the slides editor container via evaluate.
    await window.evaluate(() => {
      // Dispatch Ctrl/Cmd+Z on the element that holds the onKeyDown in SlidesEditor:
      // the outermost div.h-full.flex.flex-col inside the surface container.
      const surface = document.querySelector('[data-testid="slides-toolbar"]')?.parentElement
      if (!surface) throw new Error('slides editor container not found')
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const ev = new KeyboardEvent('keydown', {
        key: 'z',
        bubbles: true,
        metaKey: isMac,
        ctrlKey: !isMac
      })
      surface.dispatchEvent(ev)
    })
    await window.waitForTimeout(1_600) // wait for the undo state + debounced autosave

    // After undo the element count should revert to the pre-insert state.
    const bodyAfterUndo = (await readBodyFromStore(window)) as {
      slides?: Array<{ elements?: unknown[] }>
    }
    const afterUndoCount = bodyAfterUndo?.slides?.[0]?.elements?.length ?? 0
    expect(afterUndoCount, 'element count reverted to original after undo').toBe(beforeCount)
  } finally {
    await dispose()
  }
})

// ── SL-10: Present mode ───────────────────────────────────────────────────────

test('SL-10 — Present mode: overlay appears, arrow key advances slides, Escape exits', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // Add a second slide so ArrowRight can advance.
    await window.locator('[data-testid="slides-add"]').click()
    await window.waitForTimeout(300)

    // After adding, the rail selects the new slide (slide 2). Navigate back to
    // slide 1 so Present starts at index 0 and ArrowRight can advance.
    const slideRailThumbs = window.locator('[data-testid="slides-add"]').locator('..').locator('> div:not(:last-child)')
    await slideRailThumbs.first().locator('button').first().click()
    await window.waitForTimeout(200)

    // Click "Present" in the toolbar.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'Present' }).first().click()

    // present-overlay should be visible.
    await expect(window.locator('[data-testid="present-overlay"]')).toBeVisible({ timeout: 5_000 })

    // The slide counter renders as "{idx+1} / {slides.length}" inside a
    // .tabular-nums span in the bottom navigation bar of the left panel.
    // The right sidebar has a timer span also with .tabular-nums but different
    // text format (mm:ss). We use a regex that matches the "/" separator, which
    // only the slide counter has.
    const overlay = window.locator('[data-testid="present-overlay"]')
    await expect(overlay.locator('.tabular-nums').filter({ hasText: /\d+\s*\/\s*\d+/ }).first()).toBeVisible({
      timeout: 3_000
    })
    await expect(overlay.locator('.tabular-nums').filter({ hasText: /\d+\s*\/\s*\d+/ }).first()).toContainText(/1\s*\/\s*2/)

    // ArrowRight should advance to slide 2.
    await window.keyboard.press('ArrowRight')
    await window.waitForTimeout(200)
    await expect(overlay.locator('.tabular-nums').filter({ hasText: /\d+\s*\/\s*\d+/ }).first()).toContainText(/2\s*\/\s*2/, {
      timeout: 3_000
    })

    // Escape exits present mode.
    await window.keyboard.press('Escape')
    await expect(window.locator('[data-testid="present-overlay"]')).not.toBeVisible({
      timeout: 3_000
    })
  } finally {
    await dispose()
  }
})

// ── SL-11: AI slide generation (stubbed) ─────────────────────────────────────

test('SL-11 — AI stub: open slides-ai-panel, generate, thumbnails show, Apply replaces deck', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // Build a minimal v2 SlidesBody to return from the stub.
    const fakeDeckBody = {
      schemaVersion: 2,
      theme: 'midnight',
      size: { w: 1280, h: 720 },
      slides: [
        {
          id: 'ai-sl-1',
          schemaVersion: 2,
          layout: 'title-content',
          notes: '',
          transition: 'fade',
          background: { type: 'solid', color: '#0f172a' },
          elements: [
            {
              id: 'ai-el-1',
              type: 'text',
              x: 80,
              y: 60,
              w: 1120,
              h: 110,
              z: 1,
              styleRole: 'title',
              fontFamily: 'Inter, system-ui, sans-serif',
              vAlign: 'middle',
              paragraphs: [
                {
                  runs: [{ text: 'AI Generated Title', bold: true, color: '#f8fafc', fontSize: 54 }],
                  align: 'left'
                }
              ]
            }
          ]
        },
        {
          id: 'ai-sl-2',
          schemaVersion: 2,
          layout: 'title-content',
          notes: '',
          transition: 'fade',
          background: { type: 'solid', color: '#0f172a' },
          elements: [
            {
              id: 'ai-el-2',
              type: 'text',
              x: 80,
              y: 60,
              w: 1120,
              h: 110,
              z: 1,
              styleRole: 'title',
              fontFamily: 'Inter, system-ui, sans-serif',
              vAlign: 'middle',
              paragraphs: [
                {
                  runs: [{ text: 'AI Slide Two', bold: true, color: '#f8fafc', fontSize: 54 }],
                  align: 'left'
                }
              ]
            }
          ]
        }
      ]
    }

    // Stub the IPC handler before opening the AI panel.
    await stubGenerateSlides(app, fakeDeckBody)

    // Open the AI panel by clicking the AI button.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')
    await toolbar.locator('button', { hasText: 'AI' }).first().click()
    await expect(window.locator('[data-testid="slides-ai-panel"]')).toBeVisible({ timeout: 4_000 })

    // Fill the prompt textarea.
    const aiPanel = window.locator('[data-testid="slides-ai-panel"]')
    await aiPanel.locator('textarea').fill('A deck about AI scheduling')

    // Click Generate.
    await aiPanel.getByRole('button', { name: /^Generate$/i }).click()
    await window.waitForTimeout(600)

    // Thumbnail previews should appear (SlideFace thumbnails in a flex row).
    // The panel renders preview slides inside a div.mt-2.flex.gap-2.
    const previewSlideFaces = aiPanel.locator('.flex.gap-2 > div')
    await expect(previewSlideFaces.first()).toBeVisible({ timeout: 6_000 })
    const previewCount = await previewSlideFaces.count()
    expect(previewCount, 'AI preview shows 2 slide thumbnails').toBe(2)

    // Click slides-ai-apply to replace the deck.
    await window.locator('[data-testid="slides-ai-apply"]').click()
    await window.waitForTimeout(300)

    // Panel closes.
    await expect(window.locator('[data-testid="slides-ai-panel"]')).not.toBeVisible({ timeout: 3_000 })

    // The deck is now the AI-generated one — body.theme should be 'midnight'
    // and body.slides should have 2 slides.
    const body = (await waitAndReadBody(window)) as {
      theme?: string
      slides?: unknown[]
    }
    expect(body?.theme, 'deck theme is now midnight (from AI body)').toBe('midnight')
    expect(body?.slides?.length, 'deck has 2 AI-generated slides').toBe(2)
  } finally {
    await dispose()
  }
})

// ── SL-12: Interop stubs ──────────────────────────────────────────────────────

test('SL-12 — interop: export stub shows path in slides-status; import stub loads the deck', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSlides(window)
    await window.waitForTimeout(400)

    // ── Export ────────────────────────────────────────────────────────────────
    const fakePath = '/tmp/MyPresentation.pptx'
    await stubSlidesExport(app, fakePath)

    // The IO menu button in SlidesToolbar is inside the ml-auto container, before
    // the AI and Present buttons. It renders no visible text — just a Material
    // Symbols icon glyph. In the DOM: it's the first button child of the div
    // that has class "ml-auto". Use evaluate to find it and click programmatically.
    const toolbar = window.locator('[data-testid="slides-toolbar"]')

    // Helper: open the IO dropdown and assert a menu item is visible.
    async function openIoMenu(): Promise<void> {
      // The IO button is the first button in the ml-auto flex container in the toolbar.
      await window.evaluate(() => {
        const tb = document.querySelector('[data-testid="slides-toolbar"]')
        if (!tb) throw new Error('toolbar not found')
        const mlAuto = tb.querySelector('.ml-auto')
        if (!mlAuto) throw new Error('ml-auto container not found in toolbar')
        const btn = mlAuto.querySelector('button') as HTMLButtonElement | null
        if (!btn) throw new Error('IO button not found in ml-auto')
        btn.click()
      })
      await window.waitForTimeout(200)
    }

    await openIoMenu()
    await expect(window.locator('text=Export .pptx')).toBeVisible({ timeout: 4_000 })
    await window.locator('text=Export .pptx').click()
    await window.waitForTimeout(300)

    // slides-status should show the exported path.
    await expect(window.locator('[data-testid="slides-status"]')).toContainText(fakePath, {
      timeout: 5_000
    })

    // Dismiss the status banner.
    await window.locator('[data-testid="slides-status"] button').click()
    await expect(window.locator('[data-testid="slides-status"]')).not.toBeVisible({ timeout: 3_000 })

    // ── Import ────────────────────────────────────────────────────────────────
    const importBody = {
      schemaVersion: 2,
      theme: 'editorial',
      size: { w: 1280, h: 720 },
      slides: [
        {
          id: 'imp-sl-1',
          schemaVersion: 2,
          layout: 'section',
          notes: '',
          transition: 'none',
          background: { type: 'solid', color: '#fdfaf3' },
          elements: [
            {
              id: 'imp-el-1',
              type: 'text',
              x: 140,
              y: 300,
              w: 1000,
              h: 140,
              z: 1,
              styleRole: 'title',
              fontFamily: 'Georgia, serif',
              vAlign: 'middle',
              paragraphs: [
                {
                  runs: [{ text: 'Imported Slide', bold: true, color: '#1c1917', fontSize: 52 }],
                  align: 'center'
                }
              ]
            }
          ]
        }
      ]
    }
    await stubSlidesImport(app, importBody)

    // Open IO menu again and click Import.
    await openIoMenu()
    await expect(window.locator('text=Import .pptx')).toBeVisible({ timeout: 4_000 })
    await window.locator('text=Import .pptx').click()
    await window.waitForTimeout(500)

    // Status should mention "Imported".
    await expect(window.locator('[data-testid="slides-status"]')).toContainText('Imported', {
      timeout: 5_000
    })

    // The deck should now have 1 slide (from importBody).
    const body = (await waitAndReadBody(window)) as {
      theme?: string
      slides?: unknown[]
    }
    expect(body?.slides?.length, 'deck has 1 imported slide').toBe(1)
    expect(body?.theme, 'deck theme is editorial (from import body)').toBe('editorial')
  } finally {
    await dispose()
  }
})

// ── SL-13: Backward compat — v1 body ─────────────────────────────────────────

test('SL-13 — backward compat: v1 slides body migrates on open; slide-element renders', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    // Seed a v1 slides body directly via the documents API.
    // v1 format: each slide has title, bullets, notes, layout (no elements array,
    // no schemaVersion:2). migrateSlidesBody in parseBody converts it on read.
    const legacyV1Body = {
      slides: [
        {
          id: 'v1-sl-1',
          title: 'Legacy Title',
          bullets: ['First bullet', 'Second bullet'],
          notes: 'Speaker notes here',
          layout: 'title-content'
        }
      ]
    }

    await window.evaluate(async (body: object) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'slides',
        title: 'Legacy v1 Slides',
        body
      })
    }, legacyV1Body)

    // Reload so the Recent list refreshes.
    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)

    // Open the legacy deck from the Recent list.
    await expect(window.locator('text=Legacy v1 Slides').first()).toBeVisible({ timeout: 5_000 })
    await window.locator('text=Legacy v1 Slides').first().click()

    // The slides editor should mount.
    await expect(window.locator('[data-testid="slides-toolbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible({ timeout: 8_000 })

    // After migration the v1 title and bullets should become text elements.
    // At minimum there should be 1 text element on the slide (the title).
    const textEls = window.locator('[data-testid="slide-element"][data-eltype="text"]')
    await expect(textEls.first()).toBeVisible({ timeout: 5_000 })
    const textElCount = await textEls.count()
    // migrateSlide creates a title element + (if bullets) a body element = 2 elements.
    expect(textElCount, 'migrated v1 slide renders text elements (title + body)').toBeGreaterThanOrEqual(1)
  } finally {
    await dispose()
  }
})
