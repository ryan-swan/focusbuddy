import { describe, it, expect } from 'vitest'
import { validateChatUiBlocks, uiBlocksSection } from '../../src/main/ai/chatUiBlocks'
import { deriveAssistantBlocks } from '../../src/renderer/src/lib/chatBlocks'
import type { ChatUiBlock } from '../../src/shared/types'

// The interactive-block gate (Plexii P4). The renderer trusts what leaves the
// sanitiser completely, so these lock the two properties that matter: valid
// blocks pass through intact, and anything malformed is dropped whole — never
// repaired into something the model did not say.

describe('validateChatUiBlocks', () => {
  it('passes all four valid shapes through intact', () => {
    const raw = [
      {
        type: 'choices',
        id: 'c1',
        prompt: 'Pick a direction',
        options: [
          { id: 'a', label: 'Podcast studio', icon: 'mic' },
          { id: 'b', label: 'Newsletter', description: 'Weekly cadence' }
        ]
      },
      { type: 'scale', id: 's1', label: 'How ambitious?', min: 1, max: 10, minLabel: 'Safe', maxLabel: 'Moonshot' },
      { type: 'icon-row', items: [{ icon: 'description', label: 'Docs' }] },
      { type: 'cards', items: [{ icon: 'rocket_launch', title: 'Launch', body: 'One line' }] }
    ]
    const out = validateChatUiBlocks(raw)
    expect(out.map((b) => b.type)).toEqual(['choices', 'scale', 'icon-row', 'cards'])
    const choices = out[0] as Extract<ChatUiBlock, { type: 'choices' }>
    expect(choices.options).toHaveLength(2)
    expect(choices.options[0].icon).toBe('mic')
  })

  it('drops a choices block with fewer than two usable options', () => {
    expect(
      validateChatUiBlocks([
        { type: 'choices', id: 'c', options: [{ id: 'a', label: 'Only one' }] },
        { type: 'choices', id: 'c2', options: [{ id: 'a' }, { id: 'b' }] } // no labels
      ])
    ).toEqual([])
  })

  it('drops degenerate or absurd scales', () => {
    expect(
      validateChatUiBlocks([
        { type: 'scale', id: 's', label: 'Bad', min: 5, max: 5 },
        { type: 'scale', id: 's2', label: 'Huge', min: 0, max: 5000 },
        { type: 'scale', id: 's3', label: 'NaN', min: 'a', max: 10 }
      ])
    ).toEqual([])
  })

  it('drops junk, non-arrays and unknown types without throwing', () => {
    expect(validateChatUiBlocks(undefined)).toEqual([])
    expect(validateChatUiBlocks('blocks')).toEqual([])
    expect(validateChatUiBlocks([null, 42, { type: 'hologram' }, {}])).toEqual([])
  })

  it('caps blocks and items rather than flooding the panel', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: 'cards',
      items: Array.from({ length: 20 }, (_, j) => ({ title: `Card ${i}-${j}` }))
    }))
    const out = validateChatUiBlocks(many)
    expect(out).toHaveLength(6)
    for (const b of out) {
      expect((b as Extract<ChatUiBlock, { type: 'cards' }>).items).toHaveLength(8)
    }
  })

  it('truncates runaway strings with an ellipsis instead of rejecting them', () => {
    const out = validateChatUiBlocks([
      {
        type: 'choices',
        id: 'c',
        options: [
          { id: 'a', label: 'x'.repeat(300) },
          { id: 'b', label: 'Fine' }
        ]
      }
    ])
    const choices = out[0] as Extract<ChatUiBlock, { type: 'choices' }>
    expect(choices.options[0].label.length).toBeLessThanOrEqual(80)
    expect(choices.options[0].label.endsWith('…')).toBe(true)
  })

  it('prompt section names all four shapes it validates', () => {
    const s = uiBlocksSection()
    for (const t of ['"choices"', '"scale"', '"icon-row"', '"cards"']) {
      expect(s).toContain(t)
    }
  })
})

describe('deriveAssistantBlocks with ui blocks', () => {
  it('places ui blocks between the prose and the action cards', () => {
    const ui: ChatUiBlock[] = [
      { type: 'icon-row', items: [{ icon: 'description', label: 'Docs' }] }
    ]
    const blocks = deriveAssistantBlocks(
      { role: 'assistant', content: 'Here is the plan.', ts: 1 },
      [{ id: 'p1', kind: 'create-task', title: 'Ship it' }],
      [],
      ui
    )
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'ui', 'action'])
  })

  it('yields no ui blocks when the turn carried none', () => {
    const blocks = deriveAssistantBlocks({ role: 'assistant', content: 'Plain.', ts: 1 }, [])
    expect(blocks.map((b) => b.kind)).toEqual(['text'])
  })
})
