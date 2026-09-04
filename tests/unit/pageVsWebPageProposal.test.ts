import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isUnapplicableProposal } from '../../src/main/ai/anthropic'

// "Set up a page for agents to write to" was answered with an open-url proposal
// and then refused with "URL must start with https://". Two causes, both pinned
// here: the word "page" was overloaded in the prompt (agent-browse used it to
// mean a WEB page, which is the sense the model then applied), and the refusal
// named a rule instead of the mistake.

const PROMPT = readFileSync('src/main/ai/anthropic.ts', 'utf8')
const EXECUTOR = readFileSync('src/renderer/src/lib/actionExecutor.ts', 'utf8')

describe('the chat prompt distinguishes a Plexii Page from a web page', () => {
  it('offers create-page and open-url as distinct actions', () => {
    expect(PROMPT).toContain('"kind": "create-page"')
    expect(PROMPT).toContain('"kind": "open-url"')
  })

  it('says a Page is a document inside Plexii, not a web address', () => {
    expect(PROMPT).toMatch(/A Page is a DOCUMENT inside Plexii, not a web address/)
  })

  it('names the phrasings that mean create-page', () => {
    expect(PROMPT).toMatch(/a page for an agent to write to/i)
  })

  it('never tells the model that a bare "page" means open-url', () => {
    // The original read "For simply showing a page, use open-url" — the exact
    // sentence that taught the ambiguity.
    expect(PROMPT).not.toMatch(/showing a page, use open-url/)
    expect(PROMPT).toMatch(/showing a web page, use open-url/)
  })

  it('states that open-url is for external addresses only', () => {
    expect(PROMPT).toMatch(/An EXTERNAL web address only/)
  })
})

describe('the open-url refusal explains itself', () => {
  it('no longer claims https is required when http is accepted', () => {
    expect(EXECUTOR).not.toContain('URL must start with https://')
    expect(EXECUTOR).toMatch(/http:\/\/ or https:\/\//)
  })

  it('points at the action the user probably wanted', () => {
    expect(EXECUTOR).toMatch(/page inside Plexii/)
  })
})

describe('an open-url that cannot apply never becomes a card', () => {
  it('drops a non-URL value', () => {
    expect(isUnapplicableProposal({ kind: 'open-url', url: 'a page for agents to write to' })).toBe(true)
    expect(isUnapplicableProposal({ kind: 'open-url', url: '' })).toBe(true)
    expect(isUnapplicableProposal({ kind: 'open-url' })).toBe(true)
  })

  it('keeps a real web address, http or https', () => {
    expect(isUnapplicableProposal({ kind: 'open-url', url: 'https://example.com' })).toBe(false)
    expect(isUnapplicableProposal({ kind: 'open-url', url: 'http://localhost:3000' })).toBe(false)
  })

  it('leaves every other kind alone — this filter judges possibility, not merit', () => {
    expect(isUnapplicableProposal({ kind: 'create-page' })).toBe(false)
    expect(isUnapplicableProposal({ kind: 'create-task' })).toBe(false)
    expect(isUnapplicableProposal({ kind: 'update-widget' })).toBe(false)
  })
})

describe('the model can express "open the thing that already exists"', () => {
  // The reported failure: "open the email sequences output page in focus view"
  // came back as an open-url carrying a document TITLE, then refused. The three
  // actions that say this properly were all implemented in the executor and
  // none of them was offered to the model, so open-url was the only "open" it had.
  it('offers drill-in-widget for focus view', () => {
    expect(PROMPT).toContain('"kind": "drill-in-widget"')
    expect(PROMPT).toMatch(/open X in focus view/i)
  })

  it('offers focus-widget for showing where something is', () => {
    expect(PROMPT).toContain('"kind": "focus-widget"')
  })

  it('offers navigate-to for going somewhere in Plexii', () => {
    expect(PROMPT).toContain('"kind": "navigate-to"')
  })

  it('tells the model open-url is never the way to open something internal', () => {
    expect(PROMPT).toMatch(/Never use this for anything INSIDE Plexii/)
    expect(PROMPT).toMatch(/drill-in-widget \/ focus-widget \/ navigate-to/)
  })
})
