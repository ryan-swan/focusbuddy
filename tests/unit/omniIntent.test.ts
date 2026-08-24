import { describe, it, expect } from 'vitest'
import { classifyOmniInput, matchTargets, searchUrl, type OmniTarget, composerOmniIntents } from '../../src/renderer/src/lib/omniIntent'

// A2, AI-01, R11 — the omnibar routes by showing, never by silent guessing.
// These pin WHAT Enter will do for each shape of input.

const TARGETS: OmniTarget[] = [
  { kind: 'page', id: 'tasks', title: 'Tasks' },
  { kind: 'page', id: 'calendar', title: 'Calendar' },
  { kind: 'desk', id: 'desk-1', title: 'Wedding' },
  { kind: 'desk', id: 'desk-2', title: 'SDR research' },
  { kind: 'document', id: 'doc-1', title: 'Launch budget' }
]

const first = (input: string): ReturnType<typeof classifyOmniInput>[number] =>
  classifyOmniInput(input, TARGETS)[0]

describe('classifyOmniInput — what Enter does', () => {
  it('a URL opens as a URL, with and without a scheme', () => {
    expect(first('https://plexi.so/pricing')).toMatchObject({ kind: 'url', url: 'https://plexi.so/pricing' })
    expect(first('plexi.so')).toMatchObject({ kind: 'url', url: 'https://plexi.so', label: 'Open plexi.so' })
    expect(first('www.figma.com/files')).toMatchObject({ kind: 'url' })
  })

  it('a bare phrase searches the web ("you can Google from Plexi")', () => {
    expect(first('standing desk setups')).toMatchObject({ kind: 'search', label: 'Search the web' })
  })

  it('a question goes to Plexii', () => {
    expect(first('how do I become a great SDR?')).toMatchObject({ kind: 'ask' })
    expect(first('what venues fit 180 people')).toMatchObject({ kind: 'ask' })
    expect(first('draft a partner note')).toMatchObject({ kind: 'ask' })
  })

  it('"take me to" navigates to a page, desk, or document', () => {
    expect(first('take me to tasks')).toMatchObject({ kind: 'goto', target: { id: 'tasks' } })
    expect(first('go to wedding')).toMatchObject({ kind: 'goto', target: { id: 'desk-1' } })
    expect(first('open launch budget')).toMatchObject({ kind: 'goto', target: { id: 'doc-1' } })
  })

  it('"open X" with a URL opens the URL', () => {
    expect(first('open plexi.so')).toMatchObject({ kind: 'url', url: 'https://plexi.so' })
  })

  it('"open a savings account" is not a dead navigation', () => {
    const intents = classifyOmniInput('open a savings account', TARGETS)
    expect(intents[0].kind).not.toBe('goto')
  })

  it('a bare exact workspace name navigates first, phrase-searches otherwise', () => {
    expect(first('wedding')).toMatchObject({ kind: 'goto', target: { id: 'desk-1' } })
    expect(first('wedding venues in austin')).toMatchObject({ kind: 'search' })
  })

  it('Tab always has somewhere to go: every input yields at least two intents', () => {
    for (const input of ['plexi.so', 'standing desks', 'what is a desk?', 'take me to tasks']) {
      expect(classifyOmniInput(input, TARGETS).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('empty input yields nothing', () => {
    expect(classifyOmniInput('   ', TARGETS)).toEqual([])
  })
})

describe('matchTargets and searchUrl', () => {
  it('prefers exact, then prefix, then containment; shorter breaks ties', () => {
    const m = matchTargets('sdr', TARGETS)
    expect(m[0].id).toBe('desk-2')
  })

  it('search urls encode the query for the chosen engine', () => {
    expect(searchUrl('duckduckgo', 'a b')).toBe('https://duckduckgo.com/?q=a%20b')
    expect(searchUrl('google', 'a&b')).toContain('google.com/search?q=a%26b')
  })
})

describe('composerOmniIntents — the mascot door is chat-first (AI-01)', () => {
  const targets = [
    { kind: 'desk' as const, id: 'd1', title: 'Wedding desk' },
    { kind: 'page' as const, id: 'files', title: 'Files' },
    { kind: 'document' as const, id: 'doc1', title: 'Launch plan' }
  ]

  it('a bare address diverts Enter to the in-app browser', () => {
    const intents = composerOmniIntents('plexi.so', targets)
    expect(intents[0]?.kind).toBe('url')
    expect(intents[0]?.url).toBe('https://plexi.so')
    expect(intents.some((i) => i.kind === 'ask')).toBe(true)
  })

  it('take-me-to naming something real diverts to navigation', () => {
    const intents = composerOmniIntents('take me to the wedding desk', targets)
    expect(intents[0]?.kind).toBe('goto')
    expect(intents[0]?.target?.id).toBe('d1')
  })

  it('soft verbs that match nothing never fake navigation, and stay chat-led mid-conversation', () => {
    // "open X" is advice-shaped, not a nav command: no dead goto/url ever.
    for (const chatFirst of [true, false]) {
      const intents = composerOmniIntents('open a savings account', targets, { chatFirst })
      expect(intents.some((i) => i.kind === 'goto' || i.kind === 'url')).toBe(false)
    }
    // Mid-conversation it reads as a request to Plexii, so chat leads.
    const mid = composerOmniIntents('open a savings account', targets, { chatFirst: true })
    expect(mid[0]?.kind ?? 'ask').toBe('ask')
  })

  it('questions and work requests grow no chrome at all', () => {
    expect(composerOmniIntents('what should our pricing be?', targets)).toEqual([])
    expect(composerOmniIntents('draft an email to Michael about the launch', targets)).toEqual([])
  })

  it('a fresh conversation is searchy: the web leads, Plexii one Tab away', () => {
    const intents = composerOmniIntents('best standing desk 2026', targets)
    expect(intents[0]?.kind).toBe('search')
    expect(intents[1]?.kind).toBe('ask')
  })

  it('mid-conversation the same phrase stays chat-led — replies are never hijacked', () => {
    const intents = composerOmniIntents('sounds good to me', targets, { chatFirst: true })
    expect(intents[0]?.kind ?? 'ask').toBe('ask')
  })

  it("take-me-to naming nothing local searches the web instantly (Caleb's BWW case)", () => {
    const intents = composerOmniIntents('take me to buffalo wild wings menu', targets, {
      chatFirst: true
    })
    expect(intents[0]?.kind).toBe('search')
    // The search carries the destination, not the command words.
    expect(intents[0]?.url).toBe('buffalo wild wings menu')
    expect(intents[1]?.kind).toBe('ask')
  })

  it('multiline or long input is a composed message, never a command', () => {
    expect(composerOmniIntents('plexi.so\nand some more', targets)).toEqual([])
    expect(composerOmniIntents(`${'very long phrase '.repeat(12)}`, targets)).toEqual([])
  })
})

describe("matchTargets as a remote control (Caleb's flamelit miss)", () => {
  const targets = [
    { kind: 'desk' as const, id: 'fl', title: 'Flamelit HQ' },
    { kind: 'desk' as const, id: 'wed', title: 'Wedding desk' },
    { kind: 'page' as const, id: 'files', title: 'Files' }
  ]

  it('"my flamelit desk" finds the desk titled Flamelit HQ', () => {
    expect(matchTargets('my flamelit desk', targets)[0]?.id).toBe('fl')
  })

  it('the full take-me-to phrase routes instead of searching', () => {
    const intents = composerOmniIntents('take me to my flamelit desk', targets, {
      chatFirst: true
    })
    expect(intents[0]?.kind).toBe('goto')
    expect(intents[0]?.target?.id).toBe('fl')
  })

  it('type nouns are query filler but never stripped from titles', () => {
    expect(matchTargets('the wedding desk', targets)[0]?.id).toBe('wed')
  })

  it('partial token overlap never fakes a destination', () => {
    const intents = composerOmniIntents('take me to buffalo wild wings menu', targets, {
      chatFirst: true
    })
    expect(intents[0]?.kind).toBe('search')
  })
})
