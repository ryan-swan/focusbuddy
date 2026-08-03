/**
 * E2E for PlexiSlides present-mode animations: element entrance animations play
 * on slide enter, and a Morph slide tweens shared elements from the previous
 * slide. Verifies the DOM markers the animation system produces (present mode
 * plays real CSS animations we can't assert frame-by-frame, so we assert the
 * animated wrappers/components mount).
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

const DECK = {
  schemaVersion: 2,
  slides: [
    {
      id: 'sl1',
      notes: '',
      schemaVersion: 2,
      transition: 'none',
      elements: [
        { id: 'title', type: 'text', x: 100, y: 80, w: 600, h: 120, z: 1, paragraphs: [{ runs: [{ text: 'Hello', fontSize: 44 }] }], anim: { type: 'fadeIn' } },
        { id: 'box', type: 'shape', shape: 'rect', x: 100, y: 300, w: 200, h: 200, z: 2, fill: { type: 'solid', color: '#3b82f6' } }
      ]
    },
    {
      id: 'sl2',
      notes: '',
      schemaVersion: 2,
      transition: 'morph',
      elements: [
        // Same id 'box' at a new position/size — Morph should tween it.
        { id: 'box', type: 'shape', shape: 'rect', x: 800, y: 120, w: 360, h: 360, z: 1, fill: { type: 'solid', color: '#3b82f6' } }
      ]
    }
  ]
}

test('SA-1 — entrance animations play and a Morph slide tweens shared elements', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    await window.evaluate(async (body) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({ docType: 'slides', title: 'Animated deck', body: body as never })
    }, DECK)

    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)
    await window.locator('text=Animated deck').first().click()
    await expect(window.locator('[data-testid="slides-toolbar"]')).toBeVisible({ timeout: 10_000 })

    // Enter present mode from the toolbar.
    await window.locator('[data-testid="slides-toolbar"]').locator('button', { hasText: 'Present' }).first().click()
    const overlay = window.locator('[data-testid="present-overlay"]')
    await expect(overlay).toBeVisible({ timeout: 5_000 })

    // Slide 1: the title element has an entrance animation, so its animated
    // wrapper renders.
    await expect(overlay.locator('[data-testid="slide-anim-el"]').first()).toBeVisible({ timeout: 4_000 })

    // Advance to the Morph slide: the morph component mounts.
    await window.keyboard.press('ArrowRight')
    await expect(overlay.locator('[data-testid="slide-morph"]')).toBeVisible({ timeout: 4_000 })

    await window.keyboard.press('Escape')
    await expect(overlay).toBeHidden({ timeout: 3_000 })
  } finally {
    await dispose()
  }
})
