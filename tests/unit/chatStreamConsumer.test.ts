import { describe, it, expect } from 'vitest'
import type { ChatToolTrace } from '../../src/shared/types'
import { createChatStreamConsumer } from '../../src/main/ai/chatStreamConsumer'

// The loop that turns model output into trace events. Its contract is the whole
// honesty story in miniature: an event fires when — and only when — the model
// has finished writing the thing it describes.
//
// The chunking here is the point. A real stream splits wherever the network
// felt like it, so every test that matters feeds the envelope in pieces that cut
// through keys, escapes and braces.

function run(chunks: string[]): { replies: string[]; tools: ChatToolTrace[]; text: string } {
  const replies: string[] = []
  const tools: ChatToolTrace[] = []
  const consumer = createChatStreamConsumer({
    onReply: (r) => replies.push(r),
    onTool: (t) => tools.push(t)
  })
  for (const c of chunks) consumer.push(c)
  return { replies, tools, text: consumer.text() }
}

// Split a string into chunks of at most `size` characters.
function chunked(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

const ENVELOPE =
  '{"reply":"Drafted the update and a note for the team [1].","actions":[' +
  '{"kind":"compose-mail","to":["ryan@acme.com"],"subject":"Release update","body":"Hi Ryan,\\nHere it is."},' +
  '{"kind":"create-page","title":"Release update","content":"# Release update"}' +
  ']}'

describe('createChatStreamConsumer', () => {
  it('reports the reply once, when its field closes', () => {
    const { replies } = run(chunked(ENVELOPE, 7))
    expect(replies).toEqual(['Drafted the update and a note for the team [1].'])
  })

  it('reports each action as it completes, in arrival order and numbered from zero', () => {
    const { tools } = run(chunked(ENVELOPE, 7))
    expect(tools).toEqual([
      { index: 0, kind: 'compose-mail', label: 'Email draft → Ryan' },
      { index: 1, kind: 'create-page', label: 'Page — Release update' }
    ])
  })

  it('produces identical events whatever the chunk size', () => {
    // One character at a time is the worst case: every boundary is mid-token.
    const oneShot = run([ENVELOPE])
    for (const size of [1, 2, 3, 5, 13, 64]) {
      const split = run(chunked(ENVELOPE, size))
      expect(split.replies).toEqual(oneShot.replies)
      expect(split.tools).toEqual(oneShot.tools)
      expect(split.text).toEqual(oneShot.text)
    }
  })

  it('reports nothing before the thing it describes has finished', () => {
    const replies: string[] = []
    const tools: ChatToolTrace[] = []
    const consumer = createChatStreamConsumer({
      onReply: (r) => replies.push(r),
      onTool: (t) => tools.push(t)
    })

    consumer.push('{"reply":"Drafted the ')
    expect(replies).toEqual([]) // reply field still open
    consumer.push('update.","actions":[')
    expect(replies).toEqual(['Drafted the update.'])
    expect(tools).toEqual([]) // no action has started

    consumer.push('{"kind":"compose-mail","to":["ryan@acme.com"]')
    expect(tools).toEqual([]) // object not closed yet
    consumer.push('}')
    expect(tools).toHaveLength(1)
    expect(tools[0].label).toBe('Email draft → Ryan')
  })

  it('keeps every action that finished when the model is cut off mid-object', () => {
    const truncated =
      '{"reply":"Setting that up.","actions":[' +
      '{"kind":"create-table","title":"Prospects"},' +
      '{"kind":"create-agent","title":"Research agent"},' +
      '{"kind":"add-table-row","cells":{"Company":"cut off here'
    const { replies, tools } = run(chunked(truncated, 9))
    expect(replies).toEqual(['Setting that up.'])
    expect(tools.map((t) => t.kind)).toEqual(['create-table', 'create-agent'])
  })

  it('draws no trace line for an object that is not an action', () => {
    // Junk in the array must not become a line claiming work is happening.
    const { tools } = run(['{"reply":"x","actions":[{"notAKind":1},{"kind":"create-task","title":"A"}]}'])
    expect(tools).toEqual([{ index: 0, kind: 'create-task', label: 'Task — A' }])
  })

  it('reports nothing at all for a reply with no actions', () => {
    const { replies, tools } = run(chunked('{"reply":"Just an answer.","actions":[]}', 4))
    expect(replies).toEqual(['Just an answer.'])
    expect(tools).toEqual([])
  })

  it('is not confused by braces, brackets or escaped quotes inside the prose', () => {
    const tricky =
      '{"reply":"Use {\\"a\\": [1]} and say \\"done\\".","actions":[{"kind":"create-task","title":"A"}]}'
    const { replies, tools } = run(chunked(tricky, 3))
    expect(replies).toEqual(['Use {"a": [1]} and say "done".'])
    expect(tools.map((t) => t.kind)).toEqual(['create-task'])
  })

  it('accumulates the exact text for the whole-envelope parse that runs at the end', () => {
    // The durable result comes from parsing this, not from the streamed events.
    const { text } = run(chunked(ENVELOPE, 11))
    expect(text).toBe(ENVELOPE)
    expect(JSON.parse(text).actions).toHaveLength(2)
  })

  it('exposes its own progress so the caller can branch on it', () => {
    const consumer = createChatStreamConsumer({ onReply: () => {}, onTool: () => {} })
    expect(consumer.replyEmitted()).toBe(false)
    expect(consumer.toolCount()).toBe(0)
    consumer.push(ENVELOPE)
    expect(consumer.replyEmitted()).toBe(true)
    expect(consumer.toolCount()).toBe(2)
  })
})

describe('createChatStreamConsumer — question', () => {
  const QUESTION_ENVELOPE =
    '{"reply":"One thing first.","question":' +
    '{"prompt":"Which desk should this go on?","options":["Marketing desk","A new desk"],"allowFreeText":true},' +
    '"actions":[]}'

  function runWithQuestion(chunks: string[]): {
    events: Array<{ type: 'reply' | 'question' | 'tool'; value: unknown }>
  } {
    const events: Array<{ type: 'reply' | 'question' | 'tool'; value: unknown }> = []
    const consumer = createChatStreamConsumer({
      onReply: (r) => events.push({ type: 'reply', value: r }),
      onTool: (t) => events.push({ type: 'tool', value: t }),
      onQuestion: (q) => events.push({ type: 'question', value: q })
    })
    for (const c of chunks) consumer.push(c)
    return { events }
  }

  it('reports a validated question once, after the reply, whatever the chunk size', () => {
    for (const size of [1, 3, 7, 64, QUESTION_ENVELOPE.length]) {
      const { events } = runWithQuestion(chunked(QUESTION_ENVELOPE, size))
      expect(events.map((e) => e.type)).toEqual(['reply', 'question'])
      expect(events[1].value).toEqual({
        prompt: 'Which desk should this go on?',
        options: ['Marketing desk', 'A new desk'],
        allowFreeText: true
      })
    }
  })

  it('normalises the question through the shared validator, not raw off the wire', () => {
    // Duplicate + empty options are cleaned, allowFreeText defaults true — the
    // event must carry exactly what the durable parse would.
    const { events } = runWithQuestion([
      '{"reply":"x","question":{"prompt":" Which one? ","options":["A","A","","B"]},"actions":[]}'
    ])
    expect(events.filter((e) => e.type === 'question').map((e) => e.value)).toEqual([
      { prompt: 'Which one?', options: ['A', 'B'], allowFreeText: true }
    ])
  })

  it('emits no question event for junk the card could not render', () => {
    // One option is not a choice. The field arrived, the event must not.
    const { events } = runWithQuestion([
      '{"reply":"x","question":{"prompt":"Pick","options":["only one"]},"actions":[]}'
    ])
    expect(events.map((e) => e.type)).toEqual(['reply'])
  })

  it('emits nothing when the envelope has no question', () => {
    const { events } = runWithQuestion(chunked('{"reply":"Just an answer.","actions":[]}', 5))
    expect(events.map((e) => e.type)).toEqual(['reply'])
  })

  it('a consumer without the callback still handles a question envelope', () => {
    // The voice-command shape of the callbacks object — no onQuestion — must
    // keep working against a stream that carries one.
    const { replies, tools } = run(chunked(QUESTION_ENVELOPE, 6))
    expect(replies).toEqual(['One thing first.'])
    expect(tools).toEqual([])
  })

  it('a truncated question never becomes an event', () => {
    const { events } = runWithQuestion([
      '{"reply":"x","question":{"prompt":"cut","options":["a","b'
    ])
    expect(events.map((e) => e.type)).toEqual(['reply'])
  })
})
