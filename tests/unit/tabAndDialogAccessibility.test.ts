import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// "Accessibility coverage is inconsistent. Some important modal content is
// completely absent to assistive technology despite being visible. Settings →
// Data or Advanced: tabs are exposed, but their visible controls and
// descriptions are not. The new-desk modal also lacked usable controls."
//
// Two distinct causes:
//
//  1. Tab strips declared role="tablist" and role="tab" but never a tabpanel.
//     An ARIA tab that controls nothing leaves its content orphaned, so the
//     reader hears the tab names and never reaches what they switch between.
//     The same strips were also one tab stop per tab with no arrow support,
//     instead of the roving-tabindex contract the role implies.
//  2. A <label> that neither wraps its control nor carries htmlFor names
//     nothing at all. The control reaches the tree unnamed, with a placeholder
//     standing in -- and a placeholder is not an accessible name.

const C = join(__dirname, '..', '..', 'src', 'renderer', 'src', 'components')
const read = (rel: string): string => readFileSync(join(C, rel), 'utf8')

describe('tab strips expose what they control', () => {
  it('Settings tabs point at a panel and move with arrow keys', () => {
    const src = read('SettingsPanel.tsx')
    expect(src).toContain('role="tabpanel"')
    expect(src).toContain('aria-controls="settings-tabpanel"')
    expect(src).toContain('aria-labelledby={`settings-tab-${tab}`}')
    // Roving tabindex + arrows: the keyboard half of the same contract.
    expect(src).toContain('tabIndex={active ? 0 : -1}')
    expect(src).toMatch(/ArrowRight/)
  })

  it('Assistant tabs point at a panel', () => {
    const src = read('assistant/AssistantOverlay.tsx')
    expect(src).toContain('role="tabpanel"')
    expect(src).toContain('aria-controls="assistant-tabpanel"')
  })
})

describe('the new-desk dialog names its controls', () => {
  const src = read('MakeTaskDialog.tsx')

  it('associates the title label with its input', () => {
    expect(src).toContain('htmlFor="make-desk-title"')
    expect(src).toContain('id="make-desk-title"')
  })

  it('names the folder chooser as a group, since its control varies', () => {
    expect(src).toContain('aria-labelledby="make-desk-folder-label"')
    expect(src).toContain('id="make-desk-folder-label"')
  })

  it('gives every text control in the dialog a name of its own', () => {
    for (const m of src.matchAll(/<input\b[\s\S]{0,400}?\/>/g)) {
      const tag = m[0]
      if (!/placeholder=/.test(tag)) continue
      const named = /aria-label=|aria-labelledby=|id="make-desk-/.test(tag)
      expect(named, `an input is named only by its placeholder: ${tag.slice(0, 90)}`).toBe(true)
    }
  })
})
