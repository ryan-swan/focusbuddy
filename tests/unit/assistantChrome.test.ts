import { describe, it, expect } from 'vitest'
import {
  ASSISTANT_DEFAULT,
  ASSISTANT_MAX,
  ASSISTANT_MIN,
  clampAssistantWidth
} from '../../src/renderer/src/stores/assistantChrome'

// The one pure rule in the chrome store: the sidebar dock width can never
// leave its bounds, whatever localStorage or a drag hands it.
describe('clampAssistantWidth', () => {
  it('passes through an in-bounds width, rounded', () => {
    expect(clampAssistantWidth(400)).toBe(400)
    expect(clampAssistantWidth(415.6)).toBe(416)
  })

  it('clamps to the bounds', () => {
    expect(clampAssistantWidth(0)).toBe(ASSISTANT_MIN)
    expect(clampAssistantWidth(-50)).toBe(ASSISTANT_MIN)
    expect(clampAssistantWidth(10_000)).toBe(ASSISTANT_MAX)
  })

  it('falls back to the default for garbage (a corrupted localStorage value)', () => {
    expect(clampAssistantWidth(Number('not-a-number'))).toBe(ASSISTANT_DEFAULT)
    expect(clampAssistantWidth(Infinity)).toBe(ASSISTANT_DEFAULT)
  })
})
