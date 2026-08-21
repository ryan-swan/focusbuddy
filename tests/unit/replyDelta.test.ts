import { describe, it, expect } from 'vitest'
import { StreamingEnvelopeScanner } from '../../src/main/ai/streamingEnvelope'
import { createChatStreamConsumer } from '../../src/main/ai/chatStreamConsumer'

// Token-by-token prose (Plexii P3). peekReply is the live view of the reply
// string while it streams; onReplyDelta is its event. The chunking is the
// point, as everywhere in this family: boundaries land mid-key, mid-escape and
// mid-\uXXXX, and a torn escape must never leak to the user as backslash junk.

function chunked(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

describe('StreamingEnvelopeScanner.peekReply', () => {
  it('is null before the reply field opens', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"repl')
    expect(s.peekReply()).toBe(null)
  })

  it('grows with the buffer and matches extractReply once the field closes', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"Hello')
    expect(s.peekReply()).toBe('Hello')
    s.push(' world')
    expect(s.peekReply()).toBe('Hello world')
    s.push('","actions":[]}')
    expect(s.peekReply()).toBe('Hello world')
    expect(s.extractReply()).toBe('Hello world')
  })

  it('never splits a two-char escape at a chunk boundary', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"line one\\')
    // The lone backslash is an incomplete escape — held back, not shown.
    expect(s.peekReply()).toBe('line one')
    s.push('ntwo')
    expect(s.peekReply()).toBe('line one\ntwo')
  })

  it('never splits a \\uXXXX escape at a chunk boundary', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"star \\u26')
    expect(s.peekReply()).toBe('star ')
    s.push('05 done')
    expect(s.peekReply()).toBe('star ★ done')
  })

  it('does not read past the closing quote into the rest of the envelope', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"short","actions":[{"kind":"create-page","title":"T"}]}')
    expect(s.peekReply()).toBe('short')
  })
})

describe('createChatStreamConsumer onReplyDelta', () => {
  const ENVELOPE =
    '{"reply":"Drafted the update \\u2014 done.","actions":[' +
    '{"kind":"create-page","title":"Release update","content":"# Release update"}' +
    ']}'

  function run(chunks: string[]): { deltas: string[]; replies: string[] } {
    const deltas: string[] = []
    const replies: string[] = []
    const consumer = createChatStreamConsumer({
      onReply: (r) => replies.push(r),
      onReplyDelta: (t) => deltas.push(t),
      onTool: () => {}
    })
    for (const c of chunks) consumer.push(c)
    return { deltas, replies }
  }

  it('emits cumulative, strictly-growing prose and stops once the reply closes', () => {
    const { deltas, replies } = run(chunked(ENVELOPE, 5))
    expect(replies).toEqual(['Drafted the update — done.'])
    expect(deltas.length).toBeGreaterThan(1)
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i].length).toBeGreaterThan(deltas[i - 1].length)
      expect(deltas[i].startsWith(deltas[i - 1])).toBe(true)
    }
    // Every delta is a prefix of the final reply; none leaks envelope syntax.
    for (const d of deltas) {
      expect('Drafted the update — done.'.startsWith(d)).toBe(true)
    }
    // Nothing fires after the reply closed — the last delta predates the close.
    expect(deltas[deltas.length - 1].length).toBeLessThanOrEqual(
      'Drafted the update — done.'.length
    )
  })

  it('emits nothing when the listener is absent (pre-existing sequence intact)', () => {
    const replies: string[] = []
    const consumer = createChatStreamConsumer({
      onReply: (r) => replies.push(r),
      onTool: () => {}
    })
    for (const c of chunked(ENVELOPE, 5)) consumer.push(c)
    expect(replies).toEqual(['Drafted the update — done.'])
  })

  it('stays silent while chunks grow only non-reply fields', () => {
    const deltas: string[] = []
    const consumer = createChatStreamConsumer({
      onReply: () => {},
      onReplyDelta: (t) => deltas.push(t),
      onTool: () => {}
    })
    consumer.push('{"reply":"done","actions":[')
    const count = deltas.length
    consumer.push('{"kind":"create-page","title":"A"},')
    consumer.push('{"kind":"create-page","title":"B"}]}')
    expect(deltas.length).toBe(count)
  })
})
