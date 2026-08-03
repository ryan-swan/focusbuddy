import { describe, it, expect } from 'vitest'
import {
  QUESTION_MAX_OPTIONS,
  questionProtocolSection,
  validateChatQuestion
} from '../../src/main/ai/chatQuestion'
import { parseChatJson } from '../../src/main/ai/anthropic'

// The clarifying-question protocol: the validator that decides what is
// renderable, the prompt gate that decides which surfaces are taught to ask,
// and the durable parse that carries the question in the completed response.

describe('validateChatQuestion', () => {
  it('accepts a well-formed question and preserves it', () => {
    expect(
      validateChatQuestion({
        prompt: 'Which desk should this go on?',
        options: ['Marketing desk', 'A new desk'],
        allowFreeText: true
      })
    ).toEqual({
      prompt: 'Which desk should this go on?',
      options: ['Marketing desk', 'A new desk'],
      allowFreeText: true
    })
  })

  it('defaults allowFreeText to true when absent, keeps an explicit false', () => {
    const base = { prompt: 'Pick', options: ['A', 'B'] }
    expect(validateChatQuestion(base)?.allowFreeText).toBe(true)
    expect(validateChatQuestion({ ...base, allowFreeText: false })?.allowFreeText).toBe(false)
  })

  it('trims, drops empties and duplicates, and rejects if fewer than 2 real options remain', () => {
    expect(
      validateChatQuestion({ prompt: ' Which one? ', options: [' A ', 'A', '', 'B'] })
    ).toEqual({ prompt: 'Which one?', options: ['A', 'B'], allowFreeText: true })
    // After cleaning: one real option — not a choice.
    expect(validateChatQuestion({ prompt: 'Pick', options: ['A', 'A', ' '] })).toBeNull()
  })

  it('caps the options at the maximum rather than rejecting the whole question', () => {
    const options = ['1', '2', '3', '4', '5', '6', '7']
    const q = validateChatQuestion({ prompt: 'Pick', options })
    expect(q?.options).toEqual(options.slice(0, QUESTION_MAX_OPTIONS))
  })

  it('rejects everything that is not a renderable question', () => {
    expect(validateChatQuestion(undefined)).toBeNull()
    expect(validateChatQuestion(null)).toBeNull()
    expect(validateChatQuestion('ask me')).toBeNull()
    expect(validateChatQuestion([])).toBeNull()
    expect(validateChatQuestion({})).toBeNull()
    expect(validateChatQuestion({ prompt: '', options: ['A', 'B'] })).toBeNull()
    expect(validateChatQuestion({ prompt: 'Pick' })).toBeNull()
    expect(validateChatQuestion({ prompt: 'Pick', options: 'A,B' })).toBeNull()
    expect(validateChatQuestion({ prompt: 'Pick', options: [1, 2] })).toBeNull()
  })
})

describe('questionProtocolSection — the capability gate', () => {
  it('teaches the protocol only when the surface opted in', () => {
    const section = questionProtocolSection(true)
    expect(section).toContain('CLARIFYING QUESTIONS')
    expect(section).toContain('"question"')
    expect(section).toContain('"actions" MUST be []')
  })

  it('returns an empty string for every surface that did not opt in', () => {
    // THE gate. chat:send is shared by the focus chat, dashboard cards, the
    // field editor and StreamDeckAI — none of which render a question card. A
    // model taught to ask there produces turns that dead-end in a question the
    // user cannot see. Undefined is the shape every existing caller sends.
    expect(questionProtocolSection(undefined)).toBe('')
    expect(questionProtocolSection(false)).toBe('')
  })
})

describe('parseChatJson — question in the durable envelope', () => {
  it('returns a validated question alongside reply and proposals', () => {
    const raw = JSON.stringify({
      reply: 'One thing first.',
      question: {
        prompt: 'Which desk should this go on?',
        options: ['Marketing desk', 'A new desk'],
        allowFreeText: true
      },
      actions: []
    })
    const out = parseChatJson(raw)
    expect(out).not.toBeNull()
    expect(out!.reply).toBe('One thing first.')
    expect(out!.question).toEqual({
      prompt: 'Which desk should this go on?',
      options: ['Marketing desk', 'A new desk'],
      allowFreeText: true
    })
    expect(out!.proposals).toHaveLength(0)
  })

  it('leaves question undefined when the envelope has none', () => {
    const out = parseChatJson('{"reply":"hi","actions":[]}')
    expect(out!.question).toBeUndefined()
  })

  it('treats an unrenderable question as never asked', () => {
    const raw = JSON.stringify({
      reply: 'hi',
      question: { prompt: 'Pick', options: ['only one'] },
      actions: []
    })
    expect(parseChatJson(raw)!.question).toBeUndefined()
  })

  it('recovers a complete question from a truncated envelope via salvage', () => {
    const truncated =
      '{"reply":"One thing first.","question":' +
      '{"prompt":"Which desk?","options":["Marketing","A new desk"]},' +
      '"actions":[{"kind":"create-table","ti'
    const out = parseChatJson(truncated)
    expect(out).not.toBeNull()
    expect(out!.truncated).toBe(true)
    expect(out!.question).toEqual({
      prompt: 'Which desk?',
      options: ['Marketing', 'A new desk'],
      allowFreeText: true
    })
  })
})
