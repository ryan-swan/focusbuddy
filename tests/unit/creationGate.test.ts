import { describe, it, expect } from 'vitest'
import {
  buildGreenLit,
  gateCreation,
  isBuildAsk,
  isAcceptance,
  offersCreation,
  CREATION_KINDS,
  HELD_BUILD_QUESTION
} from '../../src/main/ai/creationGate'
import type { ActionProposal } from '../../src/shared/types'

// A4, AI-08 — R8's deterministic backstop: "No premature desk creation. The
// conversation grows until Caleb is deliberately prompted ('want me to create
// a desk?') or uses a persistent convert-to-desk control."

const u = (content: string) => ({ role: 'user', content })
const a = (content: string) => ({ role: 'assistant', content })

const buildBatch: ActionProposal[] = [
  { id: 't1', kind: 'create-task', title: 'Wedding hub' },
  { id: 'w1', kind: 'create-widget', widgetKind: 'markdown' as never, title: 'Notes' },
  { id: 'u1', kind: 'open-url', url: 'https://example.com', title: 'Inspo' }
]

describe('isBuildAsk — explicit asks green-light', () => {
  it.each([
    'create the desk',
    'Create the desk', // the offer card's canonical option
    'build it',
    'ok create it',
    'set up the workspace',
    'turn this into a desk',
    'make this real',
    'go ahead and create the desk'
  ])('"%s" is a build ask', (t) => {
    expect(isBuildAsk(t)).toBe(true)
  })

  it.each([
    'make it calmer', // a build verb reaching for a vague "it" must not fire
    'I want a place for guest lists',
    'something colorful',
    'what would the desk look like?'
  ])('"%s" is NOT a build ask', (t) => {
    expect(isBuildAsk(t)).toBe(false)
  })
})

describe('acceptance + offer', () => {
  it('short affirmatives are acceptances', () => {
    for (const t of ['yes', 'Yes, do it', 'sure', 'sounds good', 'go ahead', "let's do it", 'ready']) {
      expect(isAcceptance(t)).toBe(true)
    }
  })
  it('a sentence merely containing "sure" is not', () => {
    expect(isAcceptance('I am not so sure about the colors')).toBe(false)
  })
  it('the taught offer phrasing is detected', () => {
    expect(offersCreation('Want me to create this desk?')).toBe(true)
    expect(offersCreation('Shall I set up the workspace now?')).toBe(true)
    expect(offersCreation('I could create the desk whenever you like.')).toBe(true)
  })
  it('an ordinary question is not an offer', () => {
    expect(offersCreation('What city is the wedding in?')).toBe(false)
  })
})

describe('buildGreenLit — the transcript decides', () => {
  it('an explicit ask in the last user turn green-lights', () => {
    expect(buildGreenLit([u('plan my wedding'), a('tell me more'), u('create the desk')])).toBe(true)
  })

  it('acceptance after a real offer green-lights', () => {
    expect(
      buildGreenLit([u('plan my wedding'), a('Want me to create this desk?'), u('yes')])
    ).toBe(true)
  })

  it('acceptance with no standing offer does NOT green-light', () => {
    expect(buildGreenLit([u('plan my wedding'), a('What city is it in?'), u('yes')])).toBe(false)
  })

  it('an ideation reply does not green-light', () => {
    expect(
      buildGreenLit([u('plan my wedding'), a('Want me to create this desk?'), u('not yet, keep going')])
    ).toBe(false)
  })

  it('empty transcript never green-lights', () => {
    expect(buildGreenLit([])).toBe(false)
  })
})

describe('gateCreation — the backstop', () => {
  it('holds a premature discovery build and offers instead', () => {
    const g = gateCreation({
      proposals: buildBatch,
      question: undefined,
      discovery: true,
      greenLit: false,
      supportsQuestions: true
    })
    // Creation kinds held; the open-url survives (it builds nothing).
    expect(g.proposals.map((p) => p.kind)).toEqual(['open-url'])
    expect(g.question).toEqual(HELD_BUILD_QUESTION)
    expect(g.notice).toMatch(/held/i)
  })

  it('the synthesized offer question green-lights the next turn when tapped', () => {
    // The card's first option is sent verbatim as the user turn.
    expect(isBuildAsk(HELD_BUILD_QUESTION.options[0])).toBe(true)
  })

  it('passes a green-lit discovery build through untouched', () => {
    const g = gateCreation({
      proposals: buildBatch,
      question: undefined,
      discovery: true,
      greenLit: true,
      supportsQuestions: true
    })
    expect(g.proposals).toBe(buildBatch)
    expect(g.notice).toBeNull()
  })

  it('never touches normal chat', () => {
    const g = gateCreation({
      proposals: buildBatch,
      question: undefined,
      discovery: false,
      greenLit: false,
      supportsQuestions: true
    })
    expect(g.proposals).toBe(buildBatch)
    expect(g.notice).toBeNull()
  })

  it('never overrides a question the model genuinely asked', () => {
    const asked = { prompt: 'Which city?', options: ['Austin', 'Denver'], allowFreeText: true }
    const g = gateCreation({
      proposals: buildBatch,
      question: asked,
      discovery: true,
      greenLit: false,
      supportsQuestions: true
    })
    expect(g.question).toBe(asked)
  })

  it('synthesizes no question on surfaces that cannot render one', () => {
    const g = gateCreation({
      proposals: buildBatch,
      question: undefined,
      discovery: true,
      greenLit: false,
      supportsQuestions: false
    })
    expect(g.question).toBeUndefined()
    expect(g.notice).toMatch(/held/i)
  })

  it('a discovery response with no creation kinds is untouched', () => {
    const chatty: ActionProposal[] = [
      { id: 'u1', kind: 'open-url', url: 'https://example.com', title: 'Inspo' }
    ]
    const g = gateCreation({
      proposals: chatty,
      question: undefined,
      discovery: true,
      greenLit: false,
      supportsQuestions: true
    })
    expect(g.proposals).toBe(chatty)
    expect(g.notice).toBeNull()
  })

  it('editing and remembering kinds stay legal mid-discovery', () => {
    for (const k of ['update-task', 'edit-document', 'set-cell', 'create-knowledge-entry', 'compose-mail']) {
      expect(CREATION_KINDS.has(k)).toBe(false)
    }
  })

  it('the desk-building family is the gate', () => {
    for (const k of ['create-task', 'create-widget', 'create-table', 'create-todo-list', 'create-agent', 'link-widgets', 'generate-document']) {
      expect(CREATION_KINDS.has(k)).toBe(true)
    }
  })
})
