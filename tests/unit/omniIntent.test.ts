import { describe, it, expect } from 'vitest'
import { classifyOmniInput, matchTargets, searchUrl, type OmniTarget } from '../../src/renderer/src/lib/omniIntent'

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
