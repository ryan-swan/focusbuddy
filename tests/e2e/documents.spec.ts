/**
 * E2E tests for the Documents feature (doc / sheet / slides).
 *
 * Covers:
 *  1. App boots without console errors
 *  2. Sidebar "Documents" entry exists and opens the hub
 *  3. Hub shows Create-with-AI panel, three type chips, and "Or start blank"
 *  4. Start blank → Document: edit, back, confirm in Recent, re-open persisted
 *  5. Start blank → Spreadsheet: formula eval (SUM, multiply, #ERR)
 *  6. Start blank → Slides: rail, add slide, Present mode, keyboard nav + Esc
 *  7. Navigate away (Home/Calendar) and back — no errors, Recent intact
 *  8. No regressions: existing nav items still work
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openDocumentsHub(window: import('@playwright/test').Page): Promise<void> {
  await window.getByRole('button', { name: /^Documents$/i }).click()
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

/**
 * Click the blank-start button for a given type.
 * The "Or start blank:" span and its sibling buttons live inside a flex row.
 * We locate the span, step up to its parent <div>, then pick the right button.
 */
async function clickStartBlank(
  window: import('@playwright/test').Page,
  type: 'Document' | 'Spreadsheet' | 'Slides'
): Promise<void> {
  // The "Or start blank:" text is a <span> whose parent div contains the three type buttons.
  const blankRowContainer = window.locator('text=Or start blank:').locator('..')
  await blankRowContainer.locator('button', { hasText: type }).first().click()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('Step 1-3 — app boots clean, sidebar entry, hub renders Create-with-AI + chips + start-blank', async () => {
  const { window, dispose } = await launchApp()
  const consoleErrors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  try {
    await waitForReady(window)

    // Step 2: sidebar entry exists
    const docBtn = window.getByRole('button', { name: /^Documents$/i })
    await expect(docBtn).toBeVisible()

    // Open the hub
    await docBtn.click()
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })

    // Step 3: Create-with-AI panel
    await expect(window.getByPlaceholder(/Describe the/i)).toBeVisible()
    await expect(window.getByRole('button', { name: /Create with AI/i })).toBeVisible()

    // Three type chips (their button texts contain icon glyph text + label + blurb text —
    // confirmed from DOM probe: "descriptionDocumentWriteups, briefs, proposals").
    // Match by partial label presence.
    await expect(window.locator('button', { hasText: /Writeups, briefs/i }).first()).toBeVisible()
    await expect(window.locator('button', { hasText: /Plans, budgets/i }).first()).toBeVisible()
    await expect(window.locator('button', { hasText: /Decks and presentations/i }).first()).toBeVisible()

    // "Or start blank:" label
    await expect(window.locator('text=Or start blank:')).toBeVisible()

    // Step 1: no real console errors
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('WebSocket')
    )
    expect(realErrors, `Unexpected console errors: ${realErrors.join('\n')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('Step 4 — blank Document: edit text, back to hub, Recent shows it, re-open persists text', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await clickStartBlank(window, 'Document')

    // Should be in the doc editor — back button + "Document" label in header
    await expect(window.locator('button[title="Back to Documents"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('span', { hasText: 'Document' }).last()).toBeVisible()

    // TipTap renders a contenteditable div
    const editor = window.locator('[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible', timeout: 5_000 })
    await editor.click()
    await editor.type('Hello autosave world')
    await expect(editor).toContainText('Hello autosave world')

    // Wait for autosave debounce (600 ms) + buffer
    await window.waitForTimeout(1_200)

    // Back to hub
    await window.locator('button[title="Back to Documents"]').click()
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 5_000 })

    // Recent list must contain "Untitled document"
    await expect(window.locator('text=Untitled document').first()).toBeVisible({ timeout: 5_000 })

    // Re-open it by clicking the recent card
    await window.locator('text=Untitled document').first().click()
    const editorAfter = window.locator('[contenteditable="true"]').first()
    await editorAfter.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(editorAfter).toContainText('Hello autosave world', { timeout: 5_000 })
  } finally {
    await dispose()
  }
})

test('Step 5 — blank Spreadsheet: SUM formula, multiply, #ERR for broken formula', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await clickStartBlank(window, 'Spreadsheet')

    // Formula bar confirms we're in the sheet editor
    await expect(window.locator('input[placeholder*="Select a cell"]')).toBeVisible({ timeout: 5_000 })

    // Cell accessor: rows are table tbody tr (8 default rows), tds: [0]=row-num, [1]=A, [2]=B, [3]=C, [4]=spacer
    function cell(r: number, col: 'A' | 'B' | 'C'): import('@playwright/test').Locator {
      const colIdx = { A: 1, B: 2, C: 3 }[col]
      return window.locator('table tbody tr').nth(r).locator('td').nth(colIdx).locator('input')
    }

    // Fill A1 = 10: click, fill value, then click another cell to blur (avoids Tab navigation side-effects)
    await cell(0, 'A').click()
    await cell(0, 'A').fill('10')
    // Click A2 to blur A1 first
    await cell(1, 'A').click()
    await window.waitForTimeout(100)

    // Fill A2 = 20: already focused, fill then blur to A3
    await cell(1, 'A').fill('20')
    await cell(2, 'A').click()
    await window.waitForTimeout(100)

    // Fill A3 = =SUM(A1:A2) then blur to A1 so displayCell is called
    await cell(2, 'A').fill('=SUM(A1:A2)')
    await cell(0, 'A').click() // blur A3 → triggers displayCell → shows 30
    await window.waitForTimeout(200)

    // A3 when not focused should display evaluated value 30 (10+20=30)
    const a3Value = await cell(2, 'A').inputValue()
    expect(a3Value, `A3 =SUM(A1:A2): expected "30", got "${a3Value}"`).toBe('30')

    // B1 = =A1*3 → should display 30
    await cell(0, 'B').click()
    await cell(0, 'B').fill('=A1*3')
    await cell(0, 'A').click() // blur B1
    await window.waitForTimeout(200)

    const b1Value = await cell(0, 'B').inputValue()
    expect(b1Value, `B1 =A1*3: expected "30", got "${b1Value}"`).toBe('30')

    // C1 = =2+ (broken) → should display #ERR
    await cell(0, 'C').click()
    await cell(0, 'C').fill('=2+')
    await cell(0, 'A').click() // blur C1
    await window.waitForTimeout(200)

    const c1Value = await cell(0, 'C').inputValue()
    expect(c1Value, `C1 =2+ (broken): expected "#ERR", got "${c1Value}"`).toBe('#ERR')
  } finally {
    await dispose()
  }
})

test('Step 6 — blank Slides: edit title, add slide, Present mode, arrow nav, Esc exits', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await clickStartBlank(window, 'Slides')

    // "Present" button visible = editor loaded
    const presentBtn = window.getByRole('button', { name: /Present/i })
    await expect(presentBtn).toBeVisible({ timeout: 5_000 })

    // Rail shows "Slide 1 of 1"
    await expect(window.locator('text=Slide 1 of 1')).toBeVisible()

    // Edit the title and verify live preview updates
    const titleInput = window.locator('input[placeholder="Slide title"]')
    await titleInput.clear()
    await titleInput.fill('Test Slide')
    // The SlideFace preview renders the title in an h2 inside .aspect-video
    await expect(window.locator('.aspect-video h2').first()).toContainText('Test Slide', { timeout: 3_000 })

    // Switch to "bullets" layout so that bullet text appears in the live preview
    const layoutSelect = window.locator('select')
    await layoutSelect.selectOption('bullets')

    // Add a bullet
    const bulletsArea = window.locator('textarea[placeholder="One point per line"]')
    await bulletsArea.click()
    await bulletsArea.fill('First bullet')
    // Preview shows bullets in a <ul><li> (only rendered when layout is not 'title'/'section')
    await expect(window.locator('.aspect-video ul li').first()).toContainText('First bullet', { timeout: 3_000 })

    // Add a second slide via the dashed add button in the rail
    const addSlideBtn = window.locator('button.border-dashed').first()
    await addSlideBtn.click()
    // Counter updates to "Slide 2 of 2"
    await expect(window.locator('text=Slide 2 of 2')).toBeVisible({ timeout: 3_000 })

    // Select slide 1 before presenting so Present starts at slide 1 of 2.
    // The rail has two slide thumbnails; click the first one.
    const railThumbnails = window.locator('[class*="aspect-video"][class*="rounded-md"]')
    await railThumbnails.first().click()
    await expect(window.locator('text=Slide 1 of 2')).toBeVisible({ timeout: 3_000 })

    // Enter Present mode
    await presentBtn.click()
    const overlay = window.locator('.fixed.inset-0.bg-black')
    await expect(overlay).toBeVisible({ timeout: 3_000 })
    // Counter shows "1 / 2" (presentIdx=0, starting from slide 1)
    await expect(window.locator('.fixed.inset-0.bg-black span.tabular-nums')).toContainText('1 / 2')

    // ArrowRight advances to slide 2
    await window.keyboard.press('ArrowRight')
    await expect(window.locator('.fixed.inset-0.bg-black span.tabular-nums')).toContainText('2 / 2', { timeout: 3_000 })

    // Escape exits
    await window.keyboard.press('Escape')
    await expect(overlay).not.toBeVisible({ timeout: 3_000 })

    // Editor still functional after exit
    await expect(presentBtn).toBeVisible()
  } finally {
    await dispose()
  }
})

test('Step 7 — navigate Home → Calendar → Documents, no errors, Recent list intact', async () => {
  const { window, dispose } = await launchApp()
  const consoleErrors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  try {
    await waitForReady(window)

    // Create a doc so Recent is non-empty
    await openDocumentsHub(window)
    await clickStartBlank(window, 'Document')
    await window.locator('[contenteditable="true"]').first().waitFor({ state: 'visible', timeout: 5_000 })
    await window.waitForTimeout(800) // autosave debounce
    await window.locator('button[title="Back to Documents"]').click()
    await expect(window.locator('text=Untitled document').first()).toBeVisible({ timeout: 5_000 })

    // Navigate away → Home
    await window.getByRole('button', { name: /^Home$/i }).click()
    await window.waitForTimeout(300)

    // Navigate → Calendar
    await window.getByRole('button', { name: /^Calendar$/i }).click()
    await window.waitForTimeout(300)

    // Navigate back → Documents
    await window.getByRole('button', { name: /^Documents$/i }).click()
    await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 5_000 })

    // Recent still intact
    await expect(window.locator('text=Untitled document').first()).toBeVisible({ timeout: 5_000 })

    // No real console errors
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('WebSocket')
    )
    expect(realErrors, `Unexpected console errors: ${realErrors.join('\n')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})

test('Step 8 — no regressions: Home, Calendar, Vault, Inbox still route without error', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Home
    await window.getByRole('button', { name: /^Home$/i }).click()
    await window.waitForTimeout(400)
    await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()

    // Calendar
    await window.getByRole('button', { name: /^Calendar$/i }).click()
    await window.waitForTimeout(400)
    await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()

    // Vault
    await window.getByRole('button', { name: /^Vault$/i }).click()
    await window.waitForTimeout(400)
    await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()

    // Inbox
    await window.getByRole('button', { name: /^Inbox$/i }).click()
    await window.waitForTimeout(400)
    await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()

    // All Tasks (may be inside a collapsible Workspace section — best-effort)
    const allTasksBtn = window.getByRole('button', { name: /^All Tasks$/i })
    if (await allTasksBtn.isVisible().catch(() => false)) {
      await allTasksBtn.click()
      await window.waitForTimeout(400)
      await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()
    }

    // Messages
    await window.getByRole('button', { name: /^Messages$/i }).click()
    await window.waitForTimeout(400)
    await expect(window.getByRole('button', { name: /^Documents$/i })).toBeVisible()
  } finally {
    await dispose()
  }
})
