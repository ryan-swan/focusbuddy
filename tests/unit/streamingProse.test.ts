import { describe, it, expect } from 'vitest'
import { safeCut, waveEnds, WAVE_MAX_CHARS } from '../../src/renderer/src/lib/streamReveal'

// AI-30: the answer lands in sentence waves. Caleb's third rejudge: "I don't
// want the final message to just all populate at once. I want it to populate
// into sections… a few sentences at a time." These pin WHERE a wave may close.
describe('waveEnds — where a wave may close', () => {
  const waves = (text: string, final = false): string[] => {
    let from = 0
    return waveEnds(text, final).map((end) => {
      const w = text.slice(from, end)
      from = end
      return w
    })
  }

  it('groups two sentences of a paragraph into one wave', () => {
    const text = 'First point here. Second point here. Third point here. Fourth. '
    expect(waves(text)).toEqual(['First point here. Second point here.', ' Third point here. Fourth.'])
  })

  it('holds a trailing sentence until its follower arrives, or the stream ends', () => {
    const text = 'One sentence. Two sentences. Three'
    expect(waves(text)).toEqual(['One sentence. Two sentences.'])
    expect(waves(text, true)).toEqual(['One sentence. Two sentences.', ' Three'])
  })

  it('a sentence end needs the whitespace after it before it counts', () => {
    expect(waves('Alpha ends. Beta ends.')).toEqual([])
    expect(waves('Alpha ends. Beta ends. ')).toEqual(['Alpha ends. Beta ends.'])
  })

  it('closes a wave at a paragraph break even with a single sentence', () => {
    const text = 'Only one sentence here.\n\nNext paragraph starts. And goes on. '
    expect(waves(text)).toEqual(['Only one sentence here.', '\n\nNext paragraph starts. And goes on.'])
  })

  it('makes every list item and heading its own wave', () => {
    const text = '## Plan\n\n- Book the venue.\n- Send invites.\n- Order the cake.\n'
    expect(waves(text)).toEqual(['## Plan', '\n\n- Book the venue.', '\n- Send invites.', '\n- Order the cake.'])
  })

  it('never closes inside an unfinished construct', () => {
    const open = 'Start **bold words here. More words'
    expect(waves(open)).toEqual([])
    const fence = 'Intro line.\n\n```ts\nconst a = 1.\nconst b = 2.\n'
    expect(waves(fence)).toEqual(['Intro line.'])
    const closed = fence + '```\nAfter. '
    expect(waves(closed)).toEqual(['Intro line.', '\n\n```ts\nconst a = 1.\nconst b = 2.\n```'])
    expect(waves(closed, true).at(-1)?.trim()).toBe('After.')
  })

  it('a table lands header-and-delimiter together, then whole rows', () => {
    const text = 'Costs:\n\n| Item | Cost |\n|---|---|\n| Venue | $1,200 |\n| Cake | $300 |\n'
    expect(waves(text)).toEqual([
      'Costs:',
      '\n\n| Item | Cost |\n|---|---|',
      '\n| Venue | $1,200 |',
      '\n| Cake | $300 |'
    ])
  })

  it('does not split on abbreviations, initials, or decimals', () => {
    const text = 'Ask Dr. Smith about J. Doe and the 3.5 rate. Then decide. Next one. '
    expect(waves(text)[0]).toBe('Ask Dr. Smith about J. Doe and the 3.5 rate. Then decide.')
  })

  it('a very long sentence is its own wave', () => {
    const long = 'word '.repeat(WAVE_MAX_CHARS / 5 + 2).trim() + '. Short one. Another. '
    const [first] = waves(long)
    expect(first.endsWith('word.')).toBe(true)
  })

  it('is monotone: earlier waves keep their offsets as text appends', () => {
    const full = 'Alpha one. Alpha two. Beta one. Beta two.\n\n- item one\n- item two\n\nGamma. '
    for (let len = 1; len < full.length; len++) {
      const prefix = waveEnds(full.slice(0, len), false)
      expect(waveEnds(full, false).slice(0, prefix.length)).toEqual(prefix)
    }
  })
})

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

describe('safeCut — construct holdback (AI-27: nothing renders until it renders true)', () => {
  // Caleb's drive verdict on streaming: "glitched over and over… weirdly
  // formatted, then glitched back the right way." Every case here is a
  // construct that used to render broken mid-stream and snap correct later.

  it('holds an unclosed **bold** run, then reveals it whole', () => {
    const text = 'Send **fewer messages** now'
    expect(safeCut(text, text.indexOf('messages')).trimEnd()).toBe('Send')
    expect(safeCut(text, text.indexOf(' now'))).toBe('Send **fewer messages**')
  })

  it('holds an unclosed inline backtick', () => {
    const text = 'run `npm build` after'
    expect(safeCut(text, text.indexOf('build')).trimEnd()).toBe('run')
    expect(safeCut(text, text.length - 1)).toContain('`npm build`')
  })

  it('holds a link until its url closes', () => {
    const text = 'see [the doc](https://x.y) for more'
    expect(safeCut(text, text.indexOf('https') + 4).trimEnd()).toBe('see')
    expect(safeCut(text, text.indexOf(' for'))).toContain('[the doc](https://x.y)')
  })

  it('holds a bare heading marker line until content follows', () => {
    const text = 'Intro line.\n\n## Target Buying'
    expect(safeCut(text, text.indexOf('Target')).trimEnd()).toBe('Intro line.')
    expect(safeCut(text, text.length)).toBe(text)
  })

  it('holds a table until its delimiter row lands, then reveals whole rows only', () => {
    const headerOnly = 'Costs:\n\n| Item | Cost |'
    expect(safeCut(headerOnly, headerOnly.length - 1).trimEnd()).toBe('Costs:')
    const midRow = 'Costs:\n\n| Item | Cost |\n|---|---|\n| Venue | $1,200 |\n| Cat'
    const cut = safeCut(midRow, midRow.length - 1)
    expect(cut).toContain('| Venue | $1,200 |')
    expect(cut).not.toContain('Cat')
  })

  it('ignores markdown-looking characters inside closed code', () => {
    const text = 'Use `a ** b` and ```\nx[1\n``` then words after everything'
    const cut = safeCut(text, text.indexOf(' after'))
    expect(cut).toContain('`a ** b`')
    expect(cut).toContain('x[1')
  })

  it('a stray unpaired marker stops holding after a bounded distance (AI-28)', () => {
    // Caleb's second rejudge: "took a few seconds and just populated" — one
    // forgotten ** early in the answer held EVERYTHING after it invisible
    // until completion, then flooded. Past the cap, the literal renders and
    // the prose keeps typing.
    const text = 'a ** stray marker\n\n' + 'word '.repeat(80)
    const cut = safeCut(text, text.length - 10)
    expect(cut.length).toBeGreaterThan(200)
    expect(cut).toContain('word word')
  })
})
