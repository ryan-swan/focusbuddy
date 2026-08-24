import { describe, it, expect } from 'vitest'
import { turnRetrieval, isQuestionTurn } from '../../src/main/ai/retrievalIntent'

// A4, AI-10 — the turn-level gate that stops discovery ideation from
// ceremonially searching the workspace and the web on every reply. The shapes
// locked here are the canonical ones from the ruling: choice taps and
// preference statements skip; the seed, mentions, questions, and turns that
// reference the user's own material still ground.

const base = {
  mode: 'discovery' as const,
  isFirstUserTurn: false,
  hasMentions: false,
  webEnabled: true
}

describe('turnRetrieval — normal chat is untouched', () => {
  it('always retrieves outside discovery', () => {
    const d = turnRetrieval({ ...base, mode: 'chat', text: 'ok' })
    expect(d).toEqual({ workspace: true, web: true, reason: 'chat-mode' })
  })

  it('absent mode reads as normal chat', () => {
    const d = turnRetrieval({ ...base, mode: undefined, text: 'sure' })
    expect(d.workspace).toBe(true)
  })

  it('the R21 globe turns off just the web pool in chat mode', () => {
    const d = turnRetrieval({ ...base, mode: 'chat', text: 'research plexiglass suppliers', webEnabled: false })
    expect(d).toEqual({ workspace: true, web: false, reason: 'chat-mode' })
  })
})

describe('turnRetrieval — discovery ideation skips the ceremony', () => {
  it('a preference statement searches nothing', () => {
    const d = turnRetrieval({ ...base, text: 'Something calm and minimal' })
    expect(d).toEqual({ workspace: false, web: false, reason: 'ideation' })
  })

  it('a tapped choice option searches nothing', () => {
    const d = turnRetrieval({ ...base, text: 'Keep exploring' })
    expect(d.reason).toBe('ideation')
  })

  it('an acceptance searches nothing', () => {
    const d = turnRetrieval({ ...base, text: 'Yes, more like that' })
    expect(d.reason).toBe('ideation')
  })

  it('ideation gates the web even when the globe is on', () => {
    const d = turnRetrieval({ ...base, text: 'Option B', webEnabled: true })
    expect(d.web).toBe(false)
  })
})

describe('turnRetrieval — what still grounds a discovery turn', () => {
  it('the seed (first user turn) retrieves', () => {
    const d = turnRetrieval({ ...base, text: 'a wedding planning hub', isFirstUserTurn: true })
    expect(d).toEqual({ workspace: true, web: true, reason: 'seed' })
  })

  it('admitted @-mentions retrieve', () => {
    const d = turnRetrieval({ ...base, text: 'build on that one', hasMentions: true })
    expect(d.reason).toBe('mentions')
  })

  it('a genuine question retrieves', () => {
    const d = turnRetrieval({ ...base, text: 'what venues did we shortlist?' })
    expect(d.reason).toBe('question')
  })

  it('referencing their own material retrieves', () => {
    const d = turnRetrieval({ ...base, text: 'use my existing budget table for this' })
    expect(d.reason).toBe('workspace-signals')
  })

  it('the globe still gates the web on a grounded discovery turn', () => {
    const d = turnRetrieval({ ...base, text: 'what venues did we shortlist?', webEnabled: false })
    expect(d).toEqual({ workspace: true, web: false, reason: 'question' })
  })
})

describe('isQuestionTurn', () => {
  it('closing question mark', () => {
    expect(isQuestionTurn('so the budget is flexible?')).toBe(true)
  })
  it('interrogative lead without the mark', () => {
    expect(isQuestionTurn('how do other people organise this')).toBe(true)
  })
  it('a statement is not a question', () => {
    expect(isQuestionTurn('I want it to feel light')).toBe(false)
  })
  it('empty is not a question', () => {
    expect(isQuestionTurn('   ')).toBe(false)
  })
})
