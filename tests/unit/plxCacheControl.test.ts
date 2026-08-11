import { describe, it, expect } from 'vitest'
import {
  cacheable,
  plain,
  cachedSystem,
  cachedUserContent,
  cacheTokens
} from '../../src/main/ai/cacheControl'

// Pure tests for the prompt-cache block helpers: they must put a cache_control
// marker on the stable prefix and leave the varying tail plain, and read the
// cache token fields defensively.

describe('cacheable / plain', () => {
  it('cacheable carries an ephemeral cache_control marker', () => {
    expect(cacheable('hi')).toEqual({ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } })
  })
  it('plain carries no cache_control (the varying suffix)', () => {
    expect(plain('q')).toEqual({ type: 'text', text: 'q' })
    expect('cache_control' in plain('q')).toBe(false)
  })
})

describe('cachedSystem', () => {
  it('caches the stable prefix and leaves the dynamic suffix plain', () => {
    const b = cachedSystem('INSTRUCTIONS', 'retrieval-of-the-moment')
    expect(b).toEqual([
      { type: 'text', text: 'INSTRUCTIONS', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'retrieval-of-the-moment' }
    ])
    // The cache marker is only on the prefix, never on the varying suffix.
    expect(b[0].cache_control).toBeDefined()
    expect(b[1].cache_control).toBeUndefined()
  })
  it('a single cached block when there is no dynamic suffix', () => {
    expect(cachedSystem('ONLY')).toEqual([{ type: 'text', text: 'ONLY', cache_control: { type: 'ephemeral' } }])
  })
  it('a single plain block when there is no stable prefix', () => {
    expect(cachedSystem('', 'dyn')).toEqual([{ type: 'text', text: 'dyn' }])
  })
  it('empty for all-empty input', () => {
    expect(cachedSystem('', '')).toEqual([])
  })
})

describe('cachedUserContent', () => {
  it('caches the large context and keeps the question tail plain', () => {
    const b = cachedUserContent('Workspace documents:\n[1] Doc', 'Question: what?')
    expect(b).toEqual([
      { type: 'text', text: 'Workspace documents:\n[1] Doc', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Question: what?' }
    ])
  })
  it('falls back to a single plain block when there is no context (unchanged behaviour)', () => {
    expect(cachedUserContent('   ', 'just a question')).toEqual([{ type: 'text', text: 'just a question' }])
  })
})

describe('cacheTokens', () => {
  it('reads read/write fields off a usage object', () => {
    expect(cacheTokens({ cache_read_input_tokens: 2529, cache_creation_input_tokens: 10 })).toEqual({
      read: 2529,
      write: 10
    })
  })
  it('defaults to zero for missing fields / null / undefined', () => {
    expect(cacheTokens({ input_tokens: 5 })).toEqual({ read: 0, write: 0 })
    expect(cacheTokens(null)).toEqual({ read: 0, write: 0 })
    expect(cacheTokens(undefined)).toEqual({ read: 0, write: 0 })
  })
})
