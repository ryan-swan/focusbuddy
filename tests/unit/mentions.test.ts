// Unit tests for bodyMentionsHandle (src/renderer/src/lib/mentions.ts), the
// pure @mention matcher shared by chat rendering and mention-aware
// notifications. Covers positive match, case-insensitivity, prefix
// non-matching (a mention token is matched whole, not as a substring), a
// null/undefined handle, and punctuation-boundary cases.

import { describe, it, expect } from 'vitest'
import { bodyMentionsHandle } from '@renderer/lib/mentions'

describe('bodyMentionsHandle', () => {
  it('matches a plain @handle mention in the body', () => {
    expect(bodyMentionsHandle('hey @ana can you look at this', 'ana')).toBe(true)
  })

  it('is case-insensitive on both the mention and the handle', () => {
    expect(bodyMentionsHandle('hey @ANA are you around', 'ana')).toBe(true)
    expect(bodyMentionsHandle('hey @ana are you around', 'ANA')).toBe(true)
    expect(bodyMentionsHandle('hey @AnA are you around', 'aNa')).toBe(true)
  })

  it('does not match when the handle is only a prefix of a longer mention', () => {
    // @anastasia must not satisfy a search for handle "ana" — the mention
    // token is captured whole (greedy charset), so "ana" != "anastasia".
    expect(bodyMentionsHandle('hey @anastasia, got a sec?', 'ana')).toBe(false)
  })

  it('does not match when the handle is longer than the mention in the body', () => {
    expect(bodyMentionsHandle('hey @ana, got a sec?', 'anastasia')).toBe(false)
  })

  it('returns false for a null or undefined handle without throwing', () => {
    expect(bodyMentionsHandle('hey @ana', null)).toBe(false)
    expect(bodyMentionsHandle('hey @ana', undefined)).toBe(false)
  })

  it('returns false for an empty-string handle', () => {
    expect(bodyMentionsHandle('hey @ana', '')).toBe(false)
  })

  it('returns false when the body has no mention at all', () => {
    expect(bodyMentionsHandle('no mentions here', 'ana')).toBe(false)
  })

  it('matches at a punctuation boundary — comma immediately after the handle', () => {
    expect(bodyMentionsHandle('cc @ana, thanks!', 'ana')).toBe(true)
  })

  it('matches at a punctuation boundary — parenthesis immediately after the handle', () => {
    expect(bodyMentionsHandle('(cc @ana) please review', 'ana')).toBe(true)
  })

  it('matches at a punctuation boundary — exclamation mark immediately after the handle', () => {
    expect(bodyMentionsHandle('ping @ana!', 'ana')).toBe(true)
  })

  it('treats a period as part of the mention token, not a boundary (MENTION_RE charset includes ".")', () => {
    // The mention charset [a-z0-9._-] includes the period, so "@ana." is
    // captured whole as "ana." and does not equal the handle "ana" — this
    // documents the real regex behavior rather than assuming '.' terminates
    // a mention.
    expect(bodyMentionsHandle('ping @ana.', 'ana')).toBe(false)
  })

  it('matches a mention at the very start of the body', () => {
    expect(bodyMentionsHandle('@ana are you there', 'ana')).toBe(true)
  })

  it('matches a mention at the very end of the body', () => {
    expect(bodyMentionsHandle('are you there @ana', 'ana')).toBe(true)
  })

  it('matches the second of two mentions in the same body', () => {
    expect(bodyMentionsHandle('cc @bob and @ana on this', 'ana')).toBe(true)
  })

  it('does not match a bare @ with no handle characters after it', () => {
    expect(bodyMentionsHandle('email me at me@ example.com', 'ana')).toBe(false)
  })

  it('handles a single-character search handle honestly (regex requires 2+ chars, so no false positive)', () => {
    // MENTION_RE requires {2,32} chars, so a one-character handle can never be
    // captured from the body even if present as text — false is the honest
    // (unmatched) result here, not a bug in bodyMentionsHandle itself.
    expect(bodyMentionsHandle('hey @a is that you', 'a')).toBe(false)
  })
})
