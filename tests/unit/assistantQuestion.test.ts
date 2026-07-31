import { describe, it, expect } from 'vitest'
import type { ChatMessage, ChatQuestion } from '../../src/shared/types'
import { activeQuestionFor } from '../../src/renderer/src/lib/assistantQuestion'

// The question card's entire lifecycle is this one derivation: live only while
// the asking message is the thread's last. Answering appends a user turn (card
// gone, record kept); a rewind that re-lasts the message re-opens it; dismiss
// deletes the record (covered at the store level — here that is just "no
// entry"). Pure, so the lifecycle is locked without mounting the panel.

const QUESTION: ChatQuestion = {
  prompt: 'Which desk should this go on?',
  options: ['Marketing desk', 'A new desk'],
  allowFreeText: true
}

function msg(role: 'user' | 'assistant', ts: number): ChatMessage {
  return { role, content: `${role}@${ts}`, ts }
}

describe('activeQuestionFor', () => {
  it('returns the question attached to a last assistant message', () => {
    const messages = [msg('user', 1), msg('assistant', 2)]
    expect(activeQuestionFor(messages, { '2': QUESTION })).toEqual({
      question: QUESTION,
      messageTs: 2
    })
  })

  it('returns null for an empty thread', () => {
    expect(activeQuestionFor([], { '2': QUESTION })).toBeNull()
  })

  it('goes quiet the moment a user turn follows — answering un-lasts the question', () => {
    const messages = [msg('user', 1), msg('assistant', 2), msg('user', 3)]
    expect(activeQuestionFor(messages, { '2': QUESTION })).toBeNull()
  })

  it('an older question is history, not a live prompt', () => {
    const messages = [msg('user', 1), msg('assistant', 2), msg('user', 3), msg('assistant', 4)]
    expect(activeQuestionFor(messages, { '2': QUESTION })).toBeNull()
  })

  it('re-opens when a rewind makes the asking message last again', () => {
    // The same thread after retryFrom rewound past the answer: in this history
    // the question was never answered, so it is honestly live again.
    const rewound = [msg('user', 1), msg('assistant', 2)]
    expect(activeQuestionFor(rewound, { '2': QUESTION })?.messageTs).toBe(2)
  })

  it('returns null when the last assistant message asked nothing', () => {
    const messages = [msg('user', 1), msg('assistant', 2)]
    expect(activeQuestionFor(messages, {})).toBeNull()
    // A question keyed to some other message must not leak onto this turn.
    expect(activeQuestionFor(messages, { '999': QUESTION })).toBeNull()
  })
})
