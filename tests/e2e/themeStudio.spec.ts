import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Theme studio: open from Settings → switch the interface font (a curated a11y
// face) and set a custom accent colour. Both apply live to the document root
// (--font-sans / data-font, --accent / data-accent), proving the reskin is real
// and not just stored.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('theme studio switches the UI font and sets a custom accent live', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Open Settings, then the Theme studio.
  await window.getByRole('button', { name: 'Appearance settings' }).click()
  await window.locator('[data-testid="open-theme-studio"]').click()
  await expect(window.locator('[data-testid="theme-builder"]')).toBeVisible()

  // Switch to Atkinson Hyperlegible.
  await window.locator('[data-testid="themestudio-font-atkinson"]').click()
  await window.waitForTimeout(150)
  const fontState = await window.evaluate(() => {
    const root = document.documentElement
    return {
      dataFont: root.getAttribute('data-font'),
      fontSans: getComputedStyle(root).getPropertyValue('--font-sans')
    }
  })
  expect(fontState.dataFont).toBe('atkinson')
  expect(fontState.fontSans).toContain('Atkinson Hyperlegible')

  // Set a custom accent via the hex field — a colour none of the presets use.
  const hex = window.locator('[data-testid="themestudio-custom-hex"]')
  await hex.fill('#0ea5e9')
  await window.waitForTimeout(200)
  const accentState = await window.evaluate(() => {
    const root = document.documentElement
    return {
      dataAccent: root.getAttribute('data-accent'),
      accent: getComputedStyle(root).getPropertyValue('--accent').trim()
    }
  })
  expect(accentState.dataAccent).toBe('custom')
  // #0ea5e9 → "14 165 233" as the space-separated rgb triplet the tokens use.
  expect(accentState.accent).toBe('14 165 233')

  // Persisted to localStorage so it survives a reload.
  const persisted = await window.evaluate(() => ({
    font: localStorage.getItem('fb.theme.font'),
    accent: localStorage.getItem('fb.theme.accent'),
    custom: localStorage.getItem('fb.theme.customAccent')
  }))
  expect(persisted.font).toBe('atkinson')
  expect(persisted.accent).toBe('custom')
  expect(persisted.custom).toBe('#0ea5e9')
})
