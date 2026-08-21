import { describe, it, expect } from 'vitest'
import { safeCut } from '../../src/renderer/src/lib/streamReveal'

// P3 anti-jitter rules: what the smoothed reveal is allowed to show mid-stream.

describe('safeCut — the reveal boundary', () => {
  it('returns the whole text once the reveal reaches the end', () => {
    expect(safeCut('hello world', 999)).toBe('hello world')
  })

  it('never cuts mid-word', () => {
    const cut = safeCut('alpha beta gamma', 8) // inside "beta"
    expect(cut).toBe('alpha')
  })

  it('holds back an unclosed code fence entirely', () => {
    const text = 'Intro paragraph.\n\n```ts\nconst x = 1\n'
    const cut = safeCut(text, text.length - 1)
    expect(cut).not.toContain('```')
    expect(cut).toContain('Intro paragraph.')
  })

  it('shows a fence again once it closes', () => {
    const text = 'Intro.\n\n```ts\nconst x = 1\n```\nAfter fence more words'
    const cut = safeCut(text, text.indexOf('After') + 3)
    expect(cut).toContain('```ts')
    expect(cut).toContain('const x = 1')
    expect(cut.trimEnd().endsWith('```')).toBe(true)
  })
})
